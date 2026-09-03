from datetime import timedelta

import pytest
from django.utils import timezone

from plane.app.helpdesk import recurrence
from plane.db.models import Project, Workspace, WorkspaceMember
from plane.db.models.helpdesk import (
    HelpdeskCustomer,
    HelpdeskPortal,
    HelpdeskRecurrenceMatchType,
    HelpdeskRequest,
    HelpdeskRequestIssue,
    HelpdeskRequestRecurrence,
)


@pytest.fixture
def portal(workspace):
    return HelpdeskPortal.objects.create(workspace=workspace, public_slug="rec-portal")


@pytest.fixture
def customer(workspace):
    customer = HelpdeskCustomer.objects.create(
        email="repeat@example.com", name="Repeat Customer", workspace=workspace
    )
    customer.set_password("x")
    customer.save()
    return customer


def make_request(portal, title, created_at=None, **kwargs):
    req = HelpdeskRequest.objects.create(
        workspace=portal.workspace, portal=portal, title=title, **kwargs
    )
    if created_at:
        # created_at is auto_now_add, so it has to be forced after insert.
        HelpdeskRequest.objects.filter(pk=req.pk).update(created_at=created_at)
        req.refresh_from_db()
    return req


@pytest.mark.unit
class TestNormalization:
    def test_strips_stacked_reply_markers(self):
        assert recurrence.normalize_title("Re: Fwd: Enc: servidor fora do ar") == recurrence.normalize_title(
            "servidor fora do ar"
        )

    def test_strips_bracketed_ticket_ids(self):
        assert recurrence.normalize_title("[TICKET-42] servidor fora do ar") == recurrence.normalize_title(
            "servidor fora do ar"
        )

    def test_folds_accents_so_the_same_word_matches(self):
        assert recurrence.normalize_title("impressão não funciona") == recurrence.normalize_title(
            "impressao nao funciona"
        )

    def test_drops_stopwords_and_bare_numbers(self):
        assert recurrence.normalize_title("Erro ao emitir a nota 12345") == {"emitir", "nota"}

    def test_empty_title_yields_no_tokens(self):
        assert recurrence.normalize_title("") == set()
        assert recurrence.normalize_title(None) == set()


@pytest.mark.unit
class TestSimilarity:
    def test_identical_titles_score_one(self):
        assert recurrence.title_similarity("Servidor fora do ar", "Servidor fora do ar") == 1.0

    def test_unrelated_titles_score_zero(self):
        assert recurrence.title_similarity("Servidor fora do ar", "Resetar senha do email") == 0.0

    def test_titles_of_only_stopwords_cannot_match_each_other(self):
        """Otherwise "Ajuda por favor" would match every other vague ticket."""
        assert recurrence.title_similarity("Ajuda por favor", "Por favor ajuda") == 0.0

    def test_partial_overlap_lands_between(self):
        score = recurrence.title_similarity(
            "Impressora do setor fiscal travando", "Impressora travando"
        )
        assert 0 < score < 1


@pytest.mark.unit
@pytest.mark.django_db
class TestSameCustomerSimilar:
    def test_links_a_repeat_ticket_from_the_same_customer(self, portal, customer):
        now = timezone.now()
        first = make_request(portal, "Impressora fiscal travando", created_at=now - timedelta(days=3), customer=customer)
        second = make_request(portal, "Impressora fiscal travando de novo", customer=customer)

        links = recurrence.detect_recurrence(second)

        assert len(links) == 1
        assert links[0].related_request_id == first.id
        assert links[0].match_type == HelpdeskRecurrenceMatchType.SAME_CUSTOMER_SIMILAR
        assert links[0].score > 0

    def test_matches_on_contact_email_when_there_is_no_customer_record(self, portal):
        now = timezone.now()
        first = make_request(
            portal, "Impressora fiscal travando", created_at=now - timedelta(days=1), contact_email="anon@example.com"
        )
        second = make_request(portal, "Impressora fiscal travando", contact_email="ANON@example.com")

        links = recurrence.detect_recurrence(second)
        assert [link.related_request_id for link in links] == [first.id]

    def test_ignores_a_different_customer_with_the_same_problem(self, portal, customer, workspace):
        other = HelpdeskCustomer.objects.create(email="other@example.com", name="Other", workspace=workspace)
        other.set_password("x")
        other.save()

        now = timezone.now()
        make_request(portal, "Impressora fiscal travando", created_at=now - timedelta(days=1), customer=other)
        second = make_request(portal, "Impressora fiscal travando", customer=customer)

        assert recurrence.detect_recurrence(second) == []

    def test_ignores_tickets_older_than_the_window(self, portal, customer):
        now = timezone.now()
        make_request(
            portal,
            "Impressora fiscal travando",
            created_at=now - timedelta(days=90),
            customer=customer,
        )
        second = make_request(portal, "Impressora fiscal travando", customer=customer)

        assert recurrence.detect_recurrence(second) == []

    def test_ignores_a_dissimilar_ticket_from_the_same_customer(self, portal, customer):
        now = timezone.now()
        make_request(portal, "Resetar minha senha", created_at=now - timedelta(days=1), customer=customer)
        second = make_request(portal, "Impressora fiscal travando", customer=customer)

        assert recurrence.detect_recurrence(second) == []

    def test_an_anonymous_ticket_matches_nothing(self, portal):
        make_request(portal, "Impressora fiscal travando")
        second = make_request(portal, "Impressora fiscal travando")

        assert recurrence.detect_recurrence(second) == []

    def test_does_not_reach_across_workspaces(self, portal, customer, create_user):
        """Two workspaces can hold the same customer email; their tickets must not mix."""
        other_ws = Workspace.objects.create(name="Other", owner=create_user, slug="other-ws")
        WorkspaceMember.objects.create(workspace=other_ws, member=create_user, role=20)
        other_portal = HelpdeskPortal.objects.create(workspace=other_ws, public_slug="other-portal")

        now = timezone.now()
        make_request(
            other_portal,
            "Impressora fiscal travando",
            created_at=now - timedelta(days=1),
            contact_email="repeat@example.com",
        )
        second = make_request(portal, "Impressora fiscal travando", contact_email="repeat@example.com")

        assert recurrence.detect_recurrence(second) == []

    def test_running_twice_does_not_duplicate_the_link(self, portal, customer):
        now = timezone.now()
        make_request(portal, "Impressora fiscal travando", created_at=now - timedelta(days=1), customer=customer)
        second = make_request(portal, "Impressora fiscal travando", customer=customer)

        recurrence.detect_recurrence(second)
        recurrence.detect_recurrence(second)

        assert HelpdeskRequestRecurrence.objects.filter(request=second).count() == 1


