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
