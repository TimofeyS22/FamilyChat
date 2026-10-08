"""add canonical family rooms

Revision ID: 202606220002
Revises: 202606220001
Create Date: 2026-06-22 00:02:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "202606220002"
down_revision: str | None = "202606220001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "family_rooms",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("matrix_room_id", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_family_rooms_kind", "family_rooms", ["kind"], unique=True)
    op.create_index(
        "ix_family_rooms_matrix_room_id",
        "family_rooms",
        ["matrix_room_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_family_rooms_matrix_room_id", table_name="family_rooms")
    op.drop_index("ix_family_rooms_kind", table_name="family_rooms")
    op.drop_table("family_rooms")
