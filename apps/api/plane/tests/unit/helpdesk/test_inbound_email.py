# Python imports
import uuid
from unittest import mock

# Third-party imports
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

# Module imports
from plane.app.helpdesk.attachments import COMMENT_ENTITY
from plane.db.models import (
    FileAsset,
    HelpdeskRequest,
    HelpdeskRequestComment,
    Workspace,
    HelpdeskPortal,
    HelpdeskMember,
)
from plane.tests.factories import UserFactory, WorkspaceFactory


INBOUND_SECRET = "test-inbound-secret"

# The default cache is django_redis.RedisCache in every environment, including
# plane.settings.test. cache.clear() against it would FLUSHDB a real Redis
# shared with dev and with parallel suites, and throttle state would survive
# across runs (unlike the test database, the cache is not recreated). LocMemCache
# makes the clear() in setUp both safe and sufficient for the throttle test.
@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "helpdesk-inbound-tests",
        }
    }
)
class TestInboundEmailParsing(APITestCase):
    def _post(self, payload, secret=INBOUND_SECRET, **extra):
        """POST to the inbound endpoint carrying the shared secret header."""
        if secret is not None:
            extra["HTTP_X_HELPDESK_INBOUND_SECRET"] = secret
        return self.client.post(self.url, payload, format="multipart", **extra)

    def setUp(self):
        cache.clear()
        # Seam rule: always patch get_inbound_secret on the security module.
        # verify_inbound_secret resolves it through its own module namespace at
        # call time, so this works regardless of how the view imports things.
        patcher = mock.patch(
            "plane.app.helpdesk.inbound_security.get_inbound_secret",
            return_value=INBOUND_SECRET,
        )
        patcher.start()
        self.addCleanup(patcher.stop)
        self.user = UserFactory.create(email="customer@example.com", username="customer")
        self.workspace = WorkspaceFactory.create()
        self.portal = HelpdeskPortal.objects.create(
            workspace=self.workspace,
            public_slug="test-portal",
        )
        self.helpdesk_request = HelpdeskRequest.objects.create(
            workspace=self.workspace,
            portal=self.portal,
            title="Help me",
            description="I need help",
            contact_email="customer@example.com",
        )
        self.original_message_id = f"<{uuid.uuid4()}@plane.so>"
        self.comment = HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=self.helpdesk_request,
            content="Original message",
            email_status="sent",
            email_message_id=self.original_message_id,
        )
        self.url = reverse("public-helpdesk-inbound")

    def test_inbound_rejects_request_without_secret(self):
        """T1 (RC-1): sem prova de origem, nada é processado."""
        agent_user = UserFactory.create(email="agent@plane.so", username="agent-t1")
        HelpdeskMember.objects.create(
            workspace=self.workspace, member=agent_user, role=15, is_active=True
        )
        payload = {
            "headers": f"Message-ID: <forged@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "agent@plane.so",
            "text": "Forged agent reply.",
        }

        response = self._post(payload, secret=None)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 1
        )
        # O 403 precisa acontecer antes de qualquer efeito colateral de SLA
        self.helpdesk_request.refresh_from_db()
        self.assertIsNone(self.helpdesk_request.first_responded_at)

    def test_inbound_rejects_malformed_payload_without_secret_before_parsing(self):
        """T1 (RC-1): o 403 precede o parsing — payload inválido não vira 400/500."""
        response = self._post({"garbage": "x"}, secret=None)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inbound_rejects_invalid_secret(self):
        """T2 (RC-1): segredo errado é rejeitado; igualdade completa, não prefixo."""
        payload = {
            "headers": f"Message-ID: <bad-secret@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "Reply with a wrong secret.",
        }

        response = self._post(payload, secret="wrong-secret")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        # Um prefixo do segredo correto também é rejeitado
        response = self._post(payload, secret=INBOUND_SECRET[:-3])
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        self.assertEqual(
            HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 1
        )

    def test_inbound_accepts_secret_via_query_param(self):
        """T2 (RC-1): o Inbound Parse do SendGrid só permite query string na URL."""
        payload = {
            "headers": f"Message-ID: <qs-secret@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "Reply authenticated by query param.",
        }

        response = self.client.post(
            f"{self.url}?token={INBOUND_SECRET}", payload, format="multipart"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_inbound_header_takes_precedence_over_query_param(self):
        """T2 (RC-1): header válido vence query inválido, e header inválido não é resgatado."""
        payload_ok = {
            "headers": f"Message-ID: <prec-ok@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "Header valid, query invalid.",
        }
        response = self.client.post(
            f"{self.url}?token=wrong-secret",
            payload_ok,
            format="multipart",
            HTTP_X_HELPDESK_INBOUND_SECRET=INBOUND_SECRET,
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        payload_bad = {
            "headers": f"Message-ID: <prec-bad@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "Header invalid, query valid.",
        }
        response = self.client.post(
            f"{self.url}?token={INBOUND_SECRET}",
            payload_bad,
            format="multipart",
            HTTP_X_HELPDESK_INBOUND_SECRET="wrong-secret",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inbound_fails_closed_when_secret_not_configured(self):
        """T3 (RC-1): sem segredo configurado, nada entra — nem com token."""
        payload = {
            "headers": f"Message-ID: <no-config@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "Reply while the secret is unset.",
        }

        with mock.patch(
            "plane.app.helpdesk.inbound_security.get_inbound_secret", return_value=""
        ):
            self.assertEqual(self._post(payload).status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(
                self._post(payload, secret=None).status_code, status.HTTP_403_FORBIDDEN
            )
            self.assertEqual(
                self._post(payload, secret="").status_code, status.HTTP_403_FORBIDDEN
            )

        self.assertEqual(
            HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 1
        )

    def test_inbound_throttle_is_above_the_global_anon_rate(self):
        """T10 (RC-9): o anon global de 30/min transformava picos do SendGrid em 429."""
        from plane.app.views.helpdesk.inbound import PublicHelpdeskInboundEmailEndpoint
        from plane.throttles.helpdesk import HelpdeskInboundThrottle

        for index in range(35):
            payload = {
                "headers": (
                    f"Message-ID: <burst-{index}@email.com>\n"
                    f"In-Reply-To: {self.original_message_id}"
                ),
                "from": "customer@example.com",
                "text": f"Burst message {index}.",
            }
            response = self._post(payload)
            self.assertNotEqual(
                response.status_code,
                status.HTTP_429_TOO_MANY_REQUESTS,
                msg=f"requisição {index + 1} de 35 foi barrada pelo throttle",
            )

        self.assertIn(
            HelpdeskInboundThrottle, PublicHelpdeskInboundEmailEndpoint.throttle_classes
        )

    def test_replay_of_same_message_id_does_not_duplicate(self):
        """T4 (RC-3, RC-7): retry do SendGrid não pode duplicar o comentário."""
        payload = {
            "headers": f"Message-ID: <replay-1@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "Please look into this.",
        }

        first = self._post(payload)
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self._post(payload)
        # 200 (e não 500): o IntegrityError viraria retry infinito
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data.get("detail"), "duplicate")

        self.assertEqual(
            HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 2
        )
        self.helpdesk_request.refresh_from_db()
        self.assertIsNone(self.helpdesk_request.first_responded_at)

    def test_partial_unique_constraint_blocks_live_duplicates(self):
        """RC-5/RC-6: a corrida que escapa do exists() é barrada pelo banco."""
        from django.db import IntegrityError, transaction

        HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=self.helpdesk_request,
            content="First",
            email_message_id="<race@x>",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                HelpdeskRequestComment.objects.create(
                    workspace=self.workspace,
                    request=self.helpdesk_request,
                    content="Second",
                    email_message_id="<race@x>",
                )

    def test_partial_unique_constraint_allows_multiple_nulls(self):
        """RC-8: comentários sem email_message_id não podem colidir entre si."""
        for index in range(3):
            HelpdeskRequestComment.objects.create(
                workspace=self.workspace,
                request=self.helpdesk_request,
                content=f"No message id {index}",
                email_message_id=None,
            )

        self.assertEqual(
            HelpdeskRequestComment.objects.filter(
                request=self.helpdesk_request, email_message_id__isnull=True
            ).count(),
            3,
        )

    def test_duplicate_detection_is_soft_delete_aware(self):
        """T5 (RC-6): um comentário soft-deletado não pode bloquear um reenvio."""
        deleted_comment = HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=self.helpdesk_request,
            content="Deleted duplicate",
            email_message_id="<dup@x>",
        )
        deleted_comment.delete()  # soft delete

        payload = {
            "headers": f"Message-ID: <dup@x>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "Resent after deletion.",
        }

        response = self._post(payload)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            HelpdeskRequestComment.all_objects.filter(email_message_id="<dup@x>").count(), 2
        )

    def test_missing_message_id_falls_back_to_synthetic_key(self):
        """T6 (RC-8): sem Message-ID não há chave de idempotência — sintetizar uma."""
        payload = {
            "headers": (
                f"In-Reply-To: {self.original_message_id}\n"
                "Date: Mon, 21 Jul 2026 10:00:00 +0000"
            ),
            "from": "customer@example.com",
            "text": "ok",
        }

        first = self._post(payload)
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        created = HelpdeskRequestComment.objects.latest("created_at")
        self.assertIsNotNone(created.email_message_id)
        self.assertTrue(created.email_message_id.endswith("@synthetic.inbound>"))

        # Retry idêntico → mesma chave → dedup
        second = self._post(payload)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data.get("detail"), "duplicate")
        self.assertEqual(
            HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 2
        )

    def test_synthetic_key_keeps_repeated_short_replies(self):
        """T6 (RC-8): "ok"/"obrigado" repetidos em Dates distintos NÃO podem ser engolidos."""
        base_headers = f"In-Reply-To: {self.original_message_id}"

        first = self._post({
            "headers": f"{base_headers}\nDate: Mon, 21 Jul 2026 10:00:00 +0000",
            "from": "customer@example.com",
            "text": "ok",
        })
        second = self._post({
            "headers": f"{base_headers}\nDate: Mon, 21 Jul 2026 10:05:00 +0000",
            "from": "customer@example.com",
            "text": "ok",
        })

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 3
        )

    def test_synthetic_key_distinguishes_different_bodies(self):
        """T6 (RC-8): mesmo Date, corpos diferentes → dois comentários."""
        date_header = "Date: Mon, 21 Jul 2026 10:00:00 +0000"
        base_headers = f"In-Reply-To: {self.original_message_id}\n{date_header}"

        self._post({"headers": base_headers, "from": "customer@example.com", "text": "primeiro"})
        self._post({"headers": base_headers, "from": "customer@example.com", "text": "segundo"})

        self.assertEqual(
            HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 3
        )

    def test_synthetic_key_without_date_still_dedupes_retries(self):
        """T6 (RC-8): sem Message-ID e sem Date, o retry idêntico ainda dedupa."""
        payload = {
            "headers": f"In-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "sem date header",
        }

        self.assertEqual(self._post(payload).status_code, status.HTTP_201_CREATED)
        second = self._post(payload)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.data.get("detail"), "duplicate")

    def test_successful_threading(self):
        """Test that an email with a valid In-Reply-To creates a comment on the correct ticket."""
        payload = {
            "headers": f"Message-ID: <new123@email.com>\nIn-Reply-To: {self.original_message_id}\nReferences: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "This is a reply to the ticket.",
        }
        
        response = self._post(payload)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 2)
        
        new_comment = HelpdeskRequestComment.objects.latest("created_at")
        self.assertEqual(new_comment.content, "This is a reply to the ticket.")
        self.assertEqual(new_comment.email_message_id, "<new123@email.com>")
        self.assertEqual(new_comment.delivery_channels, ["email"])

    def test_sender_validation_fails(self):
        """Test that an email from an unauthorized sender is rejected."""
        payload = {
            "headers": f"Message-ID: <new456@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "hacker@example.com",
            "text": "I am hacking this ticket.",
        }
        
        response = self._post(payload)

        # Descarte de negócio: um retry do SendGrid não melhora o resultado,
        # então responder 4xx só produz loop de retry.
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get("detail"), "unauthorized_sender")
        self.assertEqual(HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 1)

    def test_missing_context(self):
        """Test that an email without an In-Reply-To or References header fails gracefully."""
        payload = {
            "headers": "Message-ID: <new789@email.com>",
            "from": "customer@example.com",
            "text": "Where does this go?",
        }

        response = self._post(payload)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get("detail"), "thread_not_found")
        self.assertEqual(HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 1)

    def test_html_parsing(self):
        """Test that an email with only HTML body is properly parsed to text."""
        payload = {
            "headers": f"Message-ID: <new999@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "html": "<html><body><p>Reply in <b>HTML</b></p></body></html>",
        }
        
        response = self._post(payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        new_comment = HelpdeskRequestComment.objects.latest("created_at")
        self.assertIn("Reply in HTML", new_comment.content)

    def test_agent_reply(self):
        """B2 (SR-002): agente legítimo, com DKIM alinhado, continua sendo o actor.

        Este teste afirmava o comportamento vulnerável: até o SR-002 ele passava
        **sem** nenhum sinal de autenticidade, o que é exatamente o bug — a
        string do campo `from` era promovida a usuário real do workspace. O
        acréscimo do campo `dkim` aqui **é** a correção, não um ajuste de teste.

        Serve também de guarda contra um fix agressivo demais, que quebrasse a
        atribuição de todo agente: o caminho legítimo tem de continuar inteiro.
        """
        agent_user = UserFactory.create(email="agent@plane.so", username="agent")
        HelpdeskMember.objects.create(
            workspace=self.workspace,
            member=agent_user,
            role=15, # Agent role
            is_active=True
        )

        payload = {
            "headers": f"Message-ID: <agent123@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "agent@plane.so",
            "text": "Agent reply via email.",
            "dkim": "{@plane.so : pass}",
        }

        response = self._post(payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        new_comment = HelpdeskRequestComment.objects.latest("created_at")
        self.assertEqual(new_comment.content, "Agent reply via email.")
        self.assertEqual(new_comment.actor, agent_user)
        self.assertIsNone(new_comment.customer)
        self.assertEqual(new_comment.sender_verification, "pass")

        # O SLA só é marcado por um agente comprovadamente autêntico.
        self.helpdesk_request.refresh_from_db()
        self.assertIsNotNone(self.helpdesk_request.first_responded_at)

    def test_references_header_threading(self):
        """Test that correlation works even if only References header contains the original ID."""
        payload = {
            "headers": f"Message-ID: <ref123@email.com>\nReferences: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "References thread reply.",
        }
        
        response = self._post(payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        new_comment = HelpdeskRequestComment.objects.latest("created_at")
        self.assertEqual(new_comment.content, "References thread reply.")

    def test_empty_body_and_missing_from(self):
        """Test validation rules for missing sender or empty email content."""
        # Scenario 1: missing from
        payload_no_sender = {
            "headers": f"Message-ID: <err1@email.com>\nIn-Reply-To: {self.original_message_id}",
            "text": "No sender",
        }
        response = self._post(payload_no_sender)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get("detail"), "missing_sender")

        # Scenario 2: empty body
        payload_empty_body = {
            "headers": f"Message-ID: <err2@email.com>\nIn-Reply-To: {self.original_message_id}",
            "from": "customer@example.com",
            "text": "",
            "html": "",
        }
        response = self._post(payload_empty_body)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data.get("detail"), "empty_body")

        # Nenhum comentário foi criado em nenhum dos dois cenários
        self.assertEqual(
            HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(), 1
        )

    def test_contact_email_match(self):
        """Test matching when the from address matches contact_email, even if the Customer object is not set."""
        contact_request = HelpdeskRequest.objects.create(
            workspace=self.workspace,
            portal=self.portal,
            title="External Ticket",
            contact_email="external_user@example.com",
            customer=None,
        )
        parent_comment = HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=contact_request,
            content="Original external comment",
            email_status="sent",
            email_message_id="<external-parent-123@plane.so>",
        )
        
        payload = {
            "headers": "Message-ID: <external-reply@email.com>\nIn-Reply-To: <external-parent-123@plane.so>",
            "from": "external_user@example.com",
            "text": "External user reply.",
        }
        
        response = self._post(payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        new_comment = HelpdeskRequestComment.objects.latest("created_at")
        self.assertEqual(new_comment.content, "External user reply.")
        self.assertEqual(new_comment.request, contact_request)



@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "helpdesk-authenticity-tests",
        }
    }
)
class TestInboundSenderAuthenticity(APITestCase):
    """Grupo B do fix-plan do SR-002: identidade do remetente do inbound.

    O segredo compartilhado autentica o *transporte*, não o remetente — o
    próprio SendGrid o anexa ao encaminhar um email que qualquer um mandou para
    o endereço público do Inbound Parse. Daí a validação **assimétrica**:
    agente sem autenticidade comprovada perde `actor` e anexos; cliente nunca
    é bloqueado, verificado ou não.
    """

    def _post(self, payload, secret=INBOUND_SECRET, **extra):
        if secret is not None:
            extra["HTTP_X_HELPDESK_INBOUND_SECRET"] = secret
        return self.client.post(self.url, payload, format="multipart", **extra)

    def setUp(self):
        cache.clear()
        patcher = mock.patch(
            "plane.app.helpdesk.inbound_security.get_inbound_secret",
            return_value=INBOUND_SECRET,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        self.workspace = WorkspaceFactory.create()
        self.portal = HelpdeskPortal.objects.create(
            workspace=self.workspace, public_slug="portal-authenticity"
        )
        self.helpdesk_request = HelpdeskRequest.objects.create(
            workspace=self.workspace,
            portal=self.portal,
            title="Help me",
            description="I need help",
            contact_email="customer@example.com",
        )
        self.parent_message_id = f"<{uuid.uuid4()}@plane.so>"
        HelpdeskRequestComment.objects.create(
            workspace=self.workspace,
            request=self.helpdesk_request,
            content="Original message",
            email_status="sent",
            email_message_id=self.parent_message_id,
        )
        self.agent = UserFactory.create(email="agent@plane.so", username="agent-auth")
        HelpdeskMember.objects.create(
            workspace=self.workspace, member=self.agent, role=15, is_active=True
        )
        self.url = reverse("public-helpdesk-inbound")

    def _new_comment(self):
        return (
            HelpdeskRequestComment.objects.filter(request=self.helpdesk_request)
            .exclude(email_message_id=self.parent_message_id)
            .get()
        )

    # --- B1: o teste do bug ----------------------------------------------

    def test_b1_forged_agent_without_dkim_gets_no_actor(self):
        """Sem prova de autenticidade, o From: forjado não vira usuário real.

        RED antes do fix: o comentário era criado com actor = agente real,
        indistinguível de um genuíno.
        """
        payload = {
            "headers": f"Message-ID: <forged1@email.com>\nIn-Reply-To: {self.parent_message_id}",
            "from": "agent@plane.so",
            "text": "Pode transferir para a conta abaixo.",
        }

        response = self._post(payload)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        comment = self._new_comment()
        self.assertIsNone(comment.actor)
        self.assertEqual(comment.sender_verification, "unverified")
        # O texto sobrevive: o cliente ainda vê a mensagem, sem procedência.
        self.assertEqual(comment.content, "Pode transferir para a conta abaixo.")

    def test_b1_forged_agent_does_not_falsify_the_sla(self):
        """Encadeado: first_responded_at só é escrito quando há actor."""
        self._post(
            {
                "headers": f"Message-ID: <forged2@email.com>\nIn-Reply-To: {self.parent_message_id}",
                "from": "agent@plane.so",
                "text": "Já respondi.",
            }
        )

        self.helpdesk_request.refresh_from_db()
        self.assertIsNone(self.helpdesk_request.first_responded_at)

    def test_b1_misaligned_dkim_does_not_grant_attribution(self):
        """O atacante assina o próprio domínio e forja o From: do agente."""
        response = self._post(
            {
                "headers": f"Message-ID: <forged3@email.com>\nIn-Reply-To: {self.parent_message_id}",
                "from": "agent@plane.so",
                "text": "Confie em mim.",
                "dkim": "{@atacante.com : pass}",
            }
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        comment = self._new_comment()
        self.assertIsNone(comment.actor)
        self.assertEqual(comment.sender_verification, "fail")

    # --- B3: anexo de agente não verificado é descartado, texto sobrevive -

    def test_b3_unverified_agent_attachment_is_never_stored(self):
        """D1/D1-a: o loop é pulado inteiro, não filtrado depois.

        A asserção é sobre a *chamada*: se o veredito fosse consultado só
        depois do loop, os arquivos já teriam ido para o bucket e ficariam
        órfãos até o sweep diário.
        """
        with mock.patch(
            "plane.app.views.helpdesk.inbound.store_inbound_attachment"
        ) as store:
            response = self._post(
                {
                    "headers": f"Message-ID: <forged4@email.com>\nIn-Reply-To: {self.parent_message_id}",
                    "from": "agent@plane.so",
                    "text": "Segue o boleto atualizado.",
                    "attachment1": SimpleUploadedFile(
                        "boleto.exe", b"hostile", content_type="application/octet-stream"
                    ),
                }
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        store.assert_not_called()

        comment = self._new_comment()
        self.assertIsNone(comment.actor)
        self.assertEqual(comment.content, "Segue o boleto atualizado.")
        self.assertEqual(
            FileAsset.objects.filter(
                entity_type=COMMENT_ENTITY, entity_identifier=str(comment.id)
            ).count(),
            0,
        )

    # --- B4: borda anexo-only ---------------------------------------------

    def test_b4_unverified_agent_with_only_attachments_is_discarded(self):
        """D1-b: sem texto não há comentário — e o detail não é `empty_body`.

        O detail próprio é o que torna a borda alertável por contagem; ela não
        produz linha nos Email logs por construção (ver o comentário no view).
        """
        with mock.patch(
            "plane.app.views.helpdesk.inbound.store_inbound_attachment"
        ) as store:
            response = self._post(
                {
                    "headers": f"Message-ID: <forged5@email.com>\nIn-Reply-To: {self.parent_message_id}",
                    "from": "agent@plane.so",
                    "text": "",
                    "attachment1": SimpleUploadedFile(
                        "payload.exe", b"hostile", content_type="application/octet-stream"
                    ),
                }
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data.get("detail"), "unverified_agent_attachments_only"
        )
        store.assert_not_called()
        self.assertEqual(
            HelpdeskRequestComment.objects.filter(request=self.helpdesk_request).count(),
            1,
        )

    # --- B5: a assimetria — o cliente nunca é afetado ---------------------

    def test_b5_customer_is_never_blocked_and_keeps_attachments(self):
        """Impede que um fix futuro derrape para "bloquear tudo que falha DKIM".

        O cliente não controla a infraestrutura de email dele; exigir DKIM
        dele transformaria uma correção de segurança numa perda de mensagens.
        """
        with mock.patch("plane.app.helpdesk.attachments.S3Storage") as storage_cls:
            storage_cls.return_value.upload_file.return_value = True
            storage_cls.return_value.get_object_metadata.return_value = {}
            response = self._post(
                {
                    "headers": f"Message-ID: <cust1@email.com>\nIn-Reply-To: {self.parent_message_id}",
                    "from": "customer@example.com",
                    "text": "Segue o print do erro.",
                    "attachment1": SimpleUploadedFile(
                        "erro.png", b"binary", content_type="image/png"
                    ),
                }
            )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        comment = self._new_comment()
        self.assertIsNone(comment.actor)
        # O veredito é registrado, mas não tem efeito nenhum na autorização.
        self.assertEqual(comment.sender_verification, "unverified")
        self.assertEqual(
            FileAsset.objects.filter(
                entity_type=COMMENT_ENTITY, entity_identifier=str(comment.id)
            ).count(),
            1,
        )

    # --- B6: degradação — nunca 500 ---------------------------------------

    def test_b6_garbage_authenticity_fields_never_produce_500(self):
        """Um 500 faria o SendGrid re-entregar em loop, a mesma razão do _discard."""
        for i, garbage in enumerate(["???", "{@ : }", "{{{", "pass", ""]):
            with self.subTest(dkim=garbage):
                response = self._post(
                    {
                        "headers": f"Message-ID: <garb{i}@email.com>\nIn-Reply-To: {self.parent_message_id}",
                        "from": "customer@example.com",
                        "text": f"Mensagem {i}.",
                        "dkim": garbage,
                        "SPF": garbage,
                    }
                )
                self.assertEqual(response.status_code, status.HTTP_201_CREATED)
