"""Authentication: SDU-account sign-in, local accounts, sessions and password reset."""

from __future__ import annotations

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..deps import create_session, get_current_user
from ..models import AuthSession, PasswordReset, Program, User, now
from ..sdu import client as sdu_client
from ..sdu import parsers
from ..sdu.sync import import_snapshot
from ..security import (
    hash_password,
    login_limiter,
    new_token,
    normalize_email,
    token_digest,
    validate_password,
    verify_password,
)
from ..serializers import user_out
from ..services.notify import send_email

router = APIRouter(prefix="/api/auth", tags=["auth"])
log = logging.getLogger("registration.auth")


class RegisterIn(BaseModel):
    name: str
    email: str
    password: str
    program_id: int | None = None


class LoginIn(BaseModel):
    email: str
    password: str


class SduLoginIn(BaseModel):
    student_id: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=1, max_length=256)


class OtpIn(BaseModel):
    challenge_id: str
    code: str = Field(min_length=3, max_length=12)


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    password: str


class ProfileIn(BaseModel):
    name: str | None = None
    program_id: int | None = None
    email: str | None = None
    password: str | None = None


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _program_or_404(db: Session, program_id: int | None) -> Program | None:
    if program_id is None:
        return None
    program = db.get(Program, program_id)
    if not program or program.owner_id is not None:
        raise HTTPException(422, "Unknown degree programme.")
    return program


# ---------------------------------------------------------------- local accounts


@router.post("/register", status_code=201)
def register(payload: RegisterIn, response: Response, db: Session = Depends(get_db)):
    name = " ".join(payload.name.split())
    if not 2 <= len(name) <= 80:
        raise HTTPException(422, "Name must be 2–80 characters long.")
    email = normalize_email(payload.email)
    validate_password(payload.password)
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account with this e-mail already exists.")
    program = _program_or_404(db, payload.program_id)
    user = User(
        name=name,
        email=email,
        password_hash=hash_password(payload.password),
        role="student",
        program_id=program.id if program else None,
        department_id=program.department_id if program else None,
    )
    db.add(user)
    db.commit()
    create_session(db, user, response)
    return {"user": user_out(user)}


