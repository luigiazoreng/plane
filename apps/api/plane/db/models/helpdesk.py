# Django imports
from django.db import models
from django.conf import settings
from django.contrib.auth.hashers import make_password, check_password

# Module imports
from plane.db.models.workspace import WorkspaceBaseModel
from plane.db.models.project import ProjectBaseModel

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


class HelpdeskPortal(ProjectBaseModel):
    is_public = models.BooleanField(default=True)
    require_login = models.BooleanField(default=False)
    enable_chat = models.BooleanField(default=False)
    public_slug = models.SlugField(max_length=255, unique=True)

    class Meta:
        verbose_name = "Helpdesk Portal"
        verbose_name_plural = "Helpdesk Portals"
        db_table = "helpdesk_portals"

    def __str__(self):
        return self.public_slug


class HelpdeskRequestStatus(models.TextChoices):
    OPEN = "open", "Open"
    IN_PROGRESS = "in_progress", "In Progress"
    WAITING = "waiting", "Waiting for Customer"
    RESOLVED = "resolved", "Resolved"
    CLOSED = "closed", "Closed"


class HelpdeskRequestSource(models.TextChoices):
    PUBLIC_FORM = "public_form", "Public Form"
    INTERNAL_FORM = "internal_form", "Internal Form"


class HelpdeskRequest(ProjectBaseModel):
    portal = models.ForeignKey(HelpdeskPortal, on_delete=models.CASCADE, related_name="requests")
    customer = models.ForeignKey(
        HelpdeskCustomer, on_delete=models.SET_NULL, null=True, blank=True, related_name="requests"
    )
    title = models.CharField(max_length=255)
    description = models.TextField()
    contact_email = models.EmailField(max_length=255, null=True, blank=True)
    status = models.CharField(
        max_length=50, choices=HelpdeskRequestStatus.choices, default=HelpdeskRequestStatus.OPEN
    )
    source = models.CharField(
        max_length=50, choices=HelpdeskRequestSource.choices, default=HelpdeskRequestSource.PUBLIC_FORM
    )
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


class HelpdeskRequestComment(ProjectBaseModel):
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


class HelpdeskRequestIssue(ProjectBaseModel):
    request = models.ForeignKey(HelpdeskRequest, on_delete=models.CASCADE, related_name="issue_links")
    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="helpdesk_requests")

    class Meta:
        unique_together = ["request", "issue", "deleted_at"]
        verbose_name = "Helpdesk Request Issue"
        verbose_name_plural = "Helpdesk Request Issues"
        db_table = "helpdesk_request_issues"


class HelpdeskRequestAssignee(ProjectBaseModel):
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
