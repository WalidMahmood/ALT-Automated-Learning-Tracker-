"""Add sbu_head, reporting_manager, and exit_reason fields to students

Revision ID: f5g6h7i8j9k0
Revises: e4f5g6h7i8j9
Create Date: 2025-11-26 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5g6h7i8j9k0'
down_revision: Union[str, None] = 'e4f5g6h7i8j9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add SBU Head fields
    op.add_column('students', sa.Column('sbu_head_employee_id', sa.String(), nullable=True))
    op.add_column('students', sa.Column('sbu_head_name', sa.String(), nullable=True))
    
    # Add Reporting Manager fields
    op.add_column('students', sa.Column('reporting_manager_employee_id', sa.String(), nullable=True))
    op.add_column('students', sa.Column('reporting_manager_name', sa.String(), nullable=True))
    
    # Add exit reason field
    op.add_column('students', sa.Column('exit_reason', sa.String(), nullable=True))
    
    # Create indexes for faster lookups
    op.create_index(op.f('ix_students_sbu_head_employee_id'), 'students', ['sbu_head_employee_id'], unique=False)
    op.create_index(op.f('ix_students_reporting_manager_employee_id'), 'students', ['reporting_manager_employee_id'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_students_reporting_manager_employee_id'), table_name='students')
    op.drop_index(op.f('ix_students_sbu_head_employee_id'), table_name='students')
    
    # Drop columns
    op.drop_column('students', 'exit_reason')
    op.drop_column('students', 'reporting_manager_name')
    op.drop_column('students', 'reporting_manager_employee_id')
    op.drop_column('students', 'sbu_head_name')
    op.drop_column('students', 'sbu_head_employee_id')

