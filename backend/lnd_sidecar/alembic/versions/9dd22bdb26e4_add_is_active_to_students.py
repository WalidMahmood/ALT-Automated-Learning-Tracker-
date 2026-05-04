"""add_is_active_to_students

Revision ID: 9dd22bdb26e4
Revises: 87f7756d1085
Create Date: 2025-11-13 14:34:09.403854

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9dd22bdb26e4'
down_revision = '87f7756d1085'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add is_active column with default True
    op.add_column('students', sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'))
    # Create index on is_active for better query performance
    op.create_index(op.f('ix_students_is_active'), 'students', ['is_active'], unique=False)


def downgrade() -> None:
    # Drop index
    op.drop_index(op.f('ix_students_is_active'), table_name='students')
    # Drop column
    op.drop_column('students', 'is_active')

