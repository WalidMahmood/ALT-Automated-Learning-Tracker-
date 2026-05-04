"""Fix is_mandatory column type from Boolean to Integer in lms_user_courses

Revision ID: d3e4f5g6h7i8
Revises: c2d3e4f5g6h7
Create Date: 2025-11-26 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd3e4f5g6h7i8'
down_revision = 'c2d3e4f5g6h7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # First, drop the default constraint
    op.execute("ALTER TABLE lms_user_courses ALTER COLUMN is_mandatory DROP DEFAULT")
    
    # Then alter the column type from Boolean to Integer
    # PostgreSQL: use USING clause to convert boolean to integer
    op.execute("""
        ALTER TABLE lms_user_courses 
        ALTER COLUMN is_mandatory TYPE INTEGER 
        USING CASE 
            WHEN is_mandatory::text = 'true' THEN 1 
            WHEN is_mandatory::text = '1' THEN 1
            ELSE 0 
        END
    """)
    
    # Set default to 0 and make not null
    op.execute("ALTER TABLE lms_user_courses ALTER COLUMN is_mandatory SET DEFAULT 0")
    op.execute("ALTER TABLE lms_user_courses ALTER COLUMN is_mandatory SET NOT NULL")


def downgrade() -> None:
    # Convert back to Boolean if needed
    op.execute("""
        ALTER TABLE lms_user_courses 
        ALTER COLUMN is_mandatory TYPE BOOLEAN 
        USING CASE WHEN is_mandatory = 1 THEN true ELSE false END
    """)
    
    op.alter_column('lms_user_courses', 'is_mandatory',
                    server_default='false',
                    nullable=True)

