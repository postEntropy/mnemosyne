"""initial migration - create screenshots and settings tables.

Revision ID: 001_initial
Revises:
Create Date: 2026-04-07

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "settings",
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("value", sa.Text(), server_default=""),
        sa.PrimaryKeyConstraint("key"),
    )

    op.create_table(
        "screenshots",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), server_default=""),
        sa.Column("application", sa.String(), server_default=""),
        sa.Column("tags", sa.Text(), server_default="[]"),
        sa.Column("summary", sa.Text(), server_default=""),
        sa.Column("timestamp", sa.DateTime(), nullable=False),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(), server_default="pending"),
        sa.Column("thumbnail_path", sa.Text(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("file_path"),
    )


def downgrade() -> None:
    op.drop_table("screenshots")
    op.drop_table("settings")
