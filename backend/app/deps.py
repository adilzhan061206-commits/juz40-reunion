"""FastAPI dependencies: current user, role guards, term lookup."""

from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import AuthSession, Term, User, now
from .security import new_token, token_digest


def create_session(db: Session, user: User, response: Response) -> None:
    raw = new_token()
    current = now()
    db.execute(delete(AuthSession).where(AuthSession.expires_at <= current))
    db.add(AuthSession(token_hash=token_digest(raw), user_id=user.id, expires_at=current + settings.session_ttl))
    db.commit()
    response.set_cookie(
        key=settings.cookie_name,
        value=raw,
        max_age=settings.session_ttl,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    raw = request.cookies.get(settings.cookie_name)
    if not raw:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in.")
    session = db.scalar(
        select(AuthSession).where(AuthSession.token_hash == token_digest(raw), AuthSession.expires_at > now())
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Your session has expired.")
    user = db.get(User, session.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account not found.")
    return user


def require_role(*roles: str) -> Callable[..., User]:
    def guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="You do not have access to this area.")
        return user

    return guard


def get_term(db: Session, term_id: int | None) -> Term:
    """Return the requested term, or the default registration term."""
    if term_id is not None:
        term = db.get(Term, term_id)
        if not term:
            raise HTTPException(status_code=404, detail="Term not found.")
        return term
    term = default_registration_term(db)
    if not term:
        raise HTTPException(status_code=404, detail="No academic terms are configured yet.")
    return term


def default_registration_term(db: Session) -> Term | None:
    terms = db.scalars(select(Term).order_by(Term.start_date)).all()
    current = next((t for t in terms if t.is_current), None)
    upcoming_open = [t for t in terms if t.registration_open and (not current or t.start_date > current.start_date)]
    if upcoming_open:
        return upcoming_open[0]
    if current:
        return current
    return terms[-1] if terms else None


def current_term(db: Session) -> Term | None:
    term = db.scalar(select(Term).where(Term.is_current.is_(True)))
    return term or default_registration_term(db)
