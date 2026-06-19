import re
from datetime import date, datetime, timezone

from django.db import transaction
from django.db.models import F

from plane.db.models.helpdesk import HelpdeskFormField, HelpdeskFormFieldType


def build_default_helpdesk_system_fields(workspace, form):
    return [
        HelpdeskFormField(
            workspace=workspace,
            form=form,
            key="title",
            label="Subject",
            field_type=HelpdeskFormFieldType.SYSTEM_TITLE,
            required=True,
            sequence=10000,
            is_system=True,
        ),
        HelpdeskFormField(
            workspace=workspace,
            form=form,
            key="description",
            label="Description",
            field_type=HelpdeskFormFieldType.SYSTEM_DESCRIPTION,
            required=True,
            sequence=50000,
            is_system=True,
        ),
    ]


def build_default_helpdesk_template_fields(workspace, form):
    """Returns the default form template with Subject, 3 cascading category fields, and Description."""
    return [
        HelpdeskFormField(
            workspace=workspace,
            form=form,
            key="title",
            label="Subject",
            field_type=HelpdeskFormFieldType.SYSTEM_TITLE,
            required=True,
            sequence=10000,
            is_system=True,
        ),
        HelpdeskFormField(
            workspace=workspace,
            form=form,
            key="category_1",
            label="1st Request Category",
            field_type=HelpdeskFormFieldType.CASCADE_SELECT,
            required=False,
            sequence=20000,
            is_system=False,
            parent_field_key="",
            options=[],
        ),
        HelpdeskFormField(
            workspace=workspace,
            form=form,
            key="category_2",
            label="2nd Request Category",
            field_type=HelpdeskFormFieldType.CASCADE_SELECT,
            required=False,
            sequence=30000,
            is_system=False,
            parent_field_key="category_1",
            options=[],
        ),
        HelpdeskFormField(
            workspace=workspace,
            form=form,
            key="category_3",
            label="3rd Request Category",
            field_type=HelpdeskFormFieldType.CASCADE_SELECT,
            required=False,
            sequence=40000,
            is_system=False,
            parent_field_key="category_2",
            options=[],
        ),
        HelpdeskFormField(
            workspace=workspace,
            form=form,
            key="description",
            label="Request Description",
            field_type=HelpdeskFormFieldType.SYSTEM_DESCRIPTION,
            required=False,
            sequence=50000,
            is_system=True,
        ),
    ]


def _cascade_allowed_values(field, parent_value):
    """
    Returns the set of allowed values for a cascade_select field given the
    selected parent value.

    - Root fields (parent_field_key == ""): all values from field.options.
    - Child fields: field.options filtered by field.parent_mapping[parent_value].
      parent_mapping = { "parent_value": ["child_value1", "child_value2"], ... }
    """
    all_values = {
        str(opt.get("value", ""))
        for opt in field.options
        if isinstance(opt, dict) and opt.get("value") is not None
    }
    if not field.parent_field_key:
        return all_values
    if not parent_value:
        return set()
    allowed_by_mapping = field.parent_mapping.get(str(parent_value))
    if allowed_by_mapping is None:
        # No mapping defined for this parent value → allow nothing
        return set()
    return {str(v) for v in allowed_by_mapping} & all_values


