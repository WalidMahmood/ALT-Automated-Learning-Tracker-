"""add_erp_fields_to_students

Revision ID: cc8565f5df5c
Revises: 7c4e48eb5dfd
Create Date: 2025-11-25 18:05:27.726748

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cc8565f5df5c'
down_revision = '7c4e48eb5dfd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add ERP fields to students table
    op.add_column('students', sa.Column('erp_id', sa.String(), nullable=True))
    op.add_column('students', sa.Column('work_email', sa.String(), nullable=True))
    op.add_column('students', sa.Column('active', sa.Boolean(), nullable=True))
    op.add_column('students', sa.Column('is_onsite', sa.Boolean(), nullable=True))
    op.add_column('students', sa.Column('total_experience', sa.Float(), nullable=True))
    op.add_column('students', sa.Column('date_of_birth', sa.Date(), nullable=True))
    op.add_column('students', sa.Column('resignation_date', sa.Date(), nullable=True))
    op.add_column('students', sa.Column('exit_date', sa.Date(), nullable=True))
    op.add_column('students', sa.Column('department_id', sa.String(), nullable=True))
    op.add_column('students', sa.Column('job_position_id', sa.String(), nullable=True))
    op.add_column('students', sa.Column('job_position_name', sa.String(), nullable=True))
    op.add_column('students', sa.Column('job_type_id', sa.String(), nullable=True))
    op.add_column('students', sa.Column('job_type_name', sa.String(), nullable=True))
    op.add_column('students', sa.Column('job_role_id', sa.String(), nullable=True))
    op.add_column('students', sa.Column('sbu_name', sa.String(), nullable=True))
    op.add_column('students', sa.Column('user_id', sa.String(), nullable=True))
    op.add_column('students', sa.Column('user_name', sa.String(), nullable=True))
    op.add_column('students', sa.Column('user_email', sa.String(), nullable=True))
    op.add_column('students', sa.Column('erp_data', sa.JSON(), nullable=True))
    
    # Create indexes for commonly queried fields
    op.create_index(op.f('ix_students_erp_id'), 'students', ['erp_id'], unique=False)
    op.create_index(op.f('ix_students_exit_date'), 'students', ['exit_date'], unique=False)


def downgrade() -> None:
    # Drop indexes
    op.drop_index(op.f('ix_students_exit_date'), table_name='students')
    op.drop_index(op.f('ix_students_erp_id'), table_name='students')
    
    # Drop columns
    op.drop_column('students', 'erp_data')
    op.drop_column('students', 'user_email')
    op.drop_column('students', 'user_name')
    op.drop_column('students', 'user_id')
    op.drop_column('students', 'sbu_name')
    op.drop_column('students', 'job_role_id')
    op.drop_column('students', 'job_type_name')
    op.drop_column('students', 'job_type_id')
    op.drop_column('students', 'job_position_name')
    op.drop_column('students', 'job_position_id')
    op.drop_column('students', 'department_id')
    op.drop_column('students', 'exit_date')
    op.drop_column('students', 'resignation_date')
    op.drop_column('students', 'date_of_birth')
    op.drop_column('students', 'total_experience')
    op.drop_column('students', 'is_onsite')
    op.drop_column('students', 'active')
    op.drop_column('students', 'work_email')
    op.drop_column('students', 'erp_id')
