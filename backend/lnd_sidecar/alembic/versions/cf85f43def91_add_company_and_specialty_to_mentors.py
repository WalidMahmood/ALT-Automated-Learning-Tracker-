"""add_company_and_specialty_to_mentors

Revision ID: cf85f43def91
Revises: d8621e5ea61f
Create Date: 2025-11-18 13:51:28.093056

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cf85f43def91'
down_revision = 'd8621e5ea61f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add company and specialty columns to mentors table
    op.add_column('mentors', sa.Column('company', sa.String(), nullable=True))
    op.add_column('mentors', sa.Column('specialty', sa.String(), nullable=True))


def downgrade() -> None:
    # Remove company and specialty columns from mentors table
    op.drop_column('mentors', 'specialty')
    op.drop_column('mentors', 'company')

