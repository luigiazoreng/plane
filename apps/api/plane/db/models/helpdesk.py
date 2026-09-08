# Python imports
from datetime import timedelta

# Django imports
from django.db import models
from django.db.models import Q
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password

# Module imports
from plane.db.models.workspace import WorkspaceBaseModel


class HelpdeskCustomer(WorkspaceBaseModel):
    name = models.CharField(max_length=255)
    email = models.EmailField(max_length=255)
    password = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ["email", "workspace", "deleted_at"]
        verbose_name = "Helpdesk Customer"
        verbose_name_plural = "Helpdesk Customers"
        db_table = "helpdesk_customers"

    def set_password(self, raw_password):
        self.password = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password)

    def __str__(self):
        return self.email


class HelpdeskPortal(WorkspaceBaseModel):
    class AutoAssignmentType(models.TextChoices):
        LOAD_BALANCE = "load_balance", "Load Balance"
        ROUND_ROBIN = "round_robin", "Round Robin"
        CAPACITY = "capacity", "Capacity"

    is_public = models.BooleanField(default=True)
    require_login = models.BooleanField(default=False)
    enable_chat = models.BooleanField(default=False)
    public_slug = models.SlugField(max_length=255, unique=True)
    auto_assignment_enabled = models.BooleanField(default=False)
    auto_assignment_type = models.CharField(
        max_length=50,
        choices=AutoAssignmentType.choices,
        default=AutoAssignmentType.LOAD_BALANCE,
    )
    auto_assignment_config = models.JSONField(default=dict, blank=True)
    sla_first_response_hours = models.IntegerField(null=True, blank=True)
    sla_resolution_hours = models.IntegerField(null=True, blank=True)
    no_reply_email_address = models.EmailField(max_length=255, null=True, blank=True)
    default_agent_email_address = models.EmailField(max_length=255, null=True, blank=True)
    smtp_host = models.CharField(max_length=255, null=True, blank=True)
    smtp_port = models.IntegerField(null=True, blank=True)
    smtp_username = models.CharField(max_length=255, null=True, blank=True)
    smtp_password = models.CharField(max_length=255, null=True, blank=True)
    smtp_use_tls = models.BooleanField(default=False)
    smtp_use_ssl = models.BooleanField(default=False)
    is_imap_enabled = models.BooleanField(default=False)
    imap_host = models.CharField(max_length=255, null=True, blank=True)
    imap_port = models.IntegerField(null=True, blank=True)
    imap_username = models.CharField(max_length=255, null=True, blank=True)
    imap_password = models.CharField(max_length=255, null=True, blank=True)
    imap_use_tls = models.BooleanField(default=False)
    imap_use_ssl = models.BooleanField(default=False)
    imap_archive_folder = models.CharField(max_length=255, null=True, blank=True)
    # Per-portal attachment ceiling, in bytes. Null means "use the instance
    # limit". It can only ever lower that limit, never raise it: the instance
    # FILE_SIZE_LIMIT is also enforced by the reverse proxy and by the
    # presigned upload conditions, so a higher value here would not actually
    # let a larger file through -- it would just fail further along.
    max_attachment_size = models.BigIntegerField(null=True, blank=True)

    def effective_max_attachment_size(self):
        """Resolve the attachment ceiling that actually applies to this portal."""
        from django.conf import settings

        if not self.max_attachment_size:
            return settings.FILE_SIZE_LIMIT
        return min(self.max_attachment_size, settings.FILE_SIZE_LIMIT)

    class Meta:
        verbose_name = "Helpdesk Portal"
        verbose_name_plural = "Helpdesk Portals"
        db_table = "helpdesk_portals"
        constraints = [
            # Django's SMTP backend raises ValueError when both are set, turning
            # every outbound email of the portal into FAILED. The serializer
            # already rejects the combination; this closes the ORM-level and
            # raw-update paths that bypass it.
            models.CheckConstraint(
                check=~(Q(smtp_use_tls=True) & Q(smtp_use_ssl=True)),
                name="helpdesk_portal_smtp_tls_ssl_exclusive",
            )
        ]

    def __str__(self):
        return self.public_slug


