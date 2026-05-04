"""add_class_reminders_table

Revision ID: 05f127f750e6
Revises: 9d9c241885f2
Create Date: 2025-11-19 14:50:21.269542

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '05f127f750e6'
down_revision = '9d9c241885f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create class_reminders table
    op.create_table(
        'class_reminders',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('course_id', sa.Integer(), nullable=False),
        sa.Column('course_name', sa.String(), nullable=False),
        sa.Column('batch_code', sa.String(), nullable=False),
        sa.Column('class_date', sa.DateTime(), nullable=False),
        sa.Column('start_time', sa.String(), nullable=False),
        sa.Column('end_time', sa.String(), nullable=False),
        sa.Column('day', sa.String(), nullable=False),
        sa.Column('reminder_sent_at', sa.DateTime(), nullable=False),
        sa.Column('sent', sa.Boolean(), nullable=False, server_default='true'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('course_id', 'class_date', 'start_time', name='uq_class_reminder')
    )
    op.create_index(op.f('ix_class_reminders_id'), 'class_reminders', ['id'], unique=False)
    op.create_index(op.f('ix_class_reminders_course_id'), 'class_reminders', ['course_id'], unique=False)
    op.create_index(op.f('ix_class_reminders_class_date'), 'class_reminders', ['class_date'], unique=False)


def downgrade() -> None:
    # Drop class_reminders table
    op.drop_index(op.f('ix_class_reminders_class_date'), table_name='class_reminders')
    op.drop_index(op.f('ix_class_reminders_course_id'), table_name='class_reminders')
    op.drop_index(op.f('ix_class_reminders_id'), table_name='class_reminders')
    op.drop_table('class_reminders')