@router.post("/login")
def login(payload: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    login_limiter.check(f"{_client_ip(request)}:{email}")
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect e-mail or password.")
    create_session(db, user, response)
    return {"user": user_out(user)}


# ---------------------------------------------------------------- SDU account


def _sdu_finish(db: Session, client: sdu_client.SduClient, student_id: str, response: Response,
                existing_user: User | None = None) -> dict:
    try:
        snapshot = client.fetch_snapshot(student_id)
    finally:
        client.close()
    user = existing_user or db.scalar(select(User).where(User.sdu_id == student_id))
    created = False
    if user is None:
        user = User(name=snapshot.profile.name or f"Student {student_id}", sdu_id=student_id, role="student")
        db.add(user)
        db.flush()
        created = True
    summary = import_snapshot(db, user, snapshot)
    if existing_user is None:
        create_session(db, user, response)
    return {"status": "ok", "user": user_out(user), "created": created, "sync": summary.as_dict()}


def _sdu_login_start(student_id: str, password: str) -> tuple[str, sdu_client.SduClient, str]:
    if not settings.sdu_enabled:
        raise HTTPException(503, "Sign-in with an SDU account is disabled on this server.")
    client = sdu_client.client_factory()
    try:
        stage, html = client.login(student_id, password)
    except sdu_client.SduError as exc:
        client.http.close()
        log.warning("SDU login failed: %s", exc)
        raise HTTPException(
            502,
            "my.sdu.edu.kz is not reachable from the server right now. Try again later or sign in with e-mail.",
        ) from exc
    if stage == "invalid":
        client.http.close()
        raise HTTPException(401, "Incorrect SDU student ID or password.")
    return stage, client, html


@router.post("/sdu/login")
def sdu_login(payload: SduLoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    student_id = payload.student_id.strip()
    login_limiter.check(f"{_client_ip(request)}:sdu:{student_id}")
    stage, client, html = _sdu_login_start(student_id, payload.password)
    if stage == "otp":
        form = parsers.parse_otp_form(html, client.base_url)
        if form is None:
            client.http.close()
            raise HTTPException(502, "SDU asked for a verification code, but the code form could not be read.")
        challenge = sdu_client.pending_logins.put(
            sdu_client.PendingLogin(client=client, form=form, student_id=student_id,
                                    expires_at=time.time() + sdu_client.PendingStore.TTL, purpose="login")
        )
        return {"status": "otp", "challenge_id": challenge,
                "message": "SDU sent a one-time verification code to your e-mail. Enter it to continue."}
    return _sdu_finish(db, client, student_id, response)


@router.post("/sdu/otp")
def sdu_otp(payload: OtpIn, response: Response, db: Session = Depends(get_db)):
    pending = sdu_client.pending_logins.pop(payload.challenge_id)
    if pending is None:
        raise HTTPException(410, "The verification step expired. Please sign in again.")
    try:
        ok = pending.client.submit_otp(pending.form, payload.code)
    except sdu_client.SduError as exc:
        pending.client.http.close()
        raise HTTPException(502, "my.sdu.edu.kz is not reachable right now.") from exc
    if not ok:
        pending.client.http.close()
        raise HTTPException(401, "Incorrect or expired verification code. Please sign in again.")
    existing = db.get(User, pending.user_id) if pending.user_id else None
    return _sdu_finish(db, pending.client, pending.student_id, response, existing_user=existing)


class SyncIn(BaseModel):
    password: str = Field(min_length=1, max_length=256)
    student_id: str | None = None


@router.post("/sdu/sync")
def sdu_sync(payload: SyncIn, request: Request, response: Response, user: User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    """Re-import (or link) an SDU account for the signed-in user. The password is used once and discarded."""
    student_id = (user.sdu_id or payload.student_id or "").strip()
    if not student_id:
        raise HTTPException(422, "Enter your SDU student ID.")
    other = db.scalar(select(User).where(User.sdu_id == student_id, User.id != user.id))
    if other:
        raise HTTPException(409, "This SDU account is already linked to another profile.")
    login_limiter.check(f"{_client_ip(request)}:sdu:{student_id}")
    stage, client, html = _sdu_login_start(student_id, payload.password)
    if stage == "otp":
        form = parsers.parse_otp_form(html, client.base_url)
        if form is None:
            client.http.close()
            raise HTTPException(502, "SDU asked for a verification code, but the code form could not be read.")
        challenge = sdu_client.pending_logins.put(
            sdu_client.PendingLogin(client=client, form=form, student_id=student_id, user_id=user.id,
                                    expires_at=time.time() + sdu_client.PendingStore.TTL, purpose="sync")
        )
        return {"status": "otp", "challenge_id": challenge,
                "message": "SDU sent a one-time verification code to your e-mail. Enter it to continue."}
    user.sdu_id = student_id
    db.flush()
    return _sdu_finish(db, client, student_id, response, existing_user=user)


# ---------------------------------------------------------------- session


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user": user_out(user)}


@router.patch("/me")
def update_me(payload: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.name is not None:
        name = " ".join(payload.name.split())
        if not 2 <= len(name) <= 120:
            raise HTTPException(422, "Name must be 2–120 characters long.")
        user.name = name
    if payload.program_id is not None:
        program = _program_or_404(db, payload.program_id)
        user.program_id = program.id
        if user.role == "student":
            user.department_id = program.department_id
    if payload.email is not None:
        email = normalize_email(payload.email)
        if db.scalar(select(User.id).where(User.email == email, User.id != user.id)):
            raise HTTPException(409, "An account with this e-mail already exists.")
        user.email = email
    if payload.password:
        validate_password(payload.password)
        if not user.email:
            raise HTTPException(422, "Add an e-mail address before setting a password.")
        user.password_hash = hash_password(payload.password)
    db.commit()
    return {"user": user_out(user)}


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get(settings.cookie_name)
    if raw:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == token_digest(raw)))
        db.commit()
    response.delete_cookie(settings.cookie_name, path="/", samesite="lax", secure=settings.cookie_secure)


@router.post("/forgot-password")
def forgot_password(payload: ForgotIn, db: Session = Depends(get_db)):
    email = normalize_email(payload.email)
    generic = {"message": "If an account exists for this e-mail, a reset link has been sent."}
    user = db.scalar(select(User).where(User.email == email))
    if not user:
        return generic
    raw = new_token()
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None)))
    db.add(PasswordReset(token_hash=token_digest(raw), user_id=user.id, expires_at=now() + settings.reset_ttl))
    db.commit()
    url = f"{settings.base_url}/reset-password?token={raw}"
    delivered = send_email(
        email,
        "Reset your password — SDU Registration Assistant",
        f"Open this link within {settings.reset_ttl // 60} minutes to choose a new password:\n{url}\n\n"
        "If you did not ask for this, ignore this e-mail.",
    )
    if not delivered and not settings.is_production:
        return {"message": "SMTP is not configured — development mode lets you continue right here.",
                "development_reset_token": raw}
    return generic


@router.post("/reset-password")
def reset_password(payload: ResetIn, db: Session = Depends(get_db)):
    validate_password(payload.password)
    record = db.scalar(
        select(PasswordReset).where(
            PasswordReset.token_hash == token_digest(payload.token),
            PasswordReset.used_at.is_(None),
            PasswordReset.expires_at > now(),
        )
    )
    if not record:
        raise HTTPException(400, "This reset link is invalid or has expired.")
    user = db.get(User, record.user_id)
    user.password_hash = hash_password(payload.password)
    record.used_at = now()
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.commit()
    return {"message": "Password updated. You can now sign in with the new password."}
