"""Detection of repeat tickets ("reincidência").

Two independent signals, both stored as ``HelpdeskRequestRecurrence`` rows so an
agent can see *why* two tickets were tied together:

``same_customer_similar``
    The same customer opened a similar ticket recently. Similarity is token
    overlap between the two titles. Postgres trigram would be the obvious tool,
    but ``pg_trgm`` is not installed anywhere in this project and enabling an
    extension in a migration needs superuser rights on the deploy target -- so
    the comparison runs in Python over a bounded candidate set instead.

``shared_issue``
    Both tickets point at the same work item through ``HelpdeskRequestIssue``.
    Not a heuristic: if two tickets were linked to one issue, somebody already
    decided they share a root cause.

Only the title is compared. Descriptions on email-sourced tickets carry quoted
threads and signatures, which drown the actual subject in boilerplate.
"""

import re
import unicodedata
from datetime import timedelta

from django.db.models import Count, Exists, IntegerField, OuterRef, Subquery, Value
from django.db.models.functions import Coalesce

from plane.db.models.helpdesk import (
    HelpdeskRecurrenceMatchType,
    HelpdeskRequest,
    HelpdeskRequestIssue,
    HelpdeskRequestRecurrence,
)

# How far back to look for a previous ticket from the same customer.
RECURRENCE_WINDOW_DAYS = 30

# Jaccard overlap above which two titles are treated as the same problem.
SIMILARITY_THRESHOLD = 0.4

# Ceiling on how many earlier tickets are compared, newest first. A customer
# with thousands of tickets must not turn ticket creation into a table scan.
CANDIDATE_LIMIT = 50

# Reply/forward markers in the languages this instance actually sees, plus the
# bracketed ticket ids mail clients keep appending. Left in place they inflate
# the overlap between two otherwise unrelated tickets.
_SUBJECT_NOISE = re.compile(
    r"^\s*(re|res|ref|fw|fwd|enc|encaminhado|in|automatic reply)\s*[:\-]\s*",
    re.IGNORECASE,
)
_BRACKETED = re.compile(r"[\[\(][^\]\)]*[\]\)]")
_NON_WORD = re.compile(r"[^\w\s]", re.UNICODE)

# Words that carry no signal about *which* problem a ticket is about.
_STOPWORDS = {
    # pt
    "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e",
    "em", "for", "na", "nao", "nas", "no", "nos", "o", "os", "ou", "para", "pelo",
    "por", "que", "se", "sem", "ser", "sobre", "sua", "seu", "um", "uma", "esta",
    "este", "isso", "mais", "muito", "nova", "novo", "favor", "gentileza",
    "solicitacao", "chamado", "ticket", "suporte", "ajuda", "problema", "erro",
    "duvida", "urgente",
    # en
    "an", "and", "are", "at", "be", "but", "by", "can", "for", "from", "has",
    "have", "in", "is", "it", "of", "on", "or", "the", "this", "to", "with",
    "please", "help", "issue", "request", "support", "error", "problem",
}

_MIN_TOKEN_LENGTH = 3


