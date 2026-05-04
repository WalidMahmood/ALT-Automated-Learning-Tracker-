"""rename_sbu_to_department

Revision ID: e0771c4e76d4
Revises: 05f127f750e6
Create Date: 2025-11-24 14:19:12.885044

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM


# revision identifiers, used by Alembic.
revision = 'e0771c4e76d4'
down_revision = '05f127f750e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Add new department column as String to students table
    op.add_column('students', sa.Column('department', sa.String(), nullable=True))
    
    # Step 2: Copy data from sbu enum to department string for students, converting enum values
    op.execute("""
        UPDATE students 
        SET department = CASE 
            WHEN sbu::text = 'IT' THEN 'IT'
            WHEN sbu::text = 'HR' THEN 'HR'
            WHEN sbu::text = 'FINANCE' THEN 'Finance'
            WHEN sbu::text = 'OPERATIONS' THEN 'Operations'
            WHEN sbu::text = 'SALES' THEN 'Sales'
            WHEN sbu::text = 'MARKETING' THEN 'Marketing'
            WHEN sbu::text = 'OTHER' THEN 'Other'
            ELSE 'Other'
        END
    """)
    
    # Step 3: Make department NOT NULL for students
    op.alter_column('students', 'department', nullable=False)
    
    # Step 4: Drop old sbu column from students
    op.drop_column('students', 'sbu')
    
    # Step 5: Add new department column as String to mentors table
    op.add_column('mentors', sa.Column('department', sa.String(), nullable=True))
    
    # Step 6: Copy data from sbu enum to department string for mentors
    op.execute("""
        UPDATE mentors 
        SET department = CASE 
            WHEN sbu::text = 'IT' THEN 'IT'
            WHEN sbu::text = 'HR' THEN 'HR'
            WHEN sbu::text = 'FINANCE' THEN 'Finance'
            WHEN sbu::text = 'OPERATIONS' THEN 'Operations'
            WHEN sbu::text = 'SALES' THEN 'Sales'
            WHEN sbu::text = 'MARKETING' THEN 'Marketing'
            WHEN sbu::text = 'OTHER' THEN 'Other'
            ELSE NULL
        END
    """)
    
    # Step 7: Drop old sbu column from mentors
    op.drop_column('mentors', 'sbu')
    
    # Step 8: Drop the sbu enum type (now safe since no tables use it)
    op.execute("DROP TYPE IF EXISTS sbu")


def downgrade() -> None:
    # Recreate sbu enum
    sbu_enum = ENUM('IT', 'HR', 'FINANCE', 'OPERATIONS', 'SALES', 'MARKETING', 'OTHER', name='sbu', create_type=True)
    sbu_enum.create(op.get_bind(), checkfirst=True)
    
    # Add sbu column back to students
    op.add_column('students', sa.Column('sbu', sbu_enum, nullable=True))
    
    # Copy data back from department to sbu for students, mapping back to enum values
    op.execute("""
        UPDATE students 
        SET sbu = CASE 
            WHEN UPPER(department) = 'IT' THEN 'IT'::sbu
            WHEN UPPER(department) = 'HR' THEN 'HR'::sbu
            WHEN UPPER(department) = 'FINANCE' THEN 'FINANCE'::sbu
            WHEN UPPER(department) = 'OPERATIONS' THEN 'OPERATIONS'::sbu
            WHEN UPPER(department) = 'SALES' THEN 'SALES'::sbu
            WHEN UPPER(department) = 'MARKETING' THEN 'MARKETING'::sbu
            ELSE 'OTHER'::sbu
        END
    """)
    
    # Make sbu NOT NULL for students
    op.alter_column('students', 'sbu', nullable=False)
    
    # Drop department column from students
    op.drop_column('students', 'department')
    
    # Add sbu column back to mentors
    op.add_column('mentors', sa.Column('sbu', sbu_enum, nullable=True))
    
    # Copy data back from department to sbu for mentors
    op.execute("""
        UPDATE mentors 
        SET sbu = CASE 
            WHEN UPPER(department) = 'IT' THEN 'IT'::sbu
            WHEN UPPER(department) = 'HR' THEN 'HR'::sbu
            WHEN UPPER(department) = 'FINANCE' THEN 'FINANCE'::sbu
            WHEN UPPER(department) = 'OPERATIONS' THEN 'OPERATIONS'::sbu
            WHEN UPPER(department) = 'SALES' THEN 'SALES'::sbu
            WHEN UPPER(department) = 'MARKETING' THEN 'MARKETING'::sbu
            ELSE NULL
        END
    """)
    
    # Drop department column from mentors
    op.drop_column('mentors', 'department')

