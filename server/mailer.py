"""Outgoing email for account confirmation and password reset (Twin Queens).

Configured with environment variables:
  SMTP_HOST, SMTP_PORT (default 465), SMTP_USER, SMTP_PASSWORD,
  SMTP_FROM (default SMTP_USER), SMTP_STARTTLS=1 to use STARTTLS on port 587.
Without SMTP_HOST, messages are only written to the log (useful in development).
"""

from __future__ import annotations

import asyncio
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr

log = logging.getLogger(__name__)


def mail_configured() -> bool:
    return bool(os.getenv("SMTP_HOST"))


def _send_sync(to: str, subject: str, text: str) -> None:
    host = os.environ["SMTP_HOST"]
    port = int(os.getenv("SMTP_PORT", "465"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", user)

    msg = EmailMessage()
    msg["From"] = formataddr(("Twin Queens Chess", sender))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)

    context = ssl.create_default_context()
    if os.getenv("SMTP_STARTTLS") == "1":
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.starttls(context=context)
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as smtp:
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)


async def send_mail(to: str, subject: str, text: str) -> bool:
    """Send a plain-text email. Returns False if it could not be sent."""
    if not mail_configured():
        log.warning("SMTP is not configured; email to %s not sent:\n%s\n%s", to, subject, text)
        return False
    try:
        await asyncio.to_thread(_send_sync, to, subject, text)
        return True
    except Exception as e:  # noqa: BLE001 - mail failures must never break sign-up
        log.error("Failed to send email to %s: %s", to, e)
        return False
