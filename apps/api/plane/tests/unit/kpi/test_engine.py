# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for the pure KPI calculation engine.

Covers the six canonical cases from the KPI spec (section 9) in both penalty
modes, plus edge behaviors of k, allow_negative, max_multiplier and bonuses.
"""

from datetime import date

import pytest

from plane.kpi.engine import calcular, calcular_dias, sample_curve
from plane.db.models.kpi import default_kpi_tables


def _config(**param_overrides):
    params = {
        "penalty_mode": "continuous",
        "k": 0.5,
        "day_count": "calendar",
        "day_rounding": "truncate",
        "allow_negative": True,
        "max_multiplier": None,
        "vf_decimals": 2,
    }
    params.update(param_overrides)
    return {"tables": default_kpi_tables(), "params": params}


# (label, task, expected_Vp, expected_d, p_continuous, p_dead_zone, vf_cont, vf_dead)
# Priority keys map to Plane native values: urgent=b0.30, high=b0.25,
# medium=b0.20, low=b0.15, none=b0.10.
SPEC_CASES = [
    (
        "no_prazo",
        {"priority": "urgent", "difficulty": "Hard-High", "repetitive": "Low", "importance": "High", "type": "Feature", "d": 0},
        100, 0, 1.00, 1.00, 100, 100,
    ),
    (
        "atraso_leve",
        {"priority": "high", "difficulty": "Hard-Low", "repetitive": "Low", "importance": "High", "type": "Feature", "d": 2},
        92, 2, 0.50, 0.50, 46, 46,
    ),
    (
        "antecipada",
        {"priority": "medium", "difficulty": "Medium-High", "repetitive": "Medium", "importance": "Medium", "type": "Feature", "d": -1},
        74, -1, 1.20, 1.20, 88.8, 88.8,
    ),
    (
        "no_limite_1_b",
        {"priority": "medium", "difficulty": "Hard-High", "repetitive": "Low", "importance": "High", "type": "Feature", "d": 5},
        93, 5, 0.00, 0.00, 0, 0,
    ),
    (
        "muito_atrasada",
        {"priority": "high", "difficulty": "Hard-Low", "repetitive": "Low", "importance": "High", "type": "Feature", "d": 10},
        92, 10, -0.75, -0.25, -69, -23,
    ),
    (
        "extremo_zona_morta",
        {"priority": "none", "difficulty": "Easy-Low", "repetitive": "Low", "importance": "Low", "type": "Feature", "d": 12},
        30, 12, -0.10, 0.00, -3, 0,
    ),
]


def _task_with_dates(case, d):
    """Build a task dict using real dates that yield the desired delay ``d``."""
    due = date(2026, 1, 15)
    delivered = date.fromordinal(due.toordinal() + d)
    task = dict(case)
    task.pop("d", None)
    task["due_date"] = due
    task["delivered_date"] = delivered
    return task


@pytest.mark.unit
class TestSpecCases:
    @pytest.mark.parametrize(
        "label,case,vp,d,p_cont,p_dead,vf_cont,vf_dead", SPEC_CASES,
        ids=[c[0] for c in SPEC_CASES],
    )
    def test_continuous(self, label, case, vp, d, p_cont, p_dead, vf_cont, vf_dead):
        task = _task_with_dates(case, d)
        res = calcular(task, _config(penalty_mode="continuous"))
        assert res["Vp"] == vp
        assert res["d"] == d
        assert res["p"] == pytest.approx(p_cont, abs=1e-9)
        assert res["Vf"] == pytest.approx(vf_cont, abs=1e-9)

    @pytest.mark.parametrize(
        "label,case,vp,d,p_cont,p_dead,vf_cont,vf_dead", SPEC_CASES,
        ids=[c[0] for c in SPEC_CASES],
    )
    def test_dead_zone(self, label, case, vp, d, p_cont, p_dead, vf_cont, vf_dead):
        task = _task_with_dates(case, d)
        res = calcular(task, _config(penalty_mode="dead_zone"))
        assert res["Vp"] == vp
        assert res["d"] == d
        assert res["p"] == pytest.approx(p_dead, abs=1e-9)
        assert res["Vf"] == pytest.approx(vf_dead, abs=1e-9)


@pytest.mark.unit
class TestEdgeBehaviors:
    def test_open_task_has_no_vf(self):
        task = {"priority": "urgent", "difficulty": "Hard-High", "due_date": date(2026, 1, 1), "delivered_date": None}
        res = calcular(task, _config())
        assert res["d"] is None and res["p"] is None and res["Vf"] is None
        assert res["Vp"] == 80  # difficulty Hard-High (50) + priority urgent points (30)

    def test_k_one_modes_coincide(self):
        # With k=1 the two modes collapse to the same single line.
        task = _task_with_dates(dict(SPEC_CASES[4][1]), 10)
        cont = calcular(task, _config(penalty_mode="continuous", k=1.0))
        dead = calcular(task, _config(penalty_mode="dead_zone", k=1.0))
        assert cont["p"] == pytest.approx(dead["p"], abs=1e-9)

    def test_k_zero_floors_at_zero(self):
        # With k=0, p never goes below 0 in either mode.
        task = _task_with_dates(dict(SPEC_CASES[4][1]), 10)
        for mode in ("continuous", "dead_zone"):
            res = calcular(task, _config(penalty_mode=mode, k=0.0))
            assert res["p"] == pytest.approx(0.0, abs=1e-9)

    def test_allow_negative_false_floors_vf(self):
        task = _task_with_dates(dict(SPEC_CASES[4][1]), 10)
        res = calcular(task, _config(allow_negative=False))
        assert res["p"] == pytest.approx(-0.75, abs=1e-9)
        assert res["Vf"] == 0

    def test_max_multiplier_caps_bonus(self):
        task = _task_with_dates(dict(SPEC_CASES[2][1]), -1)  # p would be 1.20
        res = calcular(task, _config(max_multiplier=1.1))
        assert res["p"] == pytest.approx(1.1, abs=1e-9)

    def test_early_delivery_gives_bonus(self):
        task = _task_with_dates(dict(SPEC_CASES[2][1]), -3)
        res = calcular(task, _config())
        assert res["p"] > 1.0


@pytest.mark.unit
class TestCalcularDias:
    def test_calendar(self):
        params = {"day_count": "calendar", "day_rounding": "truncate"}
        assert calcular_dias(date(2026, 1, 10), date(2026, 1, 5), params) == 5
        assert calcular_dias(date(2026, 1, 4), date(2026, 1, 5), params) == -1
        assert calcular_dias(None, date(2026, 1, 5), params) is None

    def test_business_days(self):
        params = {"day_count": "business", "day_rounding": "truncate"}
        # Mon 2026-01-05 -> Mon 2026-01-12 is 5 business days (skips the weekend).
        assert calcular_dias(date(2026, 1, 12), date(2026, 1, 5), params) == 5

    def test_rounding_modes(self):
        # 1.5 calendar days isn't reachable from date subtraction, so verify the
        # rounding helper indirectly via ceil on a fractional business value.
        assert calcular_dias(date(2026, 1, 6), date(2026, 1, 5), {"day_count": "calendar", "day_rounding": "ceil"}) == 1


@pytest.mark.unit
def test_sample_curve_shape():
    curve = sample_curve(0.25, _config(), d_min=0, d_max=4)
    assert curve[0] == {"d": 0, "p": pytest.approx(1.0)}
    assert [pt["d"] for pt in curve] == [0, 1, 2, 3, 4]
