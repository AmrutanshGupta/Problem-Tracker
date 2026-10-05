"""replace_sm2_with_leitner_box — REVERTED: Fix SM2 schema

This migration was originally written to replace SM2 with Leitner boxes,
but that decision was reversed. This migration instead:
  1. Renames 'repetition_count' → 'repetitions' for clarity.
  2. Sets the default interval to 1 (was incorrectly 3 in old code).

Revision ID: a1f2e3d4c5b6
Revises: 7417ea2de401
Create Date: 2026-10-02 11:39:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1f2e3d4c5b6'
down_revision: Union[str, Sequence[str], None] = '7417ea2de401'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Fix SM2 schema:
      - Rename 'repetition_count' → 'repetitions'
      - Correct default interval_days from 3 → 1

    Uses batch_alter_table for SQLite compatibility (local dev).
    On PostgreSQL (Supabase production) standard ALTER TABLE is used.
    """
    with op.batch_alter_table('review_schedule') as batch_op:
        # Rename repetition_count → repetitions
        batch_op.add_column(sa.Column('repetitions', sa.Integer(), nullable=True))

    # Copy data from old column to new
    op.execute("UPDATE review_schedule SET repetitions = repetition_count")
    op.execute("UPDATE review_schedule SET interval_days = 1 WHERE interval_days = 3 AND repetitions = 0")

    with op.batch_alter_table('review_schedule') as batch_op:
        # Make non-nullable after data copy
        batch_op.alter_column('repetitions', nullable=False, existing_type=sa.Integer(),
                              server_default='0')
        batch_op.drop_column('repetition_count')


def downgrade() -> None:
    """Restore original repetition_count column name."""
    with op.batch_alter_table('review_schedule') as batch_op:
        batch_op.add_column(sa.Column('repetition_count', sa.Integer(), nullable=True))

    op.execute("UPDATE review_schedule SET repetition_count = repetitions")

    with op.batch_alter_table('review_schedule') as batch_op:
        batch_op.alter_column('repetition_count', nullable=False, existing_type=sa.Integer(),
                              server_default='0')
        batch_op.drop_column('repetitions')
