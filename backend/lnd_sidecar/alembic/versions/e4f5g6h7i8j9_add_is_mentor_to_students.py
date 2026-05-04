"""Add is_mentor field to students table

Revision ID: e4f5g6h7i8j9
Revises: d3e4f5g6h7i8
Create Date: 2025-11-26 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4f5g6h7i8j9'
down_revision = 'd3e4f5g6h7i8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_mentor column to students table
    op.add_column('students', sa.Column('is_mentor', sa.Boolean(), nullable=True, server_default='false'))
    
    # Update existing students based on whether they have a mentor record
    op.execute("""
        UPDATE students 
        SET is_mentor = true 
        WHERE id IN (SELECT student_id FROM mentors WHERE student_id IS NOT NULL)
    """)
    
    # Make it not nullable after setting defaults
    op.alter_column('students', 'is_mentor', nullable=False, server_default=None)
    
    # Add index for efficient filtering
    op.create_index('idx_students_is_mentor', 'students', ['is_mentor'])


def downgrade() -> None:
    op.drop_index('idx_students_is_mentor', 'students')
    op.drop_column('students', 'is_mentor')

