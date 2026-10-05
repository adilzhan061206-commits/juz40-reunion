"""ORM models for the Intelligent Course Registration Assistant."""

import time
from typing import Optional

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now() -> int:
    return int(time.time())


# ---------------------------------------------------------------- organisation


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)
    name: Mapped[str] = mapped_column(String(160))


class Program(Base):
    """A degree programme. ``owner_id`` is set for a personal curriculum imported by a student."""

    __tablename__ = "programs"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(200))
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    total_ects: Mapped[int] = mapped_column(Integer, default=240)

    department: Mapped[Optional[Department]] = relationship()
    groups: Mapped[list["RequirementGroup"]] = relationship(
        back_populates="program", cascade="all, delete-orphan", order_by="RequirementGroup.sort"
    )


class RequirementGroup(Base):
    """A block of a degree audit, e.g. "Core Major" or "Major Electives".

    ``kind`` is ``required`` (every listed course is needed) or ``elective`` (any listed course
    counts until ``ects_required`` is reached).
    """

    __tablename__ = "requirement_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    program_id: Mapped[int] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    category: Mapped[str] = mapped_column(String(40))  # core | general | science | elective
    kind: Mapped[str] = mapped_column(String(16), default="required")
    ects_required: Mapped[int] = mapped_column(Integer, default=0)
    sort: Mapped[int] = mapped_column(Integer, default=0)

    program: Mapped[Program] = relationship(back_populates="groups")
    items: Mapped[list["RequirementCourse"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", order_by="RequirementCourse.id"
    )


class RequirementCourse(Base):
    __tablename__ = "requirement_courses"
    __table_args__ = (UniqueConstraint("group_id", "course_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("requirement_groups.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    semester: Mapped[Optional[int]] = mapped_column(Integer)

    group: Mapped[RequirementGroup] = relationship(back_populates="items")
    course: Mapped["Course"] = relationship()


# ---------------------------------------------------------------- people


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[Optional[str]] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(512))
    role: Mapped[str] = mapped_column(String(16), default="student")  # student | advisor | admin
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    program_id: Mapped[Optional[int]] = mapped_column(ForeignKey("programs.id", ondelete="SET NULL"))
    sdu_id: Mapped[Optional[str]] = mapped_column(String(32), unique=True, index=True)
    financial_hold: Mapped[bool] = mapped_column(Boolean, default=False)
    calendar_token: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    last_sdu_sync: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[int] = mapped_column(Integer, default=now)

    department: Mapped[Optional[Department]] = relationship()
    program: Mapped[Optional[Program]] = relationship(foreign_keys=[program_id])


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[int] = mapped_column(Integer, index=True)


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[int] = mapped_column(Integer)
    used_at: Mapped[Optional[int]] = mapped_column(Integer)


# ---------------------------------------------------------------- catalogue


class Term(Base):
    __tablename__ = "terms"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True)  # "2026-1" (SDU uses 2026#1)
    name: Mapped[str] = mapped_column(String(80))
    start_date: Mapped[str] = mapped_column(String(10))  # ISO yyyy-mm-dd
    end_date: Mapped[str] = mapped_column(String(10))
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)
    registration_open: Mapped[bool] = mapped_column(Boolean, default=False)


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # "CSS 105"
    title: Mapped[str] = mapped_column(String(200))
    credits: Mapped[int] = mapped_column(Integer, default=3)  # local credits
    ects: Mapped[float] = mapped_column(Float, default=5)
    hours: Mapped[Optional[str]] = mapped_column(String(16))  # "2+2+0" lecture+practice+lab
    description: Mapped[Optional[str]] = mapped_column(Text)
    department_id: Mapped[Optional[int]] = mapped_column(ForeignKey("departments.id"))
    source: Mapped[str] = mapped_column(String(16), default="catalog")  # catalog | sdu | curriculum

    department: Mapped[Optional[Department]] = relationship()
    requisites: Mapped[list["Prerequisite"]] = relationship(
        foreign_keys="Prerequisite.course_id", cascade="all, delete-orphan"
    )


