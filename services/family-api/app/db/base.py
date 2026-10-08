from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


from app.models import audit_log, family_room, invite, push_subscription, user  # noqa: E402, F401
