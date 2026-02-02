from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('audit', '0001_initial'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE OR REPLACE FUNCTION prevent_audit_changes()
            RETURNS TRIGGER AS $$
            BEGIN
                RAISE EXCEPTION 'Audit logs are immutable and cannot be modified or deleted.';
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS tr_prevent_audit_update ON audit_logs;
            CREATE TRIGGER tr_prevent_audit_update
            BEFORE UPDATE ON audit_logs
            FOR EACH ROW EXECUTE FUNCTION prevent_audit_changes();

            DROP TRIGGER IF EXISTS tr_prevent_audit_delete ON audit_logs;
            CREATE TRIGGER tr_prevent_audit_delete
            BEFORE DELETE ON audit_logs
            FOR EACH ROW EXECUTE FUNCTION prevent_audit_changes();
            """,
            reverse_sql="""
            DROP TRIGGER IF EXISTS tr_prevent_audit_update ON audit_logs;
            DROP TRIGGER IF EXISTS tr_prevent_audit_delete ON audit_logs;
            DROP FUNCTION IF EXISTS prevent_audit_changes();
            """
        ),
    ]