class HelpdeskFormVisibility(models.TextChoices):
    PUBLIC = "public", "Public"
    PRIVATE = "private", "Private"


class HelpdeskForm(WorkspaceBaseModel):
    portal = models.ForeignKey(HelpdeskPortal, on_delete=models.CASCADE, related_name="forms")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    slug = models.SlugField(max_length=255)
    visibility = models.CharField(
        max_length=20, choices=HelpdeskFormVisibility.choices, default=HelpdeskFormVisibility.PUBLIC
    )
    is_active = models.BooleanField(default=True)
    sequence = models.FloatField(default=65535)
    success_message = models.TextField(blank=True, default="")
    ticket_id_pattern = models.CharField(max_length=64, blank=True, default="")
    ticket_id_counter = models.PositiveIntegerField(default=0)

    class Meta:
        verbose_name = "Helpdesk Form"
        verbose_name_plural = "Helpdesk Forms"
        db_table = "helpdesk_forms"
        ordering = ["sequence", "created_at"]
        unique_together = ["portal", "slug", "deleted_at"]

    def __str__(self):
        return self.name


class HelpdeskFormFieldType(models.TextChoices):
    SYSTEM_TITLE = "system_title", "System Title"
    SYSTEM_DESCRIPTION = "system_description", "System Description"
    SHORT_TEXT = "short_text", "Short Text"
    LONG_TEXT = "long_text", "Long Text"
    SELECT = "select", "Select"
    CHECKBOX = "checkbox", "Checkbox"
    DATE = "date", "Date"
    CASCADE_SELECT = "cascade_select", "Cascading Dropdown"
    ATTACHMENT = "attachment", "Attachment"


class HelpdeskFormField(WorkspaceBaseModel):
    form = models.ForeignKey(HelpdeskForm, on_delete=models.CASCADE, related_name="fields")
    key = models.SlugField(max_length=255)
    label = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    field_type = models.CharField(max_length=50, choices=HelpdeskFormFieldType.choices)
    placeholder = models.CharField(max_length=255, blank=True, default="")
    help_text = models.TextField(blank=True, default="")
    required = models.BooleanField(default=False)
    sequence = models.FloatField(default=65535)
    options = models.JSONField(default=list, blank=True)
    parent_mapping = models.JSONField(default=dict, blank=True)
    validation = models.JSONField(default=dict, blank=True)
    ui_props = models.JSONField(default=dict, blank=True)
    is_system = models.BooleanField(default=False)
    parent_field_key = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        verbose_name = "Helpdesk Form Field"
        verbose_name_plural = "Helpdesk Form Fields"
        db_table = "helpdesk_form_fields"
        ordering = ["sequence", "created_at"]
        unique_together = ["form", "key", "deleted_at"]

    def __str__(self):
        return f"{self.form.name} -> {self.key}"


DEFAULT_HELPDESK_STATUSES = [
    {"name": "Open", "color": "#F97316", "sequence": 10000, "is_default": True},
    {"name": "In Progress", "color": "#3B82F6", "sequence": 20000, "is_default": False},
    {"name": "Waiting", "color": "#8B5CF6", "sequence": 30000, "is_default": False},
    {"name": "Resolved", "color": "#10B981", "sequence": 40000, "is_default": False},
    {"name": "Closed", "color": "#64748B", "sequence": 50000, "is_default": False},
]


class HelpdeskStatus(WorkspaceBaseModel):
    name = models.CharField(max_length=255)
    color = models.CharField(max_length=20, default="#60646C")
    sequence = models.FloatField(default=65535)
    is_default = models.BooleanField(default=False)
    is_terminal = models.BooleanField(default=False)
    # While a request sits in a status with pauses_sla=True (e.g. "Waiting"),
    # the SLA clock stops -- see HelpdeskRequest.sla_paused_at.
    pauses_sla = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Helpdesk Status"
        verbose_name_plural = "Helpdesk Statuses"
        db_table = "helpdesk_statuses"
        ordering = ["sequence"]

    def __str__(self):
        return self.name


