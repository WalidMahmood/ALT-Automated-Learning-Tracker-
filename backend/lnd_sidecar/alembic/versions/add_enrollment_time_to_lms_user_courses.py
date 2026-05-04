"""Add enrollment_time field to lms_user_courses

Revision ID: add_enrollment_time
Revises: d3e4f5g6h7i8
Create Date: 2025-01-XX

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_enrollment_time'
down_revision = 'f5g6h7i8j9k0'  # Make it depend on the latest head
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add enrollment_time column to lms_user_courses
    # This stores the actual enrollment timestamp from LMS API (timecreated/timestart)
    op.add_column('lms_user_courses', sa.Column('enrollment_time', sa.DateTime(), nullable=True))


def downgrade() -> None:
    # Remove enrollment_time column from lms_user_courses
    op.drop_column('lms_user_courses', 'enrollment_time')

