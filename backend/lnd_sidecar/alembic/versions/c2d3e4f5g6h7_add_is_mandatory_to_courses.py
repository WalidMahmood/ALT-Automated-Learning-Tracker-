"""Add is_mandatory field to LMS courses and user courses

Revision ID: c2d3e4f5g6h7
Revises: b1c2d3e4f5g6
Create Date: 2025-11-26 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c2d3e4f5g6h7'
down_revision = 'b1c2d3e4f5g6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_mandatory column to lms_course_cache (Integer: 0=optional, 1=mandatory)
    op.add_column('lms_course_cache', sa.Column('is_mandatory', sa.Integer(), nullable=True, server_default='0'))
    
    # Add is_mandatory column to lms_user_courses (Integer: 0=optional, 1=mandatory)
    op.add_column('lms_user_courses', sa.Column('is_mandatory', sa.Integer(), nullable=True, server_default='0'))
    
    # Set default values for existing records
    op.execute("UPDATE lms_course_cache SET is_mandatory = 0 WHERE is_mandatory IS NULL")
    op.execute("UPDATE lms_user_courses SET is_mandatory = 0 WHERE is_mandatory IS NULL")


def downgrade() -> None:
    # Remove is_mandatory column from lms_course_cache
    op.drop_column('lms_course_cache', 'is_mandatory')
    
    # Remove is_mandatory column from lms_user_courses
    op.drop_column('lms_user_courses', 'is_mandatory')

