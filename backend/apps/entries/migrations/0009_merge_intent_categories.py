"""
Migration: Merge 4 intent categories into 2.

deep_learning + review -> lnd_tasks
project_work + debugging -> sbu_tasks
"""

from django.db import migrations, models


def migrate_intents_forward(apps, schema_editor):
    Entry = apps.get_model('entries', 'Entry')
    # Topic-based intents -> lnd_tasks
    Entry.objects.filter(intent__in=['deep_learning', 'review']).update(intent='lnd_tasks')
    # Project-based intents -> sbu_tasks
    Entry.objects.filter(intent__in=['project_work', 'debugging']).update(intent='sbu_tasks')


def migrate_intents_reverse(apps, schema_editor):
    Entry = apps.get_model('entries', 'Entry')
    # Reverse: lnd_tasks -> deep_learning (default)
    Entry.objects.filter(intent='lnd_tasks').update(intent='deep_learning')
    # Reverse: sbu_tasks -> project_work (default)
    Entry.objects.filter(intent='sbu_tasks').update(intent='project_work')


class Migration(migrations.Migration):

    dependencies = [
        ('entries', '0008_populate_projects_from_entries'),
    ]

    operations = [
        # Step 1: Data migration first (while field still accepts old values via no-validate)
        migrations.RunPython(migrate_intents_forward, migrate_intents_reverse),

        # Step 2: Alter field to new choices
        migrations.AlterField(
            model_name='entry',
            name='intent',
            field=models.CharField(
                choices=[('lnd_tasks', 'L&D Tasks'), ('sbu_tasks', 'SBU Tasks')],
                default='lnd_tasks',
                help_text='Activity type: lnd_tasks, sbu_tasks',
                max_length=20,
            ),
        ),
    ]
