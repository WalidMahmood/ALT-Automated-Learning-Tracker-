"""change_batch_code_to_composite_unique_with_course_name

Revision ID: 87f7756d1085
Revises: 6e36db3a7375
Create Date: 2025-11-12 11:30:53.675336

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '87f7756d1085'
down_revision = '6e36db3a7375'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Drop the existing unique index on batch_code
    op.drop_index('ix_courses_batch_code', table_name='courses')
    
    # Create a non-unique index on batch_code (for performance)
    op.create_index('ix_courses_batch_code', 'courses', ['batch_code'], unique=False)
    
    # Create a composite unique constraint on (name, batch_code)
    op.create_unique_constraint('uq_course_name_batch_code', 'courses', ['name', 'batch_code'])


def downgrade() -> None:
    # Drop the composite unique constraint
    op.drop_constraint('uq_course_name_batch_code', 'courses', type_='unique')
    
    # Drop the non-unique index
    op.drop_index('ix_courses_batch_code', table_name='courses')
    
    # Recreate the original unique index on batch_code
    op.create_index('ix_courses_batch_code', 'courses', ['batch_code'], unique=True)

