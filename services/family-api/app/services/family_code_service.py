import secrets
import string

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User


class FamilyCodeService:
    def generate(self, db: Session, *, username: str, display_name: str) -> str:
        prefix = self._prefix(username=username, display_name=display_name)
        for _ in range(100):
            suffix = "".join(secrets.choice(string.digits) for _ in range(4))
            code = f"{prefix}-{suffix}"
            exists = db.scalar(select(User.id).where(User.family_code == code))
            if not exists:
                return code
        raise RuntimeError("Unable to generate unique family code")

    def _prefix(self, *, username: str, display_name: str) -> str:
        source = username or display_name
        letters = [
            char for char in source.upper() if char in string.ascii_uppercase + string.digits
        ]
        prefix = "".join(letters[:3])
        return prefix.ljust(3, "X")