def validate_helpdesk_form_submission(form, payload):
    fields = list(form.fields.filter(deleted_at__isnull=True).order_by("sequence", "created_at"))
    errors = {}
    title = ""
    description = ""
    responses = {}

    # Build a key→field map for cascade parent lookups
    field_map = {f.key: f for f in fields}

    for field in fields:
        value = payload.get(field.key)
        missing = value is None or (isinstance(value, str) and value.strip() == "")

        if field.required and missing and field.field_type != HelpdeskFormFieldType.CHECKBOX:
            errors[field.key] = "This field is required."
            continue

        if field.field_type in {
            HelpdeskFormFieldType.SYSTEM_TITLE,
            HelpdeskFormFieldType.SYSTEM_DESCRIPTION,
            HelpdeskFormFieldType.SHORT_TEXT,
            HelpdeskFormFieldType.LONG_TEXT,
        }:
            if missing:
                normalized = ""
            elif not isinstance(value, str):
                errors[field.key] = "This field must be a string."
                continue
            else:
                normalized = value.strip()
        elif field.field_type == HelpdeskFormFieldType.SELECT:
            if missing:
                normalized = ""
            elif not isinstance(value, str):
                errors[field.key] = "This field must be a string."
                continue
            else:
                allowed_values = {
                    str(option.get("value"))
                    for option in field.options
                    if isinstance(option, dict) and option.get("value") is not None
                }
                normalized = value.strip()
                if normalized and normalized not in allowed_values:
                    errors[field.key] = "Please select a valid option."
                    continue
        elif field.field_type == HelpdeskFormFieldType.CASCADE_SELECT:
            if missing:
                normalized = ""
            elif not isinstance(value, str):
                errors[field.key] = "This field must be a string."
                continue
            else:
                normalized = value.strip()
                if normalized:
                    parent_value_for_field = responses.get(field.parent_field_key, "") if field.parent_field_key else ""
                    allowed = _cascade_allowed_values(field, parent_value_for_field)
                    if allowed is not None and normalized not in allowed:
                        errors[field.key] = "Please select a valid option."
                        continue
        elif field.field_type == HelpdeskFormFieldType.CHECKBOX:
            if value is None:
                normalized = False
            elif not isinstance(value, bool):
                errors[field.key] = "This field must be a boolean."
                continue
            else:
                normalized = value
            if field.required and normalized is not True:
                errors[field.key] = "This field must be checked."
                continue
        elif field.field_type == HelpdeskFormFieldType.DATE:
            if missing:
                normalized = ""
            elif not isinstance(value, str):
                errors[field.key] = "This field must be a date string."
                continue
            else:
                normalized = value.strip()
                try:
                    date.fromisoformat(normalized)
                except ValueError:
                    errors[field.key] = "Please provide a valid date in YYYY-MM-DD format."
                    continue
        else:
            continue

        if field.field_type == HelpdeskFormFieldType.SYSTEM_TITLE:
            title = normalized
        elif field.field_type == HelpdeskFormFieldType.SYSTEM_DESCRIPTION:
            description = normalized
        else:
            responses[field.key] = normalized

    if not title:
        errors["title"] = "A title is required."

    return {
        "errors": errors,
        "title": title,
        "description": description,
        "responses": responses,
    }


def generate_ticket_display_id(form) -> str:
    """
    Atomically increments form.ticket_id_counter and generates a display_id
    from the form's ticket_id_pattern.

    Pattern tokens:
      YYYY  → 4-digit year
      YY    → 2-digit year
      MM    → 2-digit month
      DD    → 2-digit day
      ###.. → zero-padded counter (number of # = padding width, min 1)

    Example: "ITR-.YYYY.-.#####" → "ITR-2026-00042"

    Returns "" if ticket_id_pattern is not set.
    """
    if not form.ticket_id_pattern:
        return ""

    with transaction.atomic():
        # Atomic increment using F() expression
        from plane.db.models.helpdesk import HelpdeskForm as _HelpdeskForm

        _HelpdeskForm.objects.filter(pk=form.pk).update(ticket_id_counter=F("ticket_id_counter") + 1)
        form.refresh_from_db(fields=["ticket_id_counter"])
        counter = form.ticket_id_counter

    now = datetime.now(tz=timezone.utc)
    pattern = form.ticket_id_pattern

    pattern = pattern.replace("YYYY", now.strftime("%Y"))
    pattern = pattern.replace("YY", now.strftime("%y"))
    pattern = pattern.replace("MM", now.strftime("%m"))
    pattern = pattern.replace("DD", now.strftime("%d"))

    def replace_hashes(m):
        width = len(m.group(0))
        return str(counter).zfill(width)

    pattern = re.sub(r"#+", replace_hashes, pattern)

    return pattern
