"""Bridge between the persisted KpiConfig model and the pure engine contract.

The engine never touches the ORM. These helpers turn a KpiConfig row (or the
seed defaults) into the plain dict the engine expects.
"""

from plane.db.models.kpi import default_kpi_tables


DEFAULT_PARAMS = {
    "penalty_mode": "continuous",
    "k": 0.5,
    "day_count": "calendar",
    "day_rounding": "truncate",
    "allow_negative": True,
    "max_multiplier": None,
    "vf_decimals": 2,
}


def default_contract():
    """The seed contract used when no KpiConfig exists at any level."""
    return {"tables": default_kpi_tables(), "params": dict(DEFAULT_PARAMS)}


def model_to_contract(config):
    """Convert a ``KpiConfig`` instance into the engine contract dict."""
    return {
        "tables": config.tables or default_kpi_tables(),
        "params": {
            "penalty_mode": config.penalty_mode,
            "k": config.k,
            "day_count": config.day_count,
            "day_rounding": config.day_rounding,
            "allow_negative": config.allow_negative,
            "max_multiplier": config.max_multiplier,
            "vf_decimals": config.vf_decimals,
        },
    }


def resolve_contract(workspace, project_id):
    """Resolve the effective contract: project -> workspace default -> seed.

    Returns ``(contract_dict, source_config_or_None)``.
    """
    from plane.db.models.kpi import KpiConfig

    cfg = KpiConfig.objects.filter(workspace=workspace, project_id=project_id).first()
    if cfg is None:
        cfg = KpiConfig.objects.filter(workspace=workspace, project__isnull=True).first()
    if cfg is None:
        return default_contract(), None
    return model_to_contract(cfg), cfg
