import re

with open("apps/api/plane/tests/e2e/test_helpdesk_email_e2e.py", "r") as f:
    content = f.read()

new_test = """
    def test_customer_reply_threads_when_message_id_is_rewritten(self):
        \"\"\"If the SMTP provider rewrites the outgoing Message-ID, the inbound
        reply won't match any HelpdeskRequestComment's email_message_id.
        It should fall back to extracting the request ID from the synthetic
        request_msg_id present in the References header.
        \"\"\"
        self._post_comment("Testing SMTP rewrite resilience.")
        
        # We simulate a reply where the original Message-ID was lost,
        # but the synthetic request_msg_id is preserved in References.
        from django.conf import settings
        host = getattr(settings, "WEB_URL", "plane.so").replace("https://", "").replace("http://", "").split(":")[0]
        request_msg_id = f"<{self.helpdesk_request.id}@{host}>"
        rewritten_msg_id = "<rewritten-by-smtp@mailgun.org>"
        
        response = self._post_inbound(
            {
                "headers": (
                    f"Message-ID: <reply-from-customer@example.com>\\n"
                    f"In-Reply-To: {rewritten_msg_id}\\n"
                    f"References: {request_msg_id} {rewritten_msg_id}"
                ),
                "from": f"Angry Customer <{CUSTOMER_EMAIL}>",
                "text": "The message ID was rewritten!",
            }
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        reply = HelpdeskRequestComment.objects.get(
            email_message_id="<reply-from-customer@example.com>"
        )
        self.assertEqual(reply.request_id, self.helpdesk_request.id)
        self.assertEqual(reply.content, "The message ID was rewritten!")
"""

# Insert before test_attachment_reaches_the_customer_intact
content = content.replace("    def test_attachment_reaches_the_customer_intact(self):", new_test + "\n    def test_attachment_reaches_the_customer_intact(self):")

with open("apps/api/plane/tests/e2e/test_helpdesk_email_e2e.py", "w") as f:
    f.write(content)

