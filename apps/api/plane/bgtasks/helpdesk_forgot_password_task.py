# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging

# Third party imports
from celery import shared_task

# Django imports
from django.core.mail import EmailMultiAlternatives, get_connection
from django.template.loader import render_to_string

# Module imports
from plane.bgtasks.helpdesk_email_task import normalize_tls_ssl
from plane.db.models.helpdesk import HelpdeskPortal
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception


@shared_task
def helpdesk_forgot_password(name, email, public_slug, token, current_site):
    try:
        relative_link = f"/helpdesk/p/{public_slug}/reset-password?token={token}"
        abs_url = str(current_site).rstrip("/") + relative_link

        (
            EMAIL_HOST,
            EMAIL_HOST_USER,
            EMAIL_HOST_PASSWORD,
            EMAIL_PORT,
            EMAIL_USE_TLS,
            EMAIL_USE_SSL,
            EMAIL_FROM,
        ) = get_email_configuration()

        from_email = EMAIL_FROM

        # Check if portal has custom SMTP configured
        portal = HelpdeskPortal.objects.filter(public_slug=public_slug).first()
        if portal:
            if portal.no_reply_email_address:
                from_email = portal.no_reply_email_address
            elif portal.default_agent_email_address:
                from_email = portal.default_agent_email_address

            if portal.smtp_host:
                EMAIL_HOST = portal.smtp_host
                EMAIL_PORT = portal.smtp_port or 587
                EMAIL_HOST_USER = portal.smtp_username or ""
                EMAIL_HOST_PASSWORD = portal.smtp_password or ""
                EMAIL_USE_TLS = "1" if portal.smtp_use_tls else "0"
                EMAIL_USE_SSL = "1" if portal.smtp_use_ssl else "0"

        EMAIL_USE_TLS, EMAIL_USE_SSL = normalize_tls_ssl(
            EMAIL_USE_TLS, EMAIL_USE_SSL, EMAIL_PORT
        )

        subject = "Reset your support portal password"

        context = {
            "first_name": name,
            "forgot_password_url": abs_url,
            "email": email,
        }

        html_content = render_to_string("emails/helpdesk/forgot_password.html", context)

        text_content = generate_plain_text_from_html(html_content)

        connection = get_connection(
            host=EMAIL_HOST,
            port=int(EMAIL_PORT),
            username=EMAIL_HOST_USER,
            password=EMAIL_HOST_PASSWORD,
            use_tls=EMAIL_USE_TLS == "1",
            use_ssl=EMAIL_USE_SSL == "1",
        )

        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=from_email,
            to=[email],
            connection=connection,
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send()
        logging.getLogger("plane.worker").info("Helpdesk password reset email sent successfully")
        return
    except Exception as e:
        log_exception(e)
        return

