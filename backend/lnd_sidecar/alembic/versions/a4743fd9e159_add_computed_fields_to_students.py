"""add_computed_fields_to_students

Revision ID: a4743fd9e159
Revises: cc8565f5df5c
Create Date: 2025-11-25 18:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a4743fd9e159'
down_revision = 'cc8565f5df5c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add computed fields
    # Note: is_active already exists, but we'll ensure it's properly indexed
    # has_online_course and bs_experience are new
    op.add_column('students', sa.Column('has_online_course', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('students', sa.Column('bs_experience', sa.Float(), nullable=True))
    
    # Create index for has_online_course
    op.create_index(op.f('ix_students_has_online_course'), 'students', ['has_online_course'], unique=False)
    
    # Update existing is_active based on exit_date
    op.execute("""
        UPDATE students 
        SET is_active = CASE 
            WHEN exit_date IS NOT NULL THEN false 
            ELSE true 
        END
    """)


def downgrade() -> None:
    # Drop index
    op.drop_index(op.f('ix_students_has_online_course'), table_name='students')
    
    # Drop columns
    op.drop_column('students', 'bs_experience')
    op.drop_column('students', 'has_online_course')
