with open("apps/api/plane/app/views/helpdesk/inbound.py", "r") as f:
    content = f.read()

# 1. Update _build_synthetic_message_id
content = content.replace(
"""    def _build_synthetic_message_id(
        self, parent_comment, from_email: str, date_header: Optional[str], body_key: str
    ) -> str:
        \"\"\"Derive an idempotency key for emails that carry no Message-ID.""",
"""    def _build_synthetic_message_id(
        self, hd_request, from_email: str, date_header: Optional[str], body_key: str
    ) -> str:
        \"\"\"Derive an idempotency key for emails that carry no Message-ID."""
)
content = content.replace(
"""        parts = [str(parent_comment.id), from_email]""",
"""        parts = [str(hd_request.id), from_email]"""
)

# 2. Add hd_request fallback
fallback_logic = """
            hd_request = None
            if parent_comment:
                hd_request = parent_comment.request
            else:
                from plane.db.models import HelpdeskRequest
                all_ids = []
                if in_reply_to:
                    all_ids.extend(re.findall(r"<[^>]+>", in_reply_to))
                if references:
                    all_ids.extend(re.findall(r"<[^>]+>", references))
                for msg_id in all_ids:
                    match = re.search(r"<([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})@", msg_id, re.IGNORECASE)
                    if match:
                        request_id = match.group(1)
                        hd_request = HelpdeskRequest.objects.filter(id=request_id).first()
                        if hd_request:
                            break

            if not hd_request:
                return self._discard("thread_not_found", in_reply_to=in_reply_to)
"""

old_logic = """
            if not parent_comment:
                return self._discard("thread_not_found", in_reply_to=in_reply_to)


            hd_request = parent_comment.request
"""
content = content.replace(old_logic, fallback_logic)

# 3. Update call to _build_synthetic_message_id
content = content.replace(
"""                message_id = self._build_synthetic_message_id(
                    parent_comment, from_email, date_header, body_key
                )""",
"""                message_id = self._build_synthetic_message_id(
                    hd_request, from_email, date_header, body_key
                )"""
)

with open("apps/api/plane/app/views/helpdesk/inbound.py", "w") as f:
    f.write(content)

