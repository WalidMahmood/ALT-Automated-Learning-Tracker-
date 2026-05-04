"""Add LMS user courses table

Revision ID: b1c2d3e4f5g6
Revises: 2cc323888506
Create Date: 2024-11-26

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1c2d3e4f5g6'
down_revision = '2cc323888506'
branch_labels = None
depends_on = None


def upgrade():
    # Create lms_user_courses table
    op.create_table(
        'lms_user_courses',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.String(), nullable=False),
        sa.Column('lms_user_id', sa.String(), nullable=True),
        sa.Column('lms_course_id', sa.String(), nullable=False),
        sa.Column('course_name', sa.String(), nullable=False),
        sa.Column('course_shortname', sa.String(), nullable=True),
        sa.Column('category_name', sa.String(), nullable=True),
        sa.Column('progress', sa.Float(), nullable=True, default=0),
        sa.Column('completed', sa.Boolean(), nullable=False, default=False),
        sa.Column('completion_date', sa.DateTime(), nullable=True),
        sa.Column('start_date', sa.DateTime(), nullable=True),
        sa.Column('end_date', sa.DateTime(), nullable=True),
        sa.Column('last_access', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes
    op.create_index('idx_lms_user_course_student', 'lms_user_courses', ['student_id'])
    op.create_index('idx_lms_user_course_employee', 'lms_user_courses', ['employee_id'])
    op.create_index('idx_lms_user_course_course', 'lms_user_courses', ['lms_course_id'])
    op.create_index('idx_lms_user_course_unique', 'lms_user_courses', ['student_id', 'lms_course_id'], unique=True)


def downgrade():
    # Drop indexes
    op.drop_index('idx_lms_user_course_unique', table_name='lms_user_courses')
    op.drop_index('idx_lms_user_course_course', table_name='lms_user_courses')
    op.drop_index('idx_lms_user_course_employee', table_name='lms_user_courses')
    op.drop_index('idx_lms_user_course_student', table_name='lms_user_courses')
    
    # Drop table
    op.drop_table('lms_user_courses')

