# Django imports
from django.db import models

# Module imports
from plane.db.models.workspace import WorkspaceBaseModel


def default_kpi_tables():
    """Default point tables (seed) used when a config is created without explicit tables.

    Priority is keyed by Plane's native Issue.priority values; ``label`` is the
    display name and is freely editable by the user.
    """
    return {
        "difficulty": {
            "Hard-High": 50,
            "Hard-Low": 45,
            "Medium-High": 39,
            "Medium-Low": 32,
            "Easy-High": 24,
            "Easy-Low": 13,
        },
        "repetitive": {"High": 4, "Medium": 2, "Low": 0},
        "importance": {"High": 20, "Medium": 10, "Low": 5},
        "type": {"Feature": 0, "Enhancement": 0, "Support": 0, "Bug": 0},
        "priority": {
            "urgent": {"points": 30, "b": 0.30, "label": "Today / Critical"},
            "high": {"points": 27, "b": 0.25, "label": "Urgent"},
            "medium": {"points": 23, "b": 0.20, "label": "High"},
            "low": {"points": 18, "b": 0.15, "label": "Medium"},
            "none": {"points": 12, "b": 0.10, "label": "Low"},
        },
    }


class KpiConfig(WorkspaceBaseModel):
    """Editable KPI configuration.

    Resolution order is project config -> workspace default (project=null) ->
    hard-coded seed defaults. Global params live in dedicated columns; the
    freely-editable point tables live in the ``tables`` JSON field.
    """

    class PenaltyMode(models.TextChoices):
        CONTINUOUS = "continuous", "Continuous"
        DEAD_ZONE = "dead_zone", "Dead Zone"

    class DayCount(models.TextChoices):
        CALENDAR = "calendar", "Calendar"
        BUSINESS = "business", "Business"

    class DayRounding(models.TextChoices):
        TRUNCATE = "truncate", "Truncate"
        ROUND = "round", "Round"
        CEIL = "ceil", "Ceil"

    name = models.CharField(max_length=255, default="KPI Configuration")
    tables = models.JSONField(default=default_kpi_tables, blank=True)
    penalty_mode = models.CharField(
        max_length=20,
        choices=PenaltyMode.choices,
        default=PenaltyMode.CONTINUOUS,
    )
    k = models.FloatField(default=0.5)
    day_count = models.CharField(
        max_length=20,
        choices=DayCount.choices,
        default=DayCount.CALENDAR,
    )
    day_rounding = models.CharField(
        max_length=20,
        choices=DayRounding.choices,
        default=DayRounding.TRUNCATE,
    )
    allow_negative = models.BooleanField(default=True)
    max_multiplier = models.FloatField(null=True, blank=True)
    vf_decimals = models.PositiveSmallIntegerField(default=2)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ["workspace", "project", "deleted_at"]
        verbose_name = "KPI Config"
        verbose_name_plural = "KPI Configs"
        db_table = "kpi_configs"

    def __str__(self):
        scope = self.project_id or "workspace-default"
        return f"KpiConfig <{scope}>"


class KpiIssueAttribute(WorkspaceBaseModel):
    """KPI-specific categorical attributes attached to a Plane Issue.

    priority/due_date/delivered_date are NOT duplicated here -- they come from
    Issue.priority / Issue.target_date / Issue.completed_at respectively.
    """

    issue = models.OneToOneField(
        "db.Issue",
        on_delete=models.CASCADE,
        related_name="kpi_attribute",
    )
    difficulty = models.CharField(max_length=255, null=True, blank=True)
    repetitive = models.CharField(max_length=255, null=True, blank=True)
    importance = models.CharField(max_length=255, null=True, blank=True)
    type_override = models.CharField(max_length=255, null=True, blank=True)

    class Meta:
        unique_together = ["issue", "deleted_at"]
        verbose_name = "KPI Issue Attribute"
        verbose_name_plural = "KPI Issue Attributes"
        db_table = "kpi_issue_attributes"

    def __str__(self):
        return f"KpiIssueAttribute <{self.issue_id}>"