@pytest.mark.unit
@pytest.mark.django_db
class TestSharedIssue:
    @pytest.fixture
    def issue(self, workspace, create_user):
        from plane.db.models import Issue, State

        project = Project.objects.create(
            name="Proj", identifier="PROJ", workspace=workspace, created_by=create_user
        )
        state = State.objects.create(name="Todo", project=project, workspace=workspace)
        return Issue.objects.create(name="Root cause", project=project, workspace=workspace, state=state)

    def test_links_two_tickets_pointing_at_the_same_work_item(self, portal, issue):
        now = timezone.now()
        first = make_request(portal, "Nota fiscal rejeitada", created_at=now - timedelta(days=2))
        second = make_request(portal, "Cupom nao emite")

        for req in (first, second):
            HelpdeskRequestIssue.objects.create(request=req, issue=issue, workspace=portal.workspace)

        links = recurrence.detect_recurrence(second)

        assert len(links) == 1
        assert links[0].match_type == HelpdeskRecurrenceMatchType.SHARED_ISSUE
        assert links[0].score == 1.0

    def test_the_newer_ticket_is_always_the_one_that_repeats(self, portal, issue):
        """Direction must follow creation time, not the order detection ran in."""
        now = timezone.now()
        older = make_request(portal, "Primeiro", created_at=now - timedelta(days=5))
        newer = make_request(portal, "Segundo")

        for req in (older, newer):
            HelpdeskRequestIssue.objects.create(request=req, issue=issue, workspace=portal.workspace)

        # Run detection from the OLDER ticket; the link should still point
        # newer -> older.
        links = recurrence.detect_recurrence(older)

        assert len(links) == 1
        assert links[0].request_id == newer.id
        assert links[0].related_request_id == older.id

    def test_a_lone_ticket_on_an_issue_links_to_nothing(self, portal, issue):
        only = make_request(portal, "Sozinho")
        HelpdeskRequestIssue.objects.create(request=only, issue=issue, workspace=portal.workspace)

        assert recurrence.detect_recurrence(only) == []


@pytest.mark.unit
@pytest.mark.django_db
class TestAnnotations:
    def test_is_recurrent_flags_only_the_repeat_ticket(self, portal, customer):
        now = timezone.now()
        first = make_request(portal, "Impressora fiscal travando", created_at=now - timedelta(days=1), customer=customer)
        second = make_request(portal, "Impressora fiscal travando", customer=customer)
        recurrence.detect_recurrence(second)

        flags = {
            row.id: row.is_recurrent
            for row in recurrence.annotate_is_recurrent(HelpdeskRequest.objects.all())
        }
        assert flags[second.id] is True
        assert flags[first.id] is False

    def test_recurrence_count_reports_how_many_tickets_are_repeated(self, portal, customer):
        now = timezone.now()
        make_request(portal, "Impressora fiscal travando", created_at=now - timedelta(days=2), customer=customer)
        make_request(portal, "Impressora fiscal travando", created_at=now - timedelta(days=1), customer=customer)
        third = make_request(portal, "Impressora fiscal travando", customer=customer)
        recurrence.detect_recurrence(third)

        counts = {
            row.id: row.recurrence_count
            for row in recurrence.annotate_recurrence_count(HelpdeskRequest.objects.all())
        }
        assert counts[third.id] == 2

    def test_recurrence_count_is_zero_not_null_for_a_fresh_ticket(self, portal):
        req = make_request(portal, "Novo")
        row = recurrence.annotate_recurrence_count(HelpdeskRequest.objects.filter(pk=req.pk)).first()
        assert row.recurrence_count == 0
