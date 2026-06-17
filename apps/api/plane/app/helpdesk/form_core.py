from datetime import date

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
            sequence=20000,
            is_system=True,
        ),
    ]


def validate_helpdesk_form_submission(form, payload):
    fields = list(form.fields.filter(deleted_at__isnull=True).order_by("sequence", "created_at"))
    errors = {}
    title = ""
    description = ""
    responses = {}

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
    if not description:
        errors["description"] = "A description is required."

    return {
        "errors": errors,
        "title": title,
        "description": description,
        "responses": responses,
    }
