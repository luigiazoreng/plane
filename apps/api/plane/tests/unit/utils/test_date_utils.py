# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for the analytics date-range presets."""

import pytest
from django.utils import timezone

from plane.utils.date_utils import get_analytics_date_range, get_chart_period_range


@pytest.mark.unit
class TestGetAnalyticsDateRange:
    @pytest.mark.parametrize(
        "date_filter,expected_days",
        [
            ("last_7_days", 7),
            ("last_30_days", 30),
            ("last_3_months", 90),
            ("last_6_months", 180),
            ("last_12_months", 365),
        ],
    )
    def test_current_window_spans_the_expected_number_of_days(self, date_filter, expected_days):
        today = timezone.now().date()
        ranges = get_analytics_date_range(date_filter)

        assert ranges is not None
        assert ranges["current"]["gte"].date() == today - timezone.timedelta(days=expected_days)
        assert ranges["current"]["lte"].date() == today

    @pytest.mark.parametrize("date_filter", ["last_6_months", "last_12_months"])
    def test_long_windows_expose_a_non_overlapping_previous_period(self, date_filter):
        """The previous window must end before the current one starts, or the
        percentage-change figures would compare a period against itself."""
        ranges = get_analytics_date_range(date_filter)

        assert "previous" in ranges
        assert ranges["previous"]["lte"] < ranges["current"]["gte"]

    def test_unknown_filter_returns_none(self):
        assert get_analytics_date_range("last_5_years") is None

    def test_custom_date_range(self):
        ranges = get_analytics_date_range("custom", start_date="2026-01-01", end_date="2026-01-31")
        assert ranges is not None
        assert ranges["current"]["gte"].date() == timezone.datetime.strptime("2026-01-01", "%Y-%m-%d").date()
        assert ranges["current"]["lte"].date() == timezone.datetime.strptime("2026-01-31", "%Y-%m-%d").date()


@pytest.mark.unit
class TestGetChartPeriodRange:
    @pytest.mark.parametrize(
        "date_filter,expected_days",
        [("last_3_months", 90), ("last_6_months", 180), ("last_12_months", 365)],
    )
    def test_chart_range_matches_the_analytics_window(self, date_filter, expected_days):
        # A mismatch here would plot a different span than the KPI cards report.
        today = timezone.now().date()
        start, end = get_chart_period_range(date_filter)

        assert start == today - timezone.timedelta(days=expected_days)
        assert end == today

    def test_unknown_filter_returns_none(self):
        assert get_chart_period_range("invalid_filter") is None

    def test_custom_chart_period_range(self):
        start, end = get_chart_period_range("custom", start_date="2026-01-01", end_date="2026-01-31")
        assert start == timezone.datetime.strptime("2026-01-01", "%Y-%m-%d").date()
        assert end == timezone.datetime.strptime("2026-01-31", "%Y-%m-%d").date()