class HelpdeskRequestSource(models.TextChoices):
    PUBLIC_FORM = "public_form", "Public Form"
    INTERNAL_FORM = "internal_form", "Internal Form"


class HelpdeskRequestPriority(models.TextChoices):
    """
    Deliberately the same values as Issue.PRIORITY_CHOICES so a ticket and the
    work item it is forwarded to speak the same language, and so the frontend
    reuses PriorityIcon / PriorityDropdown unchanged.
    """

    URGENT = "urgent", "Urgent"
    HIGH = "high", "High"
    MEDIUM = "medium", "Medium"
    LOW = "low", "Low"
    NONE = "none", "None"


class HelpdeskRequest(WorkspaceBaseModel):
    portal = models.ForeignKey(HelpdeskPortal, on_delete=models.CASCADE, related_name="requests")
    form = models.ForeignKey(HelpdeskForm, on_delete=models.SET_NULL, null=True, blank=True, related_name="requests")
    customer = models.ForeignKey(
        HelpdeskCustomer, on_delete=models.SET_NULL, null=True, blank=True, related_name="requests"
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    contact_email = models.EmailField(max_length=255, null=True, blank=True)
    status = models.ForeignKey(
        HelpdeskStatus, on_delete=models.SET_NULL, null=True, blank=True, related_name="requests"
    )
    source = models.CharField(
        max_length=50, choices=HelpdeskRequestSource.choices, default=HelpdeskRequestSource.PUBLIC_FORM
    )
    priority = models.CharField(
        max_length=30,
        choices=HelpdeskRequestPriority.choices,
        default=HelpdeskRequestPriority.NONE,
        verbose_name="Helpdesk Request Priority",
    )
    form_responses = models.JSONField(default=dict, blank=True)
    display_id = models.CharField(max_length=64, blank=True, default="")
    first_responded_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    snoozed_until = models.DateTimeField(null=True, blank=True)
    # Deadlines resolved from the SLA policy of the ticket's priority (see
    # plane.app.helpdesk.sla). Both are pushed forward when a pause ends, so a
    # deadline in the past always means a real breach -- no need to subtract
    # total_paused_duration at read time.
    sla_first_response_due_at = models.DateTimeField(null=True, blank=True)
    sla_resolution_due_at = models.DateTimeField(null=True, blank=True)
    # Set while the request sits in a status with pauses_sla=True; cleared (and
    # folded into total_paused_duration) the moment it leaves that status.
    sla_paused_at = models.DateTimeField(null=True, blank=True)
    total_paused_duration = models.DurationField(default=timedelta(0))
    start_date = models.DateField(null=True, blank=True)
    target_date = models.DateField(null=True, blank=True)
    external_source = models.CharField(max_length=255, blank=True, default="")
    external_id = models.CharField(max_length=255, blank=True, default="")
    import_metadata = models.JSONField(default=dict, blank=True)
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="helpdesk_requests",
        through="HelpdeskRequestAssignee",
        through_fields=("request", "assignee"),
    )
    labels = models.ManyToManyField(
        "db.Label",
        blank=True,
        related_name="helpdesk_requests",
    )
    team = models.ForeignKey(
        "db.HelpdeskTeam",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requests",
    )

    class Meta:
        verbose_name = "Helpdesk Request"
        verbose_name_plural = "Helpdesk Requests"
        db_table = "helpdesk_requests"

    def __str__(self):
        return self.title


