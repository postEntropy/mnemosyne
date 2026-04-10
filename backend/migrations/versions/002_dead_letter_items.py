"""add dead letter items table.

Revision ID: 002_dead_letter_items
Revises: 001_initial
Create Date: 2026-04-09

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "002_dead_letter_items"
down_revision: Union[str, None] = "001_initial"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dead_letter_items",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("screenshot_id", sa.Integer(), nullable=True),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="1", nullable=False),
        sa.Column("provider", sa.Text(), nullable=True),
        sa.Column("failed_at", sa.DateTime(), nullable=False),
        sa.Column("resolved", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("retried_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("dead_letter_items")