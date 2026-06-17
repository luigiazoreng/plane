# Django imports
from django.db import models
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

    class Meta:
        verbose_name = "Helpdesk Portal"
        verbose_name_plural = "Helpdesk Portals"
        db_table = "helpdesk_portals"

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
    validation = models.JSONField(default=dict, blank=True)
    ui_props = models.JSONField(default=dict, blank=True)
    is_system = models.BooleanField(default=False)

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


class HelpdeskRequest(WorkspaceBaseModel):
    portal = models.ForeignKey(HelpdeskPortal, on_delete=models.CASCADE, related_name="requests")
    form = models.ForeignKey(HelpdeskForm, on_delete=models.SET_NULL, null=True, blank=True, related_name="requests")
    customer = models.ForeignKey(
        HelpdeskCustomer, on_delete=models.SET_NULL, null=True, blank=True, related_name="requests"
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    contact_email = models.EmailField(max_length=255, null=True, blank=True)
    status = models.ForeignKey(
        HelpdeskStatus, on_delete=models.SET_NULL, null=True, blank=True, related_name="requests"
    )
    source = models.CharField(
        max_length=50, choices=HelpdeskRequestSource.choices, default=HelpdeskRequestSource.PUBLIC_FORM
    )
    form_responses = models.JSONField(default=dict, blank=True)
    first_responded_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="helpdesk_requests",
        through="HelpdeskRequestAssignee",
        through_fields=("request", "assignee"),
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

    class Meta:
        verbose_name = "Helpdesk Request Comment"
        verbose_name_plural = "Helpdesk Request Comments"
        db_table = "helpdesk_request_comments"


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
