"""add_career_start_date_and_bs_joining_date_to_students

Revision ID: d8621e5ea61f
Revises: a1b2c3d4e5f6
Create Date: 2025-11-18 12:07:59.681567

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd8621e5ea61f'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('students', sa.Column('career_start_date', sa.Date(), nullable=True))
    op.add_column('students', sa.Column('bs_joining_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('students', 'bs_joining_date')
    op.drop_column('students', 'career_start_date')

