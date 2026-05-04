"""add_mentors_and_course_costs

Revision ID: a1b2c3d4e5f6
Revises: fc8b96f4698b
Create Date: 2025-01-15 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import ENUM

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '9dd22bdb26e4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create mentors table (using existing SBU enum type)
    sbu_enum = ENUM('IT', 'HR', 'FINANCE', 'OPERATIONS', 'SALES', 'MARKETING', 'OTHER', name='sbu', create_type=False)
    op.create_table(
        'mentors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('is_internal', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('student_id', sa.Integer(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('sbu', sbu_enum, nullable=True),
        sa.Column('designation', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ),
        sa.UniqueConstraint('student_id', name='uq_mentor_student_id')
    )
    op.create_index(op.f('ix_mentors_id'), 'mentors', ['id'], unique=False)
    op.create_index(op.f('ix_mentors_student_id'), 'mentors', ['student_id'], unique=True)
    op.create_index(op.f('ix_mentors_email'), 'mentors', ['email'], unique=False)
    
    # Create course_mentors table
    op.create_table(
        'course_mentors',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('mentor_id', sa.Integer(), nullable=False),
        sa.Column('hours_taught', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('amount_paid', sa.Numeric(10, 2), nullable=False, server_default='0.00'),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ),
        sa.ForeignKeyConstraint(['mentor_id'], ['mentors.id'], ),
        sa.UniqueConstraint('course_id', 'mentor_id', name='uq_course_mentor')
    )
    op.create_index(op.f('ix_course_mentors_id'), 'course_mentors', ['id'], unique=False)
    op.create_index(op.f('ix_course_mentors_course_id'), 'course_mentors', ['course_id'], unique=False)
    op.create_index(op.f('ix_course_mentors_mentor_id'), 'course_mentors', ['mentor_id'], unique=False)
    
    # Add cost fields to courses table
    op.add_column('courses', sa.Column('food_cost', sa.Numeric(10, 2), nullable=False, server_default='0.00'))
    op.add_column('courses', sa.Column('other_cost', sa.Numeric(10, 2), nullable=False, server_default='0.00'))


def downgrade() -> None:
    # Remove cost fields from courses
    op.drop_column('courses', 'other_cost')
    op.drop_column('courses', 'food_cost')
    
    # Drop course_mentors table
    op.drop_index(op.f('ix_course_mentors_mentor_id'), table_name='course_mentors')
    op.drop_index(op.f('ix_course_mentors_course_id'), table_name='course_mentors')
    op.drop_index(op.f('ix_course_mentors_id'), table_name='course_mentors')
    op.drop_table('course_mentors')
    
    # Drop mentors table
    op.drop_index(op.f('ix_mentors_email'), table_name='mentors')
    op.drop_index(op.f('ix_mentors_student_id'), table_name='mentors')
    op.drop_index(op.f('ix_mentors_id'), table_name='mentors')
    op.drop_table('mentors')

