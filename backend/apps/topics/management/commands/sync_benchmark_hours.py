"""
Management command to sync Topic.benchmark_hours from existing resource durations.
For topics that already have YouTube resources, update benchmark_hours = duration_minutes / 60.
"""
from django.core.management.base import BaseCommand
from apps.topics.models import Topic, TopicResource


class Command(BaseCommand):
    help = 'Sync benchmark_hours from existing YouTube resource durations'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview changes without saving')

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        # Get all active resources grouped by topic
        resources = TopicResource.objects.filter(
            is_active=True,
            duration_minutes__gt=0,
        ).select_related('topic')

        updated = 0
        skipped = 0

        # Track per-topic to avoid duplicates
        seen_topics = set()

        for res in resources:
            topic = res.topic
            if topic.id in seen_topics:
                continue
            seen_topics.add(topic.id)

            resource_hours = round(res.duration_minutes / 60, 1)
            old_hours = float(topic.benchmark_hours)

            if resource_hours == old_hours:
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"  [DRY RUN] {topic.name}: {old_hours}h -> {resource_hours}h "
                    f"(resource: {res.duration_minutes}min)"
                )
            else:
                topic.benchmark_hours = resource_hours
                topic.save(update_fields=['benchmark_hours'])
                self.stdout.write(
                    f"  [OK] {topic.name}: {old_hours}h -> {resource_hours}h "
                    f"(resource: {res.duration_minutes}min)"
                )
            updated += 1

        mode = '[DRY RUN] ' if dry_run else ''
        self.stdout.write(self.style.SUCCESS(
            f'\n{mode}Done: {updated} topics updated, {skipped} already synced'
        ))