class HelpdeskRequestComment(WorkspaceBaseModel):
    request = models.ForeignKey(HelpdeskRequest, on_delete=models.CASCADE, related_name="comments")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="helpdesk_comments"
    )
    customer = models.ForeignKey(
        HelpdeskCustomer, on_delete=models.SET_NULL, null=True, blank=True, related_name="helpdesk_comments"
    )
    content = models.TextField()
    is_internal = models.BooleanField(default=False)

    class EmailDeliveryStatus(models.TextChoices):
        NOT_SENT = "not_sent", "Not Sent"
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    class SenderVerification(models.TextChoices):
        """Authenticity of the From: address of an inbound email.

        Values mirror the constants in
        ``plane.app.helpdesk.sender_authenticity``; that module stays free of
        Django imports, so the literals are duplicated on purpose and
        ``test_states_match_the_model_choices`` keeps them from drifting.

        Never exposed by the public comment serializer: telling the sender
        whether the spoof was detected hands the attacker a detection oracle.
        """

        PASS = "pass", "Pass"
        FAIL = "fail", "Fail"
        UNVERIFIED = "unverified", "Unverified"
        NOT_APPLICABLE = "not_applicable", "Not Applicable"

    sender_verification = models.CharField(
        max_length=20,
        choices=SenderVerification.choices,
        default=SenderVerification.NOT_APPLICABLE,
    )

    delivery_channels = models.JSONField(default=list, blank=True)
    email_status = models.CharField(
        max_length=20,
        choices=EmailDeliveryStatus.choices,
        default=EmailDeliveryStatus.NOT_SENT,
    )
    email_sent_at = models.DateTimeField(null=True, blank=True)
    email_message_id = models.CharField(max_length=255, null=True, blank=True)
    email_error = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "Helpdesk Request Comment"
        verbose_name_plural = "Helpdesk Request Comments"
        db_table = "helpdesk_request_comments"
        constraints = [
            # Deliberately a partial UniqueConstraint and not unique=True on the
            # field: a database-level unique index also sees soft-deleted rows
            # (SoftDeletionManager filters in the ORM only), so a deleted
            # comment would make a legitimate resend of the same Message-ID
            # raise IntegrityError -> 500 -> endless provider retries.
            #
            # The condition is intentionally limited to these two clauses. An
            # extra ~Q(email_message_id="") would not be provable from
            # `email_message_id = $1` once psycopg3 (server-side binding,
            # prepare_threshold=5) switches the statement to a generic plan --
            # the planner could no longer show the query implies the index
            # condition, and the lookup would silently degrade to a seq scan
            # under exactly the repetition that characterises production.
            # Excluding "" is redundant anyway: the inbound view normalises ""
            # to None before writing.
            models.UniqueConstraint(
                fields=["email_message_id"],
                condition=Q(deleted_at__isnull=True) & Q(email_message_id__isnull=False),
                name="helpdesk_comment_unique_email_message_id",
            )
        ]


class HelpdeskRequestIssue(WorkspaceBaseModel):
    request = models.ForeignKey(HelpdeskRequest, on_delete=models.CASCADE, related_name="issue_links")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="helpdesk_requests")

    class Meta:
        unique_together = ["request", "issue", "deleted_at"]
        verbose_name = "Helpdesk Request Issue"
        verbose_name_plural = "Helpdesk Request Issues"
        db_table = "helpdesk_request_issues"


class HelpdeskRequestAssignee(WorkspaceBaseModel):
    request = models.ForeignKey(HelpdeskRequest, on_delete=models.CASCADE, related_name="request_assignees")
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="request_assignees",
    )

    class Meta:
        unique_together = ["request", "assignee", "deleted_at"]
        verbose_name = "Helpdesk Request Assignee"
        verbose_name_plural = "Helpdesk Request Assignees"
        db_table = "helpdesk_request_assignees"

    def __str__(self):
        return f"{self.request.title} -> {self.assignee.email}"


