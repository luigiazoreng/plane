"""Authenticity of the *sender* of an inbound email.

This module answers "is the From: address really who it claims to be?".
It is deliberately **not** part of :mod:`plane.app.helpdesk.inbound_security`,
which answers a different question: "did this request really come from our
email provider?" (the shared webhook secret).

Confusing the two is literally the cause of SR-002. The shared secret proves
the *transport*; it says nothing about the sender, because the provider
attaches that same secret when forwarding a message that anyone on the
internet sent to the public Inbound Parse address. Keeping the two concerns in
separate modules is what makes that mistake hard to repeat by accident.

Every function here is pure -- no Django, no database, no settings lookup --
so the whole verdict is testable without a test database.

Verdict states (see D3 of the fix plan):

``pass``
    A signature covers a domain that is aligned with the ``From:`` domain.
``fail``
    A usable signal existed and no aligned ``pass`` was found among them.
``unverified``
    Nothing usable to check: no signal, unrecognised format, signal without a
    domain, or an ``Authentication-Results`` header rejected by the guards.
``not_applicable``
    Default for comments that did not come from the inbound webhook at all.

The distinction between ``fail`` and ``unverified`` is what lets an operator
tell "we checked and it was refused" (an attack) from "we had nothing to
check" (a broken integration). Those call for opposite responses, which is
why this is not a boolean.
"""

# Python imports
import logging
import re
from typing import List, Optional, Tuple

logger = logging.getLogger("plane.worker")

# These literals are duplicated by HelpdeskRequestComment.SenderVerification.
# The duplication is deliberate -- it keeps plane.db.models from importing
# plane.app -- and test_states_match_the_model_choices is what keeps the two
# from drifting apart.
PASS = "pass"
FAIL = "fail"
UNVERIFIED = "unverified"
NOT_APPLICABLE = "not_applicable"

# SendGrid documents the dkim field as ``{@domain.com : pass}``. The optional
# "@" and the tolerance for several braces in one value are hedges against the
# exact wording drifting: with Authentication-Results barred from producing a
# pass, this field is the single source of `pass`, so a parser that is too
# literal would silently send 100% of agents to `unverified`.
_BRACED_RESULT = re.compile(r"\{\s*@?([^\s:{}]+)\s*:\s*([A-Za-z]+)\s*\}")

# Only "dkim=<result> ... header.d=<domain>" yields a usable entry from an
# Authentication-Results header. See _parse_authentication_results.
_AR_DKIM = re.compile(
    r"\bdkim\s*=\s*([A-Za-z]+)((?:\s+[^\s;]+)*)", re.IGNORECASE
)
_AR_HEADER_D = re.compile(r"\bheader\.d\s*=\s*([^\s;]+)", re.IGNORECASE)
_AR_LINE = re.compile(r"^Authentication-Results:(.*)$", re.IGNORECASE | re.MULTILINE)

# A (result, domain) pair. The domain is "" when the signal carries none.
Signal = Tuple[str, str]


def _domain_of(email: str) -> str:
    """Return the domain part of an address, or "" when there is not one."""
    if not isinstance(email, str) or email.count("@") != 1:
        return ""
    return email.rsplit("@", 1)[1].strip().lower()


def is_aligned(signing_domain: str, from_domain: str) -> bool:
    """DMARC-style alignment between the signing domain and the From: domain.

    DKIM proves the domain that *signed* (``d=``), which need not be the domain
    in ``From:``. Reading a bare "it passed" closes nothing: an attacker
    legitimately signs ``d=attacker.com`` while forging
    ``From: agent@company.com`` -- DKIM passes and the From: is still a lie.

    ``from_domain`` may be a **subdomain** of the signer
    (``agent@mail.company.com`` signed by ``d=company.com``), which is common
    and not exploitable without the key. The reverse is rejected: a signer on a
    subdomain does not vouch for the parent domain. That is stricter than
    DMARC's "relaxed" mode on purpose -- real relaxed alignment needs the
    Public Suffix List, which this project does not carry.

    The two-label floor on the signer stops ``d=com`` from aligning with
    everything. ``d=co.uk`` would clear it, but exploiting that needs the DKIM
    key for ``co.uk``. The floor is hygiene, not the defence.
    """
    if not signing_domain or not from_domain:
        return False
    if signing_domain.count(".") < 1:
        return False
    if signing_domain == from_domain:
        return True
    return from_domain.endswith("." + signing_domain)


