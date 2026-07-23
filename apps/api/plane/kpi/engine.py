"""Pure KPI calculation engine.

No database access. Given a task's fields and a configuration dict (the JSON
contract), computes the planned value ``Vp``, the delay multiplier ``p`` and the
final value ``Vf``. Reused by the Projects layer today and the Helpdesk layer
later. Every number comes from the config -- there are no magic constants here.

Config contract::

    {
        "tables": {
            "difficulty": {"<estimate value>": 8, ...},
            "repetitive": {"High": 4, ...},
            "type":       {"Feature": 0, ...},
            # Importance (I) = priority.points; b = penalty factor.
            "priority":   {"urgent": {"points": 30, "b": 0.30, "label": "..."}, ...}
        },
        "params": {
            "penalty_mode": "continuous" | "dead_zone",
            "k": 0.5,
            "day_count": "calendar" | "business",
            "day_rounding": "truncate" | "round" | "ceil",
            "allow_negative": true,
            "max_multiplier": null | number,
            "vf_decimals": 2
        }
    }
"""

import math
from datetime import date, datetime


def _to_date(value):
    """Normalize a date/datetime/ISO string to a ``date``. Returns None if empty."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        # Accept ISO formats; fall back to date-only.
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).date()
        except ValueError:
            return date.fromisoformat(value[:10])
    raise TypeError(f"Unsupported date value: {value!r}")


def _business_days_between(start, end):
    """Signed count of business days (Mon-Fri) from ``start`` to ``end``.

    Counts the days strictly after ``start`` up to and including ``end`` that
    fall on a weekday. Negative when ``end`` precedes ``start``.
    """
    if end == start:
        return 0
    step = 1 if end > start else -1
    lo, hi = (start, end) if end > start else (end, start)
    count = 0
    cursor = lo
    one_day = (date.resolution if isinstance(lo, date) else None)
    from datetime import timedelta

    one_day = timedelta(days=1)
    cursor = lo + one_day
    while cursor <= hi:
        if cursor.weekday() < 5:  # 0=Mon .. 4=Fri
            count += 1
        cursor += one_day
    return count * step


def _apply_rounding(value, mode):
    """Round a float number of days to an int per the configured mode."""
    if mode == "ceil":
        return math.ceil(value)
    if mode == "round":
        # Round half away from zero (deterministic, not banker's rounding).
        return math.floor(value + 0.5) if value >= 0 else math.ceil(value - 0.5)
    # truncate (default): drop the fractional part toward zero.
    return math.trunc(value)


def calcular_dias(delivered_date, due_date, params):
    """Compute integer delay days ``d`` = delivered - due, per the config.

    Returns ``None`` when the task is still open (no delivered_date) or no due
    date is set. ``d > 0`` late, ``d == 0`` on time, ``d < 0`` early.
    """
    delivered = _to_date(delivered_date)
    due = _to_date(due_date)
    if delivered is None or due is None:
        return None

    if params.get("day_count") == "business":
        d_bruto = _business_days_between(due, delivered)
    else:
        d_bruto = (delivered - due).days

    return _apply_rounding(d_bruto, params.get("day_rounding", "truncate"))


def _multiplier(b, k, d, mode):
    """Compute the delay multiplier ``p`` for the selected penalty mode."""
    if mode == "dead_zone":
        # Plateau at zero between 1/b and 1/(k*b).
        return max(0.0, 1 - b * d) + min(0.0, 1 - k * b * d)
    # continuous (default): single broken line, no dead zone.
    t = 1 - b * d
    return max(0.0, t) + k * min(0.0, t)


def calcular(task, config):
    """Compute ``{Vp, d, p, Vf}`` for a task given the configuration.

    ``task`` keys: ``priority`` (Plane priority value), ``difficulty``,
    ``repetitive``, ``type``, ``due_date``, ``delivered_date``.
    Unknown / missing categorical levels contribute 0 points.

    Importance (I) is the native priority: ``priority_row["points"]`` is the
    Importance contribution to Vp, while ``priority_row["b"]`` is the penalty
    factor. There is no separate importance table.
    """
    tables = config["tables"]
    params = config["params"]

    priority_row = tables["priority"].get(task.get("priority"))
    if priority_row is None:
        # Fall back to the lowest-severity entry if priority is unmapped.
        priority_row = next(iter(tables["priority"].values()), {"points": 0, "b": 0.0})

    type_keys = task.get("type", [])
    if isinstance(type_keys, list):
        type_points = sum(tables.get("type", {}).get(k, 0) for k in type_keys)
    else:
        type_points = tables.get("type", {}).get(type_keys, 0)

    vp = (
        tables.get("difficulty", {}).get(task.get("difficulty"), 0)
        + tables.get("repetitive", {}).get(task.get("repetitive"), 0)
        + priority_row.get("points", 0)  # Importance (I) = native priority points
        + type_points
    )

    d = calcular_dias(task.get("delivered_date"), task.get("due_date"), params)

    result = {"Vp": vp, "d": d, "p": None, "Vf": None}
    if d is None:
        # Open task -- no final value yet.
        return result

    b = priority_row.get("b", 0.0)
    k = params.get("k", 0.5)
    p = _multiplier(b, k, d, params.get("penalty_mode", "continuous"))

    max_mult = params.get("max_multiplier")
    if max_mult is not None:
        p = min(p, max_mult)

    vf = vp * p
    if not params.get("allow_negative", True):
        vf = max(0.0, vf)
    vf = round(vf, params.get("vf_decimals", 2))

    result["p"] = p
    result["Vf"] = vf
    return result


def sample_curve(b, config, d_min=-3, d_max=20, points=None):
    """Sample the ``p(d)`` curve for the selected mode (for visualization).

    Returns a list of ``{"d": int, "p": float}`` over the integer range
    ``[d_min, d_max]``. ``b`` is the priority factor of the selected task.
    """
    params = config["params"]
    k = params.get("k", 0.5)
    mode = params.get("penalty_mode", "continuous")
    max_mult = params.get("max_multiplier")
    series = []
    rng = points if points is not None else range(d_min, d_max + 1)
    for d in rng:
        p = _multiplier(b, k, d, mode)
        if max_mult is not None:
            p = min(p, max_mult)
        series.append({"d": d, "p": p})
    return series