class HelpdeskRequestIntakeIssue(WorkspaceBaseModel):
    request = models.ForeignKey(HelpdeskRequest, on_delete=models.CASCADE, related_name="intake_links")
    intake_issue = models.ForeignKey("db.IntakeIssue", on_delete=models.CASCADE, related_name="helpdesk_requests")
    forwarded_to_project = models.ForeignKey(
        "db.Project", on_delete=models.CASCADE, related_name="helpdesk_intake_forwards"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="helpdesk_intake_forwards",
    )

    class Meta:
        unique_together = ["request", "intake_issue", "deleted_at"]
        verbose_name = "Helpdesk Request Intake Issue"
        verbose_name_plural = "Helpdesk Request Intake Issues"
        db_table = "helpdesk_request_intake_issues"

    def __str__(self):
        return f"{self.request.title} -> {self.intake_issue_id}"


HELPDESK_ROLE_CHOICES = ((20, "Admin"), (15, "Member"), (5, "Guest"))


class HelpdeskMember(WorkspaceBaseModel):
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="helpdesk_memberships",
    )
    role = models.PositiveSmallIntegerField(choices=HELPDESK_ROLE_CHOICES, default=15)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ["workspace", "member", "deleted_at"]
        verbose_name = "Helpdesk Member"
        verbose_name_plural = "Helpdesk Members"
        db_table = "helpdesk_members"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.member.email} <Helpdesk>"

class HelpdeskIMAPSyncLog(WorkspaceBaseModel):
    portal = models.ForeignKey(
        "db.HelpdeskPortal",
        on_delete=models.CASCADE,
        related_name="imap_sync_logs",
    )
    status = models.CharField(max_length=50, choices=[('success', 'Success'), ('error', 'Error')])
    emails_fetched = models.IntegerField(default=0)
    error_message = models.TextField(blank=True, null=True)

    class Meta:
        verbose_name = "Helpdesk IMAP Sync Log"
        verbose_name_plural = "Helpdesk IMAP Sync Logs"
        db_table = "helpdesk_imap_sync_logs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.portal.public_slug} - {self.status} - {self.created_at}"


class HelpdeskRequestActivity(WorkspaceBaseModel):
    """Audit log entry for a single field change on a helpdesk request.

    Mirrors the IssueActivity pattern (field/old_value/new_value/actor) but
    lives on WorkspaceBaseModel to match the helpdesk scope.
    """

    request = models.ForeignKey(HelpdeskRequest, on_delete=models.CASCADE, related_name="activities")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="helpdesk_activities",
    )
    verb = models.CharField(max_length=50, default="updated")  # created, updated, commented
    field = models.CharField(max_length=255, blank=True, default="")
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")
    old_identifier = models.UUIDField(null=True, blank=True)
    new_identifier = models.UUIDField(null=True, blank=True)

    class Meta:
        verbose_name = "Helpdesk Request Activity"
        verbose_name_plural = "Helpdesk Request Activities"
        db_table = "helpdesk_request_activities"
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.request.title} - {self.field} - {self.verb}"


class HelpdeskTeam(WorkspaceBaseModel):
    """Team / agent group for assigning tickets and organizing work."""

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    color = models.CharField(max_length=20, default="#3B82F6")
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="helpdesk_teams",
    )

    class Meta:
        verbose_name = "Helpdesk Team"
        verbose_name_plural = "Helpdesk Teams"
        db_table = "helpdesk_teams"
        ordering = ("name",)

    def __str__(self):
        return self.name


class HelpdeskRequestReadReceipt(WorkspaceBaseModel):
    """Tracks when an agent last viewed a specific request to compute unread status."""

    request = models.ForeignKey(
        HelpdeskRequest, on_delete=models.CASCADE, related_name="read_receipts"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="helpdesk_read_receipts"
    )
    last_read_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Helpdesk Request Read Receipt"
        verbose_name_plural = "Helpdesk Request Read Receipts"
        db_table = "helpdesk_request_read_receipts"
        unique_together = ["request", "user", "deleted_at"]

    def __str__(self):
        return f"{self.user.email} -> {self.request.title} @ {self.last_read_at}"


