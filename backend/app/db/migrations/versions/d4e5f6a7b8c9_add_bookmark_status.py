"""add status column to bookmarks

Revision ID: d4e5f6a7b8c9
Revises: a1f2e3d4c5b6
Create Date: 2026-10-06 00:30:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'a1f2e3d4c5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('bookmarks') as batch_op:
        batch_op.add_column(
            sa.Column('status', sa.String(), nullable=True, server_default='unsolved')
        )
    # Backfill all existing rows
    op.execute("UPDATE bookmarks SET status = 'unsolved' WHERE status IS NULL")


def downgrade() -> None:
    with op.batch_alter_table('bookmarks') as batch_op:
        batch_op.drop_column('status')
