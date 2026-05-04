"""add_class_schedule_to_courses

Revision ID: 9d9c241885f2
Revises: c1fe9be0d9d9
Create Date: 2025-11-19 13:56:50.386835

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = '9d9c241885f2'
down_revision = 'c1fe9be0d9d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add class_schedule column to courses table (JSON/JSONB for storing array of {day, start_time, end_time})
    op.add_column('courses', sa.Column('class_schedule', postgresql.JSON(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    # Remove class_schedule column
    op.drop_column('courses', 'class_schedule')

