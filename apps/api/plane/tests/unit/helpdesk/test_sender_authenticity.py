# Third-party imports
from django.test import SimpleTestCase

# Module imports
from plane.app.helpdesk.sender_authenticity import (
    FAIL,
    NOT_APPLICABLE,
    PASS,
    UNVERIFIED,
    verify_sender_authenticity,
)

AUTHSERV = "mx.sendgrid.net"


def verify(**kwargs):
    """Call the verifier with the defaults every test would otherwise repeat."""
    kwargs.setdefault("from_email", "agente@empresa.com")
    kwargs.setdefault("dkim_field", None)
    kwargs.setdefault("spf_field", None)
    kwargs.setdefault("headers_str", "")
    kwargs.setdefault("authserv_id", AUTHSERV)
    return verify_sender_authenticity(**kwargs)


class TestSenderAuthenticity(SimpleTestCase):
    """Grupo A do fix-plan do SR-002: veredito de autenticidade do remetente.

    SimpleTestCase, não TestCase: as funções são puras e não tocam o banco.
    """

    # --- A1: DKIM alinhado produz pass -----------------------------------

    def test_a1_aligned_dkim_produces_pass(self):
        self.assertEqual(verify(dkim_field="{@empresa.com : pass}"), PASS)

    def test_a1_multiple_dkim_entries_are_all_considered(self):
        """S1: mensagem com várias assinaturas.

        Um parser de entrada única lê só a primeira e devolve `fail` aqui.
        Sem este caso, esse parser passaria em todos os outros testes.
        """
        self.assertEqual(
            verify(dkim_field="{@outro.com : fail}{@empresa.com : pass}"), PASS
        )

    def test_a1_domain_without_at_sign_is_still_parsed(self):
        """S1: tolerância a uma segunda grafia plausível do campo."""
        self.assertEqual(verify(dkim_field="{empresa.com : pass}"), PASS)

    # --- A2: DKIM válido mas desalinhado produz fail (coração do D4) ------

    def test_a2_valid_but_misaligned_dkim_produces_fail(self):
        """O atacante assina legitimamente o próprio domínio e forja o From:.

        Uma implementação que só procura `: pass` passa em A1 e falha aqui.
        """
        self.assertEqual(verify(dkim_field="{@atacante.com : pass}"), FAIL)

    def test_a2_alignment_is_case_insensitive(self):
        self.assertEqual(
            verify(dkim_field="{@EMPRESA.COM : PASS}", from_email="agente@empresa.com"),
            PASS,
        )

    # --- A3: SPF sem domínio nunca produz pass ---------------------------

    def test_a3_bare_spf_pass_never_produces_pass(self):
        """Veredito nu, sem domínio: não há alinhamento a verificar."""
        self.assertEqual(verify(spf_field="pass"), UNVERIFIED)

    def test_a3_bare_spf_fail_is_unverified_not_fail(self):
        """C2: sem domínio não se afirma "checamos e reprovou"."""
        self.assertEqual(verify(spf_field="fail"), UNVERIFIED)

    # --- A4: A-R pode produzir fail, nunca pass --------------------------

    def test_a4_authentication_results_can_produce_fail(self):
        headers = f"Authentication-Results: {AUTHSERV}; dkim=fail header.d=atacante.com"
        self.assertEqual(verify(headers_str=headers), FAIL)

    def test_a4_authentication_results_pass_is_unverified_not_pass(self):
        """D2 regra 2: o A-R jamais produz `pass`, nem com authserv-id válido.

        É o header que o atacante escreve no próprio email. O teto de `fail`
        elimina o vetor por construção, não por qualidade de parser.
        """
        headers = f"Authentication-Results: {AUTHSERV}; dkim=pass header.d=empresa.com"
        self.assertEqual(verify(headers_str=headers), UNVERIFIED)

    def test_a4_primary_pass_beats_secondary_fail(self):
        """C2 precedência: passo 3 antes do passo 4, preservando o OU do DMARC.

        Encaminhamento legítimo quebra SPF e preserva DKIM. Se um `fail` do A-R
        vencesse, todo agente com mensagem encaminhada perderia actor e anexos.
        """
        headers = f"Authentication-Results: {AUTHSERV}; spf=fail smtp.mailfrom=relay.com"
        self.assertEqual(
            verify(dkim_field="{@empresa.com : pass}", headers_str=headers), PASS
        )

    def test_a4_forwarded_spf_fail_does_not_report_an_attack(self):
        """C2: `spf=fail` de encaminhamento é unverified, não fail.

        Sem isto a coluna dos Email logs acusa ataque onde houve forward.
        """
        headers = f"Authentication-Results: {AUTHSERV}; spf=fail smtp.mailfrom=relay.com"
        self.assertEqual(verify(headers_str=headers), UNVERIFIED)

    # --- A5: degradação — nunca levanta, nunca pass ----------------------

    def test_a5_no_signal_at_all_is_unverified(self):
        self.assertEqual(verify(), UNVERIFIED)

    def test_a5_garbage_dkim_never_raises_and_never_passes(self):
        for garbage in ("???", None, [], {}, 42, "{}", "{@ : }", object()):
            with self.subTest(garbage=repr(garbage)):
                self.assertEqual(verify(dkim_field=garbage), UNVERIFIED)

    def test_a5_from_email_without_at_is_unverified(self):
        self.assertEqual(
            verify(from_email="nao-e-um-email", dkim_field="{@empresa.com : pass}"),
            UNVERIFIED,
        )

    def test_a5_empty_from_email_is_unverified(self):
        self.assertEqual(
            verify(from_email="", dkim_field="{@empresa.com : pass}"), UNVERIFIED
        )

    def test_a5_garbage_headers_never_raise(self):
        for garbage in (None, [], {}, 42):
            with self.subTest(garbage=repr(garbage)):
                self.assertEqual(verify(headers_str=garbage), UNVERIFIED)

    # --- A6: guarda de sufixo e direção do alinhamento -------------------

    def test_a6_single_label_domain_never_aligns(self):
        """`d=com` não pode alinhar com o mundo inteiro."""
        self.assertEqual(verify(dkim_field="{@com : pass}"), FAIL)

    def test_a6_from_may_be_a_subdomain_of_the_signer(self):
        self.assertEqual(
            verify(
                dkim_field="{@empresa.com : pass}",
                from_email="agente@mail.empresa.com",
            ),
            PASS,
        )

    def test_a6_signer_in_subdomain_does_not_validate_parent_domain(self):
        """Direção inversa rejeitada: mais estrito que o relaxed do DMARC."""
        self.assertEqual(
            verify(
                dkim_field="{@mail.empresa.com : pass}",
                from_email="agente@empresa.com",
            ),
            FAIL,
        )

    # --- A7: guardas do A-R (blocker #1) ---------------------------------

    def test_a7_unknown_authserv_id_is_ignored(self):
        headers = "Authentication-Results: evil.example; dkim=fail header.d=atacante.com"
        self.assertEqual(verify(headers_str=headers), UNVERIFIED)

    def test_a7_duplicate_authentication_results_is_treated_as_injection(self):
        """Duplicata = injeção. A primeira linha não garante nada.

        `_extract_header` usa search() e devolveria a forjada em silêncio; é
        por isso que o A-R é lido por conta própria, e não por ele.
        """
        headers = (
            f"Authentication-Results: {AUTHSERV}; dkim=pass header.d=empresa.com\n"
            f"Authentication-Results: {AUTHSERV}; dkim=fail header.d=atacante.com"
        )
        self.assertEqual(verify(headers_str=headers), UNVERIFIED)

    def test_a7_unconfigured_authserv_id_ignores_the_header(self):
        """Fail-closed: sem pin configurado, o A-R não é considerado."""
        headers = f"Authentication-Results: {AUTHSERV}; dkim=fail header.d=atacante.com"
        for unset in ("", None):
            with self.subTest(authserv_id=repr(unset)):
                self.assertEqual(
                    verify(headers_str=headers, authserv_id=unset), UNVERIFIED
                )

    def test_a7_authserv_id_match_is_case_insensitive(self):
        headers = f"Authentication-Results: {AUTHSERV.upper()}; dkim=fail header.d=atacante.com"
        self.assertEqual(verify(headers_str=headers), FAIL)

    # --- Contrato dos estados --------------------------------------------

    def test_states_match_the_model_choices(self):
        """Trava a divergência entre o módulo puro e as choices do model.

        O módulo não importa o model (evita plane.db -> plane.app), então os
        literais são duplicados de propósito; este teste é o que garante que a
        duplicação não derive.
        """
        from plane.db.models import HelpdeskRequestComment

        choices = dict(HelpdeskRequestComment.SenderVerification.choices)
        self.assertEqual(
            set(choices), {PASS, FAIL, UNVERIFIED, NOT_APPLICABLE}
        )
