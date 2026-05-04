"""add_course_status_comments_and_drafts

Revision ID: c1fe9be0d9d9
Revises: cf85f43def91
Create Date: 2025-11-18 15:25:20.070822

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from sqlalchemy.dialects.postgresql import ENUM
from datetime import date


# revision identifiers, used by Alembic.
revision = 'c1fe9be0d9d9'
down_revision = 'cf85f43def91'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create course_status enum
    course_status_enum = ENUM('draft', 'ongoing', 'completed', name='coursestatus', create_type=True)
    course_status_enum.create(op.get_bind(), checkfirst=True)
    
    # Add status column to courses table
    op.add_column('courses', sa.Column('status', course_status_enum, nullable=True))
    
    # Set default status based on dates for existing courses
    today = date.today()
    op.execute(f"""
        UPDATE courses 
        SET status = CASE 
            WHEN start_date > '{today}'::date THEN 'draft'::coursestatus
            WHEN end_date IS NOT NULL AND end_date < '{today}'::date THEN 'completed'::coursestatus
            ELSE 'ongoing'::coursestatus
        END
    """)
    
    # Make status NOT NULL with default
    op.alter_column('courses', 'status', nullable=False, server_default='draft')
    
    # Create index on status
    op.create_index(op.f('ix_courses_status'), 'courses', ['status'], unique=False)
    
    # Create course_comments table
    op.create_table(
        'course_comments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE')
    )
    op.create_index(op.f('ix_course_comments_id'), 'course_comments', ['id'], unique=False)
    op.create_index(op.f('ix_course_comments_course_id'), 'course_comments', ['course_id'], unique=False)
    
    # Create course_drafts table
    op.create_table(
        'course_drafts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('mentor_assignments', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('food_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('other_cost', sa.Numeric(10, 2), nullable=True),
        sa.Column('draft_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('course_id', name='uq_course_draft_course_id')
    )
    op.create_index(op.f('ix_course_drafts_id'), 'course_drafts', ['id'], unique=False)
    op.create_index(op.f('ix_course_drafts_course_id'), 'course_drafts', ['course_id'], unique=True)


def downgrade() -> None:
    # Drop tables
    op.drop_index(op.f('ix_course_drafts_course_id'), table_name='course_drafts')
    op.drop_index(op.f('ix_course_drafts_id'), table_name='course_drafts')
    op.drop_table('course_drafts')
    
    op.drop_index(op.f('ix_course_comments_course_id'), table_name='course_comments')
    op.drop_index(op.f('ix_course_comments_id'), table_name='course_comments')
    op.drop_table('course_comments')
    
    # Drop status column and enum
    op.drop_index(op.f('ix_courses_status'), table_name='courses')
    op.drop_column('courses', 'status')
    op.execute('DROP TYPE coursestatus')