def _parse_braced_field(value) -> List[Signal]:
    """Parse a ``{@domain : result}`` field into signals.

    Anything that is not a string yields no signals rather than raising: the
    payload is attacker-controlled and a 500 here would make the provider
    redeliver in a loop.
    """
    if not isinstance(value, str):
        return []
    return [
        (result.strip().lower(), domain.strip().lower())
        for domain, result in _BRACED_RESULT.findall(value)
    ]


def _parse_authentication_results(headers_str, authserv_id) -> List[Signal]:
    """Read Authentication-Results defensively. Never yields a ``pass``.

    ``headers_str`` is the message as *received* -- written by whoever sent the
    email, i.e. potentially the attacker. So this source is capped at ``fail``
    (D2 rule 2): every ``pass`` it might carry is discarded here, which
    eliminates the forgery vector by construction rather than by parser
    quality. The only lever the header gives the sender points at himself --
    planting a ``fail`` removes his own attribution, and he gains nothing.

    Three further guards, per RFC 7601 §5:

    * the authserv-id must match the configured pin, so a header written
      outside our trust boundary is not read at all;
    * more than one occurrence means injection -- the first line proves
      nothing, which is exactly why ``_extract_header``'s first-match
      ``search()`` must not be reused here;
    * only ``dkim=<result> ... header.d=<domain>`` yields a usable signal.
      A forwarded message routinely carries ``spf=fail smtp.mailfrom=...``;
      treating that as ``fail`` would report an attack where there was only a
      forward, degrading the very distinction this verdict exists to draw.
    """
    if not isinstance(headers_str, str) or not headers_str:
        return []
    if not isinstance(authserv_id, str) or not authserv_id.strip():
        return []

    lines = _AR_LINE.findall(headers_str)
    if len(lines) != 1:
        # Zero: nothing to read. More than one: injection.
        return []

    body = lines[0].strip()
    head, _, remainder = body.partition(";")
    if head.strip().lower() != authserv_id.strip().lower():
        return []

    signals = []
    for result, tail in _AR_DKIM.findall(remainder):
        if result.strip().lower() == PASS:
            # The ceiling. This source can never vouch for anyone.
            continue
        domain_match = _AR_HEADER_D.search(tail)
        if not domain_match:
            continue
        signals.append((result.strip().lower(), domain_match.group(1).strip().lower()))
    return signals


def verify_sender_authenticity(
    *,
    from_email: str,
    dkim_field=None,
    spf_field=None,
    headers_str="",
    authserv_id: Optional[str] = "",
) -> str:
    """Return ``pass``/``fail``/``unverified`` for the claimed sender.

    Never raises and never returns ``not_applicable``: any unexpected input
    degrades to ``unverified``. A 500 on this path would make the provider
    redeliver forever, the same reason ``_discard`` answers 200.

    Callers must branch on ``== PASS``, never on ``!= FAIL`` -- the latter
    would let ``unverified`` grant attribution, which is precisely the hole.
    """
    try:
        from_domain = _domain_of(from_email)
        if not from_domain:
            return UNVERIFIED

        # The primary source is the only one that can vouch for anyone. The
        # SPF field is documented as a bare verdict with no domain, so in
        # practice it contributes nothing -- kept uniform in case it ever
        # carries one, since without a domain there is no alignment to check.
        signals = _parse_braced_field(dkim_field) + _parse_braced_field(spf_field)
        signals += _parse_authentication_results(headers_str, authserv_id)

        # Only signals carrying a domain can be reasoned about at all.
        usable = [(result, domain) for result, domain in signals if domain]
        if not usable:
            return UNVERIFIED

        # Step 3 before step 4: this ordering is the DMARC OR. SPF breaks on
        # legitimate forwarding while DKIM survives, so one aligned pass is
        # enough and a sibling failure must not override it.
        if any(
            result == PASS and is_aligned(domain, from_domain)
            for result, domain in usable
        ):
            return PASS

        return FAIL
    except Exception:
        # Structured so a format drift is alertable by count. The rate of
        # `pass` among agent comments falling to zero is the symptom to watch:
        # it distinguishes a payload format change from an isolated attack.
        logger.warning(
            "helpdesk inbound: sender authenticity check failed",
            extra={"detail": "sender_authenticity_error"},
            exc_info=True,
        )
        return UNVERIFIED
