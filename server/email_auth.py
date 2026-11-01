"""Sign-up and sign-in with username/email and password (Twin Queens).

Accounts created here are ordinary users with oauth_provider "email" and oauth_id set to the
lower-cased email address, so the rest of the server treats them like OAuth users.
Passwords are stored as scrypt hashes. Password reset and email confirmation use one-time
tokens whose SHA-256 hash is kept in the database.

Routes:
  GET  /login/email            sign-in / sign-up / reset page
  POST /api/auth/signup        {username, email, password}
  POST /api/auth/login         {login, password}            login = username or email
  POST /api/auth/forgot        {email}
  POST /api/auth/reset         {token, password}
  GET  /auth/verify?token=...  confirm email address
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import re
import secrets
import time
from collections import defaultdict, deque
from datetime import UTC, datetime, timedelta
from pathlib import Path

import aiohttp_session
from aiohttp import web
from client_ip import get_client_ip
from const import reserved
from json_utils import json_response
from login import USERNAME_LOWER_FIELD, normalized_username, username_exists
from mailer import mail_configured, send_mail
from pychess_global_app_state_utils import get_app_state
from pymongo.errors import DuplicateKeyError
from request_utils import read_json_data
from security_evasion import (
    collect_client_signals,
    is_signup_blocked_by_signals,
    remember_user_signals,
)
from session_security import (
    auth_version_from_user_document,
    authenticate_session,
    revoke_user_sessions_for_username,
)
from settings import URI
from typedefs import REQUEST_NEW_SESSION_KEY
from user_stats import DEFAULT_USER_COUNT

log = logging.getLogger(__name__)

PROVIDER = "email"
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_-]{3,20}$")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,63}$")
MIN_PASSWORD = 8
MAX_PASSWORD = 200
RESET_TTL = timedelta(hours=1)
VERIFY_TTL = timedelta(days=7)

# scrypt parameters: ~16 MB memory, fast enough for a small server
SCRYPT_N, SCRYPT_R, SCRYPT_P = 2**14, 8, 1

PAGE_PATH = Path(__file__).resolve().parent.parent / "templates" / "email_auth.html"


# ---------- passwords ----------
def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=32
    )
    return "scrypt$%d$%d$%d$%s$%s" % (
        SCRYPT_N,
        SCRYPT_R,
        SCRYPT_P,
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    )


def check_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algo, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(hash_b64)
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.b64decode(salt_b64),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
        return hmac.compare_digest(digest, expected)
    except (ValueError, TypeError):
        return False


# ---------- simple per-IP rate limit ----------
_attempts: dict[str, deque[float]] = defaultdict(deque)


def rate_limited(request: web.Request, action: str, limit: int, window: float) -> bool:
    key = "%s:%s" % (action, get_client_ip(request) or "?")
    now = time.monotonic()
    q = _attempts[key]
    while q and now - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        return True
    q.append(now)
    if len(_attempts) > 50000:  # keep memory bounded
        _attempts.clear()
    return False


def err(code: str, status: int = 400) -> web.Response:
    return json_response({"error": code}, status=status)


def _token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


async def _send_verification(app_state, username: str, email: str) -> None:
    raw, token_hash = _token()
    now = datetime.now(UTC)
    await app_state.db.email_token.insert_one(
        {
            "_id": token_hash,
            "kind": "verify",
            "username": username,
            "email": email,
            "createdAt": now,
            "expiresAt": now + VERIFY_TTL,
        }
    )
    link = "%s/auth/verify?token=%s" % (URI, raw)
    await send_mail(
        email,
        "Twin Queens Chess — подтвердите email / confirm your email",
        "Здравствуйте, %s!\n\nПодтвердите адрес почты для аккаунта Twin Queens Chess:\n%s\n\n"
        "Hello %s!\n\nPlease confirm the email address for your Twin Queens Chess account:\n%s\n\n"
        "Если вы не регистрировались, просто проигнорируйте это письмо.\n"
        "If you did not sign up, just ignore this message.\n" % (username, link, username, link),
    )


# ---------- handlers ----------
async def email_auth_page(_request: web.Request) -> web.StreamResponse:
    return web.FileResponse(PAGE_PATH, headers={"Cache-Control": "no-store"})


async def signup(request: web.Request) -> web.StreamResponse:
    if rate_limited(request, "signup", 5, 3600):
        return err("rate_limited", 429)
    data = await read_json_data(request)
    if data is None:
        return err("bad_request")
    username = str(data.get("username", "")).strip()
    email = str(data.get("email", "")).strip()
    password = str(data.get("password", ""))

    if not USERNAME_RE.match(username):
        return err("bad_username")
    if reserved(username):
        return err("username_reserved")
    if not EMAIL_RE.match(email):
        return err("bad_email")
    if not (MIN_PASSWORD <= len(password) <= MAX_PASSWORD):
        return err("weak_password")

    app_state = get_app_state(request.app)
    email_lower = email.lower()
    if await username_exists(app_state, username):
        return err("username_taken")
    if await app_state.db.user.find_one(
        {"oauth_provider": PROVIDER, "oauth_id": email_lower}, projection={"_id": 1}
    ):
        return err("email_taken")

    signals = collect_client_signals(request)
    blocked, match_reason = await is_signup_blocked_by_signals(app_state.db, signals)
    now = datetime.now(UTC)
    doc = {
        "_id": username,
        USERNAME_LOWER_FIELD: normalized_username(username),
        "title": "",
        "oauth_id": email_lower,
        "oauth_provider": PROVIDER,
        "email": email,
        "emailVerified": False,
        "passwordHash": hash_password(password),
        "createdAt": now,
        "perfs": {},
        "pperfs": {},
        "count": dict(DEFAULT_USER_COUNT),
        "enabled": not blocked,
        "shadowban": False,
    }
    if blocked:
        log.warning("Auto-closing new email account %s (%s match)", username, match_reason)
        doc["security"] = {
            "lastAutoCloseAt": now,
            "lastAutoCloseReason": match_reason,
            "lastAutoCloseSource": "signup",
        }
    try:
        await app_state.db.user.insert_one(doc)
    except DuplicateKeyError:
        return err("username_taken")
    except Exception as e:  # noqa: BLE001
        log.error("Failed to create email user %s: %s", username, e)
        return err("server_error", 500)

    await remember_user_signals(app_state.db, username, signals)
    if blocked:
        return err("blocked", 403)

    session = await aiohttp_session.get_session(request)
    authenticate_session(session, username, 0)
    request[REQUEST_NEW_SESSION_KEY] = True
    log.info("Created new user %s via email signup", username)
    await _send_verification(app_state, username, email)
    return json_response({"success": True, "mail": mail_configured()})


async def login_with_password(request: web.Request) -> web.StreamResponse:
    if rate_limited(request, "login", 10, 600):
        return err("rate_limited", 429)
    data = await read_json_data(request)
    if data is None:
        return err("bad_request")
    login = str(data.get("login", "")).strip()
    password = str(data.get("password", ""))
    if not login or not password:
        return err("bad_credentials")

    app_state = get_app_state(request.app)
    if "@" in login:
        query = {"oauth_provider": PROVIDER, "oauth_id": login.lower()}
    else:
        query = {USERNAME_LOWER_FIELD: normalized_username(login), "oauth_provider": PROVIDER}
    user = await app_state.db.user.find_one(query)
    if user is None or not check_password(password, user.get("passwordHash")):
        return err("bad_credentials", 401)
    if not user.get("enabled", True):
        return err("closed", 403)

    session = await aiohttp_session.get_session(request)
    authenticate_session(session, user["_id"], auth_version_from_user_document(user))
    request[REQUEST_NEW_SESSION_KEY] = True
    session.pop("closed_account_user", None)
    await remember_user_signals(app_state.db, user["_id"], collect_client_signals(request))
    return json_response({"success": True})


async def forgot_password(request: web.Request) -> web.StreamResponse:
    if rate_limited(request, "forgot", 5, 3600):
        return err("rate_limited", 429)
    if not mail_configured():
        return err("mail_unavailable", 503)
    data = await read_json_data(request)
    if data is None:
        return err("bad_request")
    email = str(data.get("email", "")).strip()
    if not EMAIL_RE.match(email):
        return err("bad_email")

    app_state = get_app_state(request.app)
    user = await app_state.db.user.find_one({"oauth_provider": PROVIDER, "oauth_id": email.lower()})
    # Same answer whether or not the address exists, so the form cannot be used to look up users.
    if user is not None and user.get("enabled", True):
        raw, token_hash = _token()
        now = datetime.now(UTC)
        await app_state.db.email_token.delete_many(
            {"$or": [{"expiresAt": {"$lt": now}}, {"username": user["_id"], "kind": "reset"}]}
        )
        await app_state.db.email_token.insert_one(
            {
                "_id": token_hash,
                "kind": "reset",
                "username": user["_id"],
                "createdAt": now,
                "expiresAt": now + RESET_TTL,
            }
        )
        link = "%s/login/email#reset=%s" % (URI, raw)
        await send_mail(
            user.get("email", email),
            "Twin Queens Chess — восстановление пароля / password reset",
            "Здравствуйте, %s!\n\nЧтобы задать новый пароль, откройте ссылку (действует 1 час):\n%s\n\n"
            "Hello %s!\n\nTo set a new password, open this link (valid for 1 hour):\n%s\n\n"
            "Если вы не запрашивали смену пароля, проигнорируйте письмо.\n"
            "If you did not ask for this, just ignore this message.\n"
            % (user["_id"], link, user["_id"], link),
        )
    return json_response({"success": True})


async def reset_password(request: web.Request) -> web.StreamResponse:
    if rate_limited(request, "reset", 10, 3600):
        return err("rate_limited", 429)
    data = await read_json_data(request)
    if data is None:
        return err("bad_request")
    raw = str(data.get("token", ""))
    password = str(data.get("password", ""))
    if not (MIN_PASSWORD <= len(password) <= MAX_PASSWORD):
        return err("weak_password")

    app_state = get_app_state(request.app)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    token = await app_state.db.email_token.find_one_and_delete(
        {"_id": token_hash, "kind": "reset", "expiresAt": {"$gt": datetime.now(UTC)}}
    )
    if token is None:
        return err("bad_token")
    username = token["username"]
    await app_state.db.user.update_one(
        {"_id": username}, {"$set": {"passwordHash": hash_password(password)}}
    )
    # A new session generation signs the account out on every other device.
    await revoke_user_sessions_for_username(app_state, username)
    user = await app_state.db.user.find_one({"_id": username})
    if user is None or not user.get("enabled", True):
        return err("closed", 403)
    session = await aiohttp_session.get_session(request)
    authenticate_session(session, username, auth_version_from_user_document(user))
    request[REQUEST_NEW_SESSION_KEY] = True
    return json_response({"success": True})


async def verify_email(request: web.Request) -> web.StreamResponse:
    raw = request.rel_url.query.get("token", "")
    app_state = get_app_state(request.app)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    token = await app_state.db.email_token.find_one_and_delete(
        {"_id": token_hash, "kind": "verify", "expiresAt": {"$gt": datetime.now(UTC)}}
    )
    if token is not None:
        await app_state.db.user.update_one(
            {"_id": token["username"], "oauth_id": token["email"].lower()},
            {"$set": {"emailVerified": True}},
        )
        return web.HTTPFound("/login/email#verified")
    return web.HTTPFound("/login/email#verify-failed")