def normalize_title(title):
    """Lowercase, de-accent and strip a title down to meaningful tokens."""
    if not title:
        return set()

    text = _SUBJECT_NOISE.sub("", title)
    # Reply chains stack the markers: "Re: Fwd: Re: ...".
    while True:
        stripped = _SUBJECT_NOISE.sub("", text)
        if stripped == text:
            break
        text = stripped

    text = _BRACKETED.sub(" ", text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = _NON_WORD.sub(" ", text.lower())

    return {
        token
        for token in text.split()
        if len(token) >= _MIN_TOKEN_LENGTH and token not in _STOPWORDS and not token.isdigit()
    }


def title_similarity(left, right):
    """Jaccard overlap of two titles, 0..1."""
    left_tokens = normalize_title(left)
    right_tokens = normalize_title(right)
    if not left_tokens or not right_tokens:
        return 0.0
    union = left_tokens | right_tokens
    return len(left_tokens & right_tokens) / len(union)


def _customer_scope(helpdesk_request):
    """Filter kwargs identifying the same customer, or ``None`` if anonymous."""
    if helpdesk_request.customer_id:
        return {"customer_id": helpdesk_request.customer_id}
    if helpdesk_request.contact_email:
        return {"contact_email__iexact": helpdesk_request.contact_email}
    return None


def find_same_customer_similar(helpdesk_request, window_days=RECURRENCE_WINDOW_DAYS, threshold=SIMILARITY_THRESHOLD):
    """Earlier tickets from the same customer whose title matches. ``[(request, score)]``."""
    scope = _customer_scope(helpdesk_request)
    if not scope:
        return []

    reference = helpdesk_request.created_at
    if reference is None:
        return []

    candidates = (
        HelpdeskRequest.objects.filter(
            workspace_id=helpdesk_request.workspace_id,
            created_at__gte=reference - timedelta(days=window_days),
            created_at__lt=reference,
            deleted_at__isnull=True,
            **scope,
        )
        .exclude(pk=helpdesk_request.pk)
        .only("id", "title", "created_at")
        .order_by("-created_at")[:CANDIDATE_LIMIT]
    )

    matches = []
    for candidate in candidates:
        score = title_similarity(helpdesk_request.title, candidate.title)
        if score >= threshold:
            matches.append((candidate, score))
    return matches


def find_shared_issue(helpdesk_request):
    """Other tickets linked to any of this ticket's work items. ``[(request, 1.0)]``."""
    issue_ids = list(
        HelpdeskRequestIssue.objects.filter(request=helpdesk_request, deleted_at__isnull=True).values_list(
            "issue_id", flat=True
        )
    )
    if not issue_ids:
        return []

    related_ids = (
        HelpdeskRequestIssue.objects.filter(
            issue_id__in=issue_ids,
            deleted_at__isnull=True,
            request__workspace_id=helpdesk_request.workspace_id,
        )
        .exclude(request_id=helpdesk_request.pk)
        .values_list("request_id", flat=True)
        .distinct()
    )

    related = HelpdeskRequest.objects.filter(pk__in=list(related_ids), deleted_at__isnull=True).only(
        "id", "title", "created_at"
    )
    return [(candidate, 1.0) for candidate in related]


def _record(helpdesk_request, related, match_type, score):
    # Links are directional: the newer ticket repeats the older one. The
    # same-customer detector only ever yields older candidates, but a shared
    # issue can be attached to an old ticket long after a newer one exists, so
    # normalize here rather than trusting call order.
    newer, older = helpdesk_request, related
    if related.created_at and helpdesk_request.created_at and related.created_at > helpdesk_request.created_at:
        newer, older = related, helpdesk_request

    link, created = HelpdeskRequestRecurrence.objects.get_or_create(
        request=newer,
        related_request=older,
        match_type=match_type,
        deleted_at__isnull=True,
        defaults={
            "workspace_id": newer.workspace_id,
            "score": score,
        },
    )
    if not created and link.score != score:
        link.score = score
        link.save(update_fields=["score", "updated_at"])
    return link


def detect_recurrence(helpdesk_request, window_days=RECURRENCE_WINDOW_DAYS, threshold=SIMILARITY_THRESHOLD):
    """Run both detectors for a ticket and persist what they find.

    Idempotent: re-running updates scores instead of duplicating links.
    """
    links = []

    for related, score in find_same_customer_similar(
        helpdesk_request, window_days=window_days, threshold=threshold
    ):
        links.append(_record(helpdesk_request, related, HelpdeskRecurrenceMatchType.SAME_CUSTOMER_SIMILAR, score))

    for related, score in find_shared_issue(helpdesk_request):
        links.append(_record(helpdesk_request, related, HelpdeskRecurrenceMatchType.SHARED_ISSUE, score))

    return links


def annotate_is_recurrent(queryset):
    """Annotate ``is_recurrent`` so the list endpoint can filter on it."""
    return queryset.annotate(
        is_recurrent=Exists(
            HelpdeskRequestRecurrence.objects.filter(request=OuterRef("pk"), deleted_at__isnull=True)
        )
    )


def annotate_recurrence_count(queryset):
    """Annotate ``recurrence_count`` -- how many earlier tickets this one repeats.

    A subquery rather than ``Count`` over a join: the request queryset already
    joins assignees and labels, and adding a third multi-valued join would
    multiply the rows and inflate every other aggregate on it.
    """
    counts = (
        HelpdeskRequestRecurrence.objects.filter(request=OuterRef("pk"), deleted_at__isnull=True)
        .order_by()
        .values("request")
        .annotate(total=Count("id"))
        .values("total")
    )
    return queryset.annotate(
        recurrence_count=Coalesce(Subquery(counts, output_field=IntegerField()), Value(0))
    )
