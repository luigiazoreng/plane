# Python imports
from unittest import mock

# Third-party imports
from django.core import mail
from django.db import IntegrityError, transaction
from django.test import TestCase

# Module imports
from plane.bgtasks.helpdesk_email_task import normalize_tls_ssl, send_helpdesk_comment_email
from plane.db.models import HelpdeskPortal, HelpdeskRequest, HelpdeskRequestComment
from plane.tests.factories import WorkspaceFactory


# get_email_configuration is imported at the top of the task module, so this is
# the only patch target that has any effect -- patching it on
# plane.license.utils.instance_value would rebind a name the task never reads.
GET_EMAIL_CONFIGURATION = "plane.bgtasks.helpdesk_email_task.get_email_configuration"
GET_CONNECTION = "plane.bgtasks.helpdesk_email_task.get_connection"


def instance_email_configuration(use_tls="1", use_ssl="0", port="587"):
    return (
        "smtp.instance.example.com",  # EMAIL_HOST
        "instance-user",              # EMAIL_HOST_USER
        "instance-password",          # EMAIL_HOST_PASSWORD
        port,                         # EMAIL_PORT (string, as the config stores it)
        use_tls,                      # EMAIL_USE_TLS
        use_ssl,                      # EMAIL_USE_SSL
        "Support <support@example.com>",  # EMAIL_FROM
    )


class TestNormalizeTlsSsl(TestCase):
    """T9b (RC-4): a normalização precisa lidar com a porta vinda como string."""

    def test_leaves_valid_combinations_untouched(self):
        self.assertEqual(normalize_tls_ssl("1", "0", 587), ("1", "0"))
        self.assertEqual(normalize_tls_ssl("0", "1", 465), ("0", "1"))
        self.assertEqual(normalize_tls_ssl("0", "0", 25), ("0", "0"))

    def test_port_465_prefers_ssl(self):
        self.assertEqual(normalize_tls_ssl("1", "1", 465), ("0", "1"))

    def test_other_ports_prefer_tls(self):
        self.assertEqual(normalize_tls_ssl("1", "1", 587), ("1", "0"))

    def test_string_port_465_prefers_ssl(self):
        """Sem smtp_host do portal, EMAIL_PORT vem como string da config."""
        self.assertEqual(normalize_tls_ssl("1", "1", "465"), ("0", "1"))

    def test_non_numeric_port_falls_back_to_tls(self):
        self.assertEqual(normalize_tls_ssl("1", "1", "not-a-port"), ("1", "0"))
        self.assertEqual(normalize_tls_ssl("1", "1", None), ("1", "0"))


class HelpdeskEmailTaskTestCase(TestCase):
    def setUp(self):
        mail.outbox = []
        self.workspace = WorkspaceFactory.create()
        self.portal = HelpdeskPortal.objects.create(
            workspace=self.workspace, public_slug="portal-task"
        )
        self.request = HelpdeskRequest.objects.create(
            workspace=self.workspace,
            portal=self.portal,
            title="Ticket",
            contact_email="customer@example.com",
        )

    def _comment(self, **overrides):
        fields = {
            "workspace": self.workspace,
            "request": self.request,
            "content": "Message body",
            "delivery_channels": ["email"],
        }
        fields.update(overrides)
        return HelpdeskRequestComment.objects.create(**fields)


class TestInternalNoteIsNeverEmailed(HelpdeskEmailTaskTestCase):
    """T8 (RC-2 camada 3): o guard cobre qualquer caminho até a task."""

    def test_internal_note_is_not_sent(self):
        comment = self._comment(is_internal=True)

        with mock.patch(GET_EMAIL_CONFIGURATION, return_value=instance_email_configuration()):
            send_helpdesk_comment_email(comment.id)

        self.assertEqual(len(mail.outbox), 0)
        comment.refresh_from_db()
        self.assertEqual(
            comment.email_status, HelpdeskRequestComment.EmailDeliveryStatus.NOT_SENT
        )
        self.assertTrue(comment.email_error)

    def test_public_comment_is_still_sent(self):
        """Prova que o guard não é um curto-circuito universal."""
        comment = self._comment(is_internal=False)

        with mock.patch(GET_EMAIL_CONFIGURATION, return_value=instance_email_configuration()):
            send_helpdesk_comment_email(comment.id)

        self.assertEqual(len(mail.outbox), 1)
        comment.refresh_from_db()
        self.assertEqual(
            comment.email_status, HelpdeskRequestComment.EmailDeliveryStatus.SENT
        )


class TestTaskNeverPassesBothTlsAndSsl(HelpdeskEmailTaskTestCase):
    """T9b (RC-4): as duas origens de configuração, não só a do portal."""

    def _sent_connection_kwargs(self, comment, configuration):
        with mock.patch(GET_EMAIL_CONFIGURATION, return_value=configuration):
            with mock.patch(GET_CONNECTION, wraps=None) as get_connection_mock:
                get_connection_mock.return_value = mail.get_connection()
                send_helpdesk_comment_email(comment.id)
        self.assertTrue(get_connection_mock.called)
        return get_connection_mock.call_args.kwargs

    def test_instance_configuration_with_both_flags_is_normalized(self):
        """Origem instância: escapa do serializer E do CheckConstraint do portal."""
        comment = self._comment()
        kwargs = self._sent_connection_kwargs(
            comment, instance_email_configuration(use_tls="1", use_ssl="1", port="587")
        )

        self.assertFalse(kwargs["use_tls"] and kwargs["use_ssl"])
        self.assertTrue(kwargs["use_tls"])  # porta 587 → prefere TLS

        comment.refresh_from_db()
        self.assertEqual(
            comment.email_status, HelpdeskRequestComment.EmailDeliveryStatus.SENT
        )

    def test_instance_configuration_string_port_465_prefers_ssl(self):
        """EMAIL_PORT chega como string: uma comparação == 465 falharia em silêncio."""
        comment = self._comment()
        kwargs = self._sent_connection_kwargs(
            comment, instance_email_configuration(use_tls="1", use_ssl="1", port="465")
        )

        self.assertFalse(kwargs["use_tls"] and kwargs["use_ssl"])
        self.assertTrue(kwargs["use_ssl"])

    def test_portal_smtp_with_both_flags_is_rejected_by_the_database(self):
        """RC-4 camada 2: a origem do portal é barrada antes de chegar à task."""
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                HelpdeskPortal.objects.create(
                    workspace=self.workspace,
                    public_slug="portal-both-flags",
                    smtp_host="smtp.example.com",
                    smtp_port=465,
                    smtp_use_tls=True,
                    smtp_use_ssl=True,
                )