class Prerequisite(Base):
    __tablename__ = "prerequisites"
    __table_args__ = (UniqueConstraint("course_id", "requires_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    requires_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(8), default="pre")  # pre | co

    requires: Mapped[Course] = relationship(foreign_keys=[requires_id])


class Section(Base):
    __tablename__ = "sections"
    __table_args__ = (UniqueConstraint("course_id", "term_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"), index=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("terms.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(16))  # "01-N" lecture, "01-P" practice, "01-L" lab
    kind: Mapped[str] = mapped_column(String(16), default="lecture")  # lecture | practice | lab
    instructor: Mapped[Optional[str]] = mapped_column(String(120))
    capacity: Mapped[int] = mapped_column(Integer, default=30)
    source: Mapped[str] = mapped_column(String(16), default="catalog")

    course: Mapped[Course] = relationship()
    term: Mapped[Term] = relationship()
    meetings: Mapped[list["Meeting"]] = relationship(
        back_populates="section", cascade="all, delete-orphan", order_by="(Meeting.day, Meeting.start_min)"
    )


class Meeting(Base):
    __tablename__ = "meetings"

    id: Mapped[int] = mapped_column(primary_key=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"), index=True)
    day: Mapped[int] = mapped_column(Integer)  # 0 = Monday .. 5 = Saturday
    start_min: Mapped[int] = mapped_column(Integer)  # minutes after midnight
    end_min: Mapped[int] = mapped_column(Integer)
    room: Mapped[Optional[str]] = mapped_column(String(40))

    section: Mapped[Section] = relationship(back_populates="meetings")


# ---------------------------------------------------------------- registration


class Enrollment(Base):
    __tablename__ = "enrollments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="enrolled")  # enrolled | dropped
    source: Mapped[str] = mapped_column(String(16), default="portal")  # portal | sdu | waitlist
    created_at: Mapped[int] = mapped_column(Integer, default=now)

    section: Mapped[Section] = relationship()
    user: Mapped[User] = relationship()


class CartItem(Base):
    """The schedule draft ("shopping cart") a student builds before registering."""

    __tablename__ = "cart_items"
    __table_args__ = (UniqueConstraint("user_id", "section_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"))
    created_at: Mapped[int] = mapped_column(Integer, default=now)

    section: Mapped[Section] = relationship()


class ScheduleConfirmation(Base):
    __tablename__ = "schedule_confirmations"
    __table_args__ = (UniqueConstraint("user_id", "term_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    term_id: Mapped[int] = mapped_column(ForeignKey("terms.id", ondelete="CASCADE"))
    confirmed_at: Mapped[int] = mapped_column(Integer, default=now)


class TranscriptEntry(Base):
    __tablename__ = "transcript_entries"
    __table_args__ = (UniqueConstraint("user_id", "course_id", "term_code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    term_code: Mapped[str] = mapped_column(String(16), default="")
    grade: Mapped[Optional[str]] = mapped_column(String(8))
    status: Mapped[str] = mapped_column(String(16), default="completed")  # completed | in_progress | failed
    source: Mapped[str] = mapped_column(String(16), default="sdu")

    course: Mapped[Course] = relationship()


class WaitlistEntry(Base):
    __tablename__ = "waitlist_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"), index=True)
    # waiting | held (financial hold, keeps priority until hold_deadline) | enrolled | skipped | cancelled | expired
    status: Mapped[str] = mapped_column(String(16), default="waiting")
    note: Mapped[Optional[str]] = mapped_column(String(300))
    hold_deadline: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[int] = mapped_column(Integer, default=now)
    updated_at: Mapped[int] = mapped_column(Integer, default=now)

    section: Mapped[Section] = relationship()
    user: Mapped[User] = relationship()


class OverrideRequest(Base):
    __tablename__ = "override_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("terms.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(24))  # credit_overload | prerequisite_waiver
    course_id: Mapped[Optional[int]] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    requested_ects: Mapped[Optional[float]] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending | approved | rejected
    advisor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    feedback: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[int] = mapped_column(Integer, default=now)
    decided_at: Mapped[Optional[int]] = mapped_column(Integer)

    student: Mapped[User] = relationship(foreign_keys=[student_id])
    advisor: Mapped[Optional[User]] = relationship(foreign_keys=[advisor_id])
    course: Mapped[Optional[Course]] = relationship()
    term: Mapped[Term] = relationship()


class SeatAlert(Base):
    __tablename__ = "seat_alerts"
    __table_args__ = (UniqueConstraint("user_id", "section_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    section_id: Mapped[int] = mapped_column(ForeignKey("sections.id", ondelete="CASCADE"), index=True)
    channels: Mapped[str] = mapped_column(String(40), default="push")  # comma list: push,email,sms
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[int] = mapped_column(Integer, default=now)
    last_notified_at: Mapped[Optional[int]] = mapped_column(Integer)

    section: Mapped[Section] = relationship()


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[Optional[str]] = mapped_column(String(300))
    read_at: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[int] = mapped_column(Integer, default=now, index=True)


class Plan(Base):
    """A tentative schedule for a future term (never touches enrollment)."""

    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("terms.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(120))
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[int] = mapped_column(Integer, default=now)
    updated_at: Mapped[int] = mapped_column(Integer, default=now)

    term: Mapped[Term] = relationship()
    items: Mapped[list["PlanItem"]] = relationship(back_populates="plan", cascade="all, delete-orphan")


class PlanItem(Base):
    __tablename__ = "plan_items"
    __table_args__ = (UniqueConstraint("plan_id", "course_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), index=True)
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    # Optional chosen sections (comma separated ids) so a plan can be previewed on a grid.
    section_ids: Mapped[str] = mapped_column(String(120), default="")

    plan: Mapped[Plan] = relationship(back_populates="items")
    course: Mapped[Course] = relationship()
