from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Uuid
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import utc_now


class PushPrivacyPreference(StrEnum):
    fact_only = "fact_only"
    sender_name = "sender_name"
    message_text = "message_text"
    sender_and_preview = "sender_and_preview"


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    endpoint: Mapped[str] = mapped_column(String(2048), nullable=False)
    endpoint_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    p256dh: Mapped[str] = mapped_column(String(255), nullable=False)
    auth_secret: Mapped[str] = mapped_column(String(255), nullable=False)
    content_encoding: Mapped[str] = mapped_column(String(32), default="aes128gcm", nullable=False)
    privacy_preference: Mapped[PushPrivacyPreference] = mapped_column(
        SAEnum(
            PushPrivacyPreference,
            values_callable=lambda enum_cls: [preference.value for preference in enum_cls],
            native_enum=False,
            length=32,
        ),
        default=PushPrivacyPreference.fact_only,
        nullable=False,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_failure_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_failure_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    user = relationship("User", back_populates="push_subscriptions")
