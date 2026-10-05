"""HTTP client for my.sdu.edu.kz.

The student's SDU password is used only for the login POST to SDU's own ``loginAuth.php``; it is
never stored or logged. The authenticated cookie jar lives in memory for the duration of one sync
(or for a few minutes while a 2FA code is pending).
"""

from __future__ import annotations

import secrets
import threading
import time
from dataclasses import dataclass, field
from urllib.parse import urlencode

import httpx

from ..config import settings
from . import parsers

USER_AGENT = "Mozilla/5.0 (compatible; SDU-Registration-Assistant/1.0)"


class SduError(Exception):
    """Raised when the portal cannot be reached or returns something unexpected."""


class SduAuthError(SduError):
    """Raised for wrong credentials or an expired 2FA code."""


@dataclass
class SduSnapshot:
    """Everything imported from the portal in one sync."""

    student_id: str
    profile: parsers.Profile = field(default_factory=parsers.Profile)
    term: parsers.TermOption | None = None
    classes: list[parsers.ScheduleClass] = field(default_factory=list)
    grades: list[parsers.GradeRow] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class SduClient:
    def __init__(self, base_url: str | None = None, transport: httpx.BaseTransport | None = None):
        self.base_url = (base_url or settings.sdu_base_url).rstrip("/")
        self.http = httpx.Client(
            base_url=self.base_url,
            timeout=settings.sdu_timeout,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
            transport=transport,
        )

    # ------------------------------------------------------------ low level

    def _request(self, method: str, url: str, **kwargs) -> str:
        try:
            response = self.http.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            raise SduError(f"Cannot reach {self.base_url}: {exc.__class__.__name__}") from exc
        if response.status_code >= 500:
            raise SduError(f"{self.base_url} answered with HTTP {response.status_code}.")
        return response.text

    def get_module(self, module: str = "") -> str:
        return self._request("GET", f"/index.php?mod={module}" if module else "/index.php")

    def post(self, url: str, fields: list[tuple[str, str]]) -> str:
        # Encode by hand to keep field order and repeated keys exactly as the portal's forms send them.
        return self._request(
            "POST", url, content=urlencode(fields).encode(),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    def close(self) -> None:
        try:
            self.http.get("/logout.php")
        except httpx.HTTPError:
            pass
        self.http.close()

    # ------------------------------------------------------------ auth

    def login(self, username: str, password: str) -> tuple[str, str]:
        """Submit credentials; returns (stage, html) where stage is ok | otp | invalid."""
        self._request("GET", "/")  # prime the PHP session cookie
        html = self.post(
            "/loginAuth.php",
            [("username", username), ("password", password), ("modstring", ""), ("LogIn", "Log in")],
        )
        return parsers.detect_login_stage(html), html

    def submit_otp(self, form: parsers.OtpForm, code: str) -> bool:
        html = self.post(form.action, [*form.fields, (form.code_field, code.strip())])
        if parsers.looks_authenticated(html):
            return True
        # Some portals redirect to a page that does not include the menu; check the home page.
        return parsers.looks_authenticated(self.get_module(""))

    # ------------------------------------------------------------ data

    def fetch_snapshot(self, student_id: str) -> SduSnapshot:
        snapshot = SduSnapshot(student_id=student_id)
        try:
            snapshot.profile = parsers.parse_profile(self.get_module(""))
        except SduError as exc:
            snapshot.warnings.append(f"Profile: {exc}")

        try:
            page = self.get_module("schedule")
            term = parsers.selected_term(parsers.parse_terms(page))
            if term is None:
                snapshot.warnings.append("Could not find the current term on the schedule page.")
            else:
                snapshot.term = term
                grid = self.post(
                    "/index.php",
                    [
                        ("mod", "schedule"),
                        ("ajx", "1"),
                        ("action", "showSchedule"),
                        ("year", str(term.year)),
                        ("term", str(term.number)),
                        ("type", "I"),
                        ("details", "0"),
                    ],
                )
                snapshot.classes = parsers.parse_schedule(grid)
                if not snapshot.classes:
                    snapshot.warnings.append("Your SDU schedule for the current term is empty.")
        except SduError as exc:
            snapshot.warnings.append(f"Schedule: {exc}")

        try:
            snapshot.grades = self._fetch_all_grades()
        except SduError as exc:
            snapshot.warnings.append(f"Grades: {exc}")
        return snapshot

    def _fetch_all_grades(self) -> list[parsers.GradeRow]:
        rows: list[parsers.GradeRow] = []
        # The transcript page lists every finished term in one document.
        transcript = self.get_module("transkript")
        rows.extend(parsers.parse_grade_rows(transcript))
        # The grades module adds the in-progress term (grade "IP") and anything not yet on the transcript.
        page = self.get_module("grades")
        known = {(r.code, r.term_code) for r in rows}
        for option in parsers.parse_terms(page):
            payload = self.post(
                "/index.php",
                [("ajx", "1"), ("mod", "grades"), ("action", "GetGrades"), ("yt", f"{option.year}#{option.number}")],
            )
            for row in parsers.parse_grade_rows(payload, term_code=option.code):
                same_course = [r for r in rows if r.code == row.code and r.term_code in ("", row.term_code)]
                if (row.code, row.term_code) in known or (same_course and same_course[0].grade):
                    continue
                rows.append(row)
                known.add((row.code, row.term_code))
        return rows


# ---------------------------------------------------------------- pending 2FA logins


@dataclass
class PendingLogin:
    client: SduClient
    form: parsers.OtpForm
    student_id: str
    expires_at: float
    purpose: str  # "login" | "sync"
    user_id: int | None = None


class PendingStore:
    TTL = 300

    def __init__(self) -> None:
        self._items: dict[str, PendingLogin] = {}
        self._lock = threading.Lock()

    def put(self, item: PendingLogin) -> str:
        key = secrets.token_urlsafe(24)
        with self._lock:
            self._sweep()
            self._items[key] = item
        return key

    def pop(self, key: str) -> PendingLogin | None:
        with self._lock:
            self._sweep()
            return self._items.pop(key, None)

    def _sweep(self) -> None:
        current = time.time()
        for key in [k for k, v in self._items.items() if v.expires_at < current]:
            self._items.pop(key).client.http.close()


pending_logins = PendingStore()

# Tests replace this factory to inject an ``httpx.MockTransport``.
client_factory = SduClient
