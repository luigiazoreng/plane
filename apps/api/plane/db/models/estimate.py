# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q

# Module imports
from .project import ProjectBaseModel

class EstimateType(models.TextChoices):
    CATEGORIES = "categories", "Categories"
    POINTS = "points", "Points"
    TIME = "time", "Time"


# Estimate types whose point values are numeric and feed analytics aggregations
# (Cast to float, summed, etc). Categories is intentionally excluded. At most one
# estimate of a numeric type may be active (last_used=True) per project.
NUMERIC_ESTIMATE_TYPES = (EstimateType.POINTS, EstimateType.TIME)


class Estimate(ProjectBaseModel):
    name = models.CharField(max_length=255)
    description = models.TextField(verbose_name="Estimate Description", blank=True)
    type = models.CharField(max_length=255, choices=EstimateType.choices, default=EstimateType.CATEGORIES)
    last_used = models.BooleanField(default=False)

    def __str__(self):
        """Return name of the estimate"""
        return f"{self.name} <{self.project.name}>"

    class Meta:
        unique_together = ["name", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "project"],
                condition=Q(deleted_at__isnull=True),
                name="estimate_unique_name_project_when_deleted_at_null",
            )
        ]
        verbose_name = "Estimate"
        verbose_name_plural = "Estimates"
        db_table = "estimates"
        ordering = ("name",)


class EstimatePoint(ProjectBaseModel):
    estimate = models.ForeignKey("db.Estimate", on_delete=models.CASCADE, related_name="points")
    key = models.IntegerField(default=0, validators=[MinValueValidator(0)])
    description = models.TextField(blank=True)
    value = models.CharField(max_length=255)

    def __str__(self):
        """Return name of the estimate"""
        return f"{self.estimate.name} <{self.key}> <{self.value}>"

    class Meta:
        verbose_name = "Estimate Point"
        verbose_name_plural = "Estimate Points"
        db_table = "estimate_points"
        ordering = ("value",)


def project_has_active_numeric_estimate(slug, project_id):
    """True if the project has an active (last_used=True) points/time estimate.

    Used to gate numeric-estimate analytics (cycle/module progress, burndown, etc).
    At most one numeric estimate can be active per project (see
    plane.app.views.estimate.base._activate_numeric_estimate), but it isn't
    necessarily the project's *default* (Project.estimate) -- a Categories estimate
    may be set as default while a Points/Time estimate is simply active alongside it.
    """
    return Estimate.objects.filter(
        workspace__slug=slug,
        project_id=project_id,
        last_used=True,
        type__in=NUMERIC_ESTIMATE_TYPES,
    ).exists()


class EstimatePropertyRole(models.TextChoices):
    DIFFICULTY = "difficulty", "Difficulty"
    REPETITIVE = "repetitive", "Repetitive"


class EstimateProperty(ProjectBaseModel):
    """A named, per-project work-item property backed by an Estimate system.

    Shown as its own dynamic dropdown row on work items (issue detail sidebar,
    create/edit modal) whenever `is_active` and `estimate` is set. Two rows are
    reserved for KPI scoring (`kpi_role` set to "difficulty"/"repetitive"); any
    further rows are free-form, admin-defined properties unrelated to KPI.
    """

    name = models.CharField(max_length=255)
    estimate = models.ForeignKey("db.Estimate", on_delete=models.CASCADE, related_name="properties")
    is_active = models.BooleanField(default=True)
    sort_order = models.FloatField(default=65535)
    kpi_role = models.CharField(max_length=32, choices=EstimatePropertyRole.choices, null=True, blank=True)

    def __str__(self):
        return f"{self.name} <{self.project.name}>"

    class Meta:
        ordering = ("sort_order",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "kpi_role"],
                condition=Q(kpi_role__isnull=False, deleted_at__isnull=True),
                name="estimateproperty_unique_kpi_role_per_project",
            )
        ]
        # Deliberately no legacy `unique_together` here (unlike Estimate.Meta) --
        # unique_together makes DRF's ModelSerializer auto-generate a
        # UniqueTogetherValidator that forces every field in the tuple (including
        # deleted_at) to be required+writable unless explicitly read_only. A
        # conditional UniqueConstraint alone isn't introspected by that DRF
        # machinery, sidestepping that bug class entirely.
        verbose_name = "Estimate Property"
        verbose_name_plural = "Estimate Properties"
        db_table = "estimate_properties"


class IssueEstimatePropertyValue(ProjectBaseModel):
    """The selected EstimatePoint for one (issue, EstimateProperty) pair."""

    issue = models.ForeignKey("db.Issue", on_delete=models.CASCADE, related_name="estimate_property_values")
    property = models.ForeignKey("db.EstimateProperty", on_delete=models.CASCADE, related_name="issue_values")
    estimate_point = models.ForeignKey(
        "db.EstimatePoint", on_delete=models.SET_NULL, null=True, blank=True, related_name="issue_property_values"
    )

    def __str__(self):
        return f"{self.property.name} <{self.issue_id}>"

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["issue", "property"],
                condition=Q(deleted_at__isnull=True),
                name="issueestimatepropertyvalue_unique_issue_property_when_not_deleted",
            )
        ]
        verbose_name = "Issue Estimate Property Value"
        verbose_name_plural = "Issue Estimate Property Values"
        db_table = "issue_estimate_property_values"
