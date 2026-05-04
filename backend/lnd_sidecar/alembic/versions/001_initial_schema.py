"""Initial schema

Revision ID: 001
Revises: 
Create Date: 2025-11-07

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create students table
    op.create_table(
        'students',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('sbu', sa.Enum('IT', 'HR', 'FINANCE', 'OPERATIONS', 'SALES', 'MARKETING', 'OTHER', name='sbu'), nullable=False),
        sa.Column('designation', sa.String(), nullable=True),
        sa.Column('experience_years', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_students_id'), 'students', ['id'], unique=False)
    op.create_index(op.f('ix_students_employee_id'), 'students', ['employee_id'], unique=True)
    op.create_index(op.f('ix_students_email'), 'students', ['email'], unique=True)

    # Create courses table
    op.create_table(
        'courses',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('batch_code', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('seat_limit', sa.Integer(), nullable=False),
        sa.Column('current_enrolled', sa.Integer(), nullable=True),
        sa.Column('prerequisite_course_id', sa.Integer(), nullable=True),
        sa.Column('is_archived', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['prerequisite_course_id'], ['courses.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_courses_id'), 'courses', ['id'], unique=False)
    op.create_index(op.f('ix_courses_name'), 'courses', ['name'], unique=False)
    op.create_index(op.f('ix_courses_batch_code'), 'courses', ['batch_code'], unique=True)

    # Create incoming_enrollments table
    op.create_table(
        'incoming_enrollments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('sbu', sa.String(), nullable=True),
        sa.Column('designation', sa.String(), nullable=True),
        sa.Column('course_name', sa.String(), nullable=False),
        sa.Column('batch_code', sa.String(), nullable=False),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('processed', sa.Boolean(), nullable=True),
        sa.Column('processed_at', sa.DateTime(), nullable=True),
        sa.Column('raw_data', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_incoming_enrollments_id'), 'incoming_enrollments', ['id'], unique=False)
    op.create_index(op.f('ix_incoming_enrollments_employee_id'), 'incoming_enrollments', ['employee_id'], unique=False)

    # Create enrollments table
    op.create_table(
        'enrollments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('eligibility_status', sa.Enum('PENDING', 'ELIGIBLE', 'INELIGIBLE_PREREQUISITE', 'INELIGIBLE_DUPLICATE', 'INELIGIBLE_ANNUAL_LIMIT', name='eligibilitystatus'), nullable=False),
        sa.Column('eligibility_reason', sa.String(), nullable=True),
        sa.Column('eligibility_checked_at', sa.DateTime(), nullable=True),
        sa.Column('approval_status', sa.Enum('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', name='approvalstatus'), nullable=False),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('rejection_reason', sa.String(), nullable=True),
        sa.Column('completion_status', sa.Enum('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', name='completionstatus'), nullable=False),
        sa.Column('score', sa.Float(), nullable=True),
        sa.Column('attendance_percentage', sa.Float(), nullable=True),
        sa.Column('completion_date', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('incoming_enrollment_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ),
        sa.ForeignKeyConstraint(['incoming_enrollment_id'], ['incoming_enrollments.id'], ),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_enrollments_id'), 'enrollments', ['id'], unique=False)
    op.create_index(op.f('ix_enrollments_student_id'), 'enrollments', ['student_id'], unique=False)
    op.create_index(op.f('ix_enrollments_course_id'), 'enrollments', ['course_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_enrollments_course_id'), table_name='enrollments')
    op.drop_index(op.f('ix_enrollments_student_id'), table_name='enrollments')
    op.drop_index(op.f('ix_enrollments_id'), table_name='enrollments')
    op.drop_table('enrollments')
    op.drop_index(op.f('ix_incoming_enrollments_employee_id'), table_name='incoming_enrollments')
    op.drop_index(op.f('ix_incoming_enrollments_id'), table_name='incoming_enrollments')
    op.drop_table('incoming_enrollments')
    op.drop_index(op.f('ix_courses_batch_code'), table_name='courses')
    op.drop_index(op.f('ix_courses_name'), table_name='courses')
    op.drop_index(op.f('ix_courses_id'), table_name='courses')
    op.drop_table('courses')
    op.drop_index(op.f('ix_students_email'), table_name='students')
    op.drop_index(op.f('ix_students_employee_id'), table_name='students')
    op.drop_index(op.f('ix_students_id'), table_name='students')
    op.drop_table('students')
    sa.Enum(name='sbu').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='eligibilitystatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='approvalstatus').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='completionstatus').drop(op.get_bind(), checkfirst=True)

