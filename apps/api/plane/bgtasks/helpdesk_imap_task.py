import imaplib
import email
from email.header import decode_header
import logging

from celery import shared_task
from django.conf import settings

from plane.db.models import HelpdeskPortal
from plane.app.helpdesk.inbound_processor import process_inbound_email, DiscardEmailException
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane.worker")


def decode_imap_header(header_value):
    if not header_value:
        return ""
    decoded_parts = []
    for part, encoding in decode_header(header_value):
        if isinstance(part, bytes):
            try:
                decoded_parts.append(part.decode(encoding or "utf-8", errors="replace"))
            except LookupError:
                decoded_parts.append(part.decode("utf-8", errors="replace"))
        else:
            decoded_parts.append(part)
    return "".join(decoded_parts)


@shared_task
def poll_imap_inboxes():
    portals = HelpdeskPortal.objects.filter(is_imap_enabled=True)
    for portal in portals:
        if not (portal.imap_host and portal.imap_username and portal.imap_password):
            continue
            
        try:
            port = portal.imap_port or (993 if portal.imap_use_ssl else 143)
            if portal.imap_use_ssl:
                mail = imaplib.IMAP4_SSL(portal.imap_host, port)
            else:
                mail = imaplib.IMAP4(portal.imap_host, port)
                if portal.imap_use_tls:
                    mail.starttls()
            
            mail.login(portal.imap_username, portal.imap_password)
            mail.select("INBOX")
            
            # Search for unread emails
            status, messages = mail.search(None, "UNSEEN")
            if status != "OK":
                mail.logout()
                continue
                
            for num in messages[0].split():
                status, data = mail.fetch(num, "(RFC822)")
                if status != "OK":
                    continue
                    
                raw_email = data[0][1]
                msg = email.message_from_bytes(raw_email)
                
                # Extract headers for processor
                headers_str = ""
                for key, value in msg.items():
                    headers_str += f"{key}: {value}\n"
                    
                from_str = decode_imap_header(msg.get("From", ""))
                
                # We do not verify DKIM/SPF from IMAP yet (requires raw parsing),
                # but we can pass None. We trust IMAP login.
                dkim_field = None
                spf_field = None
                
                text_body = ""
                html_body = ""
                uploaded_files = [] # We could extract attachments, but for MVP let's focus on text
                
                if msg.is_multipart():
                    for part in msg.walk():
                        content_type = part.get_content_type()
                        content_disposition = str(part.get("Content-Disposition"))
                        
                        if "attachment" not in content_disposition:
                            if content_type == "text/plain":
                                try:
                                    text_body += part.get_payload(decode=True).decode()
                                except:
                                    pass
                            elif content_type == "text/html":
                                try:
                                    html_body += part.get_payload(decode=True).decode()
                                except:
                                    pass
                else:
                    content_type = msg.get_content_type()
                    if content_type == "text/plain":
                        try:
                            text_body = msg.get_payload(decode=True).decode()
                        except:
                            pass
                    elif content_type == "text/html":
                        try:
                            html_body = msg.get_payload(decode=True).decode()
                        except:
                            pass
                
                # Send to our processor
                try:
                    process_inbound_email(
                        from_str=from_str,
                        headers_str=headers_str,
                        text_body=text_body,
                        html_body=html_body,
                        uploaded_files=uploaded_files,
                        dkim_field=dkim_field,
                        spf_field=spf_field,
                    )
                except DiscardEmailException as e:
                    logger.info(f"IMAP Email discarded: {e.detail}")
                except Exception as e:
                    log_exception(e)
                
                # Processed, now handle cleanup
                if portal.imap_archive_folder:
                    # Move to archive folder
                    try:
                        mail.copy(num, portal.imap_archive_folder)
                        mail.store(num, "+FLAGS", "\\Deleted")
                    except Exception as e:
                        logger.error(f"Failed to move email to archive {portal.imap_archive_folder}: {e}")
                else:
                    # Just mark as Seen (which IMAP fetch already does, but to be explicit)
                    mail.store(num, "+FLAGS", "\\Seen")
                    
            # Expunge deleted emails (if moved to archive)
            mail.expunge()
            mail.logout()
            
        except Exception as e:
            log_exception(e)
            logger.error(f"Failed to poll IMAP for portal {portal.id}")
