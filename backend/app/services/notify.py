"""In-app notifications plus best-effort e-mail delivery."""

import logging
import smtplib
import threading
from email.message import EmailMessage

from sqlalchemy.orm import Session

from ..config import settings
from ..models import Notification, User

log = logging.getLogger("registration.notify")


def notify(db: Session, user: User, kind: str, title: str, body: str = "", link: str | None = None,
           email: bool = False) -> Notification:
    item = Notification(user_id=user.id, kind=kind, title=title[:200], body=body, link=link)
    db.add(item)
    if email and user.email:
        send_email_async(user.email, title, f"{body}\n\n{settings.base_url}{link or ''}".strip())
    return item


def send_email_async(recipient: str, subject: str, body: str) -> None:
    if not settings.smtp_host:
        log.info("[email disabled] to=%s subject=%s", recipient, subject)
        return
    threading.Thread(target=send_email, args=(recipient, subject, body), daemon=True).start()


def send_email(recipient: str, subject: str, body: str) -> bool:
    if not settings.smtp_host:
        log.info("[email disabled] to=%s subject=%s\n%s", recipient, subject, body)
        return False
    sender = settings.smtp_from or settings.smtp_username
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = recipient
    message.set_content(body)
    try:
        smtp_class = smtplib.SMTP_SSL if settings.smtp_use_ssl else smtplib.SMTP
        with smtp_class(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if not settings.smtp_use_ssl and settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
        return True
    except (OSError, smtplib.SMTPException):
        log.exception("Failed to send e-mail to %s", recipient)
        return False