class HelpdeskMacro(WorkspaceBaseModel):
    """Canned response / macro template for agents in composer.

    If is_public is True, all agents in the workspace can view and use it.
    If is_public is False, only the author (created_by) can view and use it.
    """

    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    content = models.TextField(blank=True, default="")
    is_public = models.BooleanField(default=True)
    actions = models.JSONField(default=list, blank=True)
    sequence = models.FloatField(default=65535)

    class Meta:
        verbose_name = "Helpdesk Macro"
        verbose_name_plural = "Helpdesk Macros"
        db_table = "helpdesk_macros"
        ordering = ("sequence", "name")

    def __str__(self):
        return self.name


class HelpdeskRequestBookmark(WorkspaceBaseModel):
    """Favorite / bookmarked request for a specific agent."""

    request = models.ForeignKey(
        HelpdeskRequest, on_delete=models.CASCADE, related_name="bookmarks"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="helpdesk_request_bookmarks"
    )

    class Meta:
        verbose_name = "Helpdesk Request Bookmark"
        verbose_name_plural = "Helpdesk Request Bookmarks"
        db_table = "helpdesk_request_bookmarks"
        unique_together = ["request", "user", "deleted_at"]

    def __str__(self):
        return f"{self.user.email} star -> {self.request.title}"


class HelpdeskSLAPolicy(WorkspaceBaseModel):
    """Per-priority SLA target for a portal.

    HelpdeskPortal already carries sla_first_response_hours / sla_resolution_hours,
    but a single pair for the whole portal cannot express the one thing SLAs exist
    for: an urgent ticket and a low one do not get the same deadline. This model
    overrides the portal pair per priority; a priority with no active policy falls
    back to the portal values, so existing portals keep behaving exactly as before.

    Null hours means "no target for this leg" -- a policy may set a resolution
    deadline without promising a first-response one, or the reverse.
    """

    portal = models.ForeignKey(HelpdeskPortal, on_delete=models.CASCADE, related_name="sla_policies")
    priority = models.CharField(max_length=30, choices=HelpdeskRequestPriority.choices)
    first_response_hours = models.IntegerField(null=True, blank=True)
    resolution_hours = models.IntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = "Helpdesk SLA Policy"
        verbose_name_plural = "Helpdesk SLA Policies"
        db_table = "helpdesk_sla_policies"
        unique_together = ["portal", "priority", "deleted_at"]
        ordering = ("portal", "priority")

    def __str__(self):
        return f"{self.portal.public_slug} / {self.priority}"


class HelpdeskRecurrenceMatchType(models.TextChoices):
    SAME_CUSTOMER_SIMILAR = "same_customer_similar", "Same customer, similar problem"
    SHARED_ISSUE = "shared_issue", "Linked to the same work item"


class HelpdeskRequestRecurrence(WorkspaceBaseModel):
    """A detected link between a ticket and an earlier one covering the same problem.

    Rows are directional: ``request`` is the newer ticket, ``related_request`` the
    earlier one it repeats. Storing the link rather than recomputing it on read
    keeps the detection cost at write time and lets an agent see *why* two tickets
    were tied together (match_type) and how confident the tie is (score).
    """

    request = models.ForeignKey(HelpdeskRequest, on_delete=models.CASCADE, related_name="recurrence_links")
    related_request = models.ForeignKey(
        HelpdeskRequest, on_delete=models.CASCADE, related_name="recurrence_backlinks"
    )
    match_type = models.CharField(max_length=50, choices=HelpdeskRecurrenceMatchType.choices)
    # 0..1 for same_customer_similar (token overlap of the titles); 1.0 for
    # shared_issue, which is an exact link rather than a heuristic.
    score = models.FloatField(null=True, blank=True)

    class Meta:
        verbose_name = "Helpdesk Request Recurrence"
        verbose_name_plural = "Helpdesk Request Recurrences"
        db_table = "helpdesk_request_recurrences"
        unique_together = ["request", "related_request", "match_type", "deleted_at"]
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                check=~Q(request=models.F("related_request")),
                name="helpdesk_recurrence_no_self_link",
            )
        ]

    def __str__(self):
        return f"{self.request_id} repeats {self.related_request_id} ({self.match_type})"


