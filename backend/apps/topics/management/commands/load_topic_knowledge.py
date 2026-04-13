"""
Management command to load generated topic knowledge JSONs into PostgreSQL.
Reads all files from topic_knowledge/ directory and upserts into TopicKnowledge model.
Attempts to FK-match each topic to existing Topic records via TrainingPlan linkage.

Usage:
    python manage.py load_topic_knowledge
    python manage.py load_topic_knowledge --clear  # Clear existing before load
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand
from django.conf import settings

from apps.topics.models import TopicKnowledge, Topic
from apps.training_plans.models import TrainingPlan, PlanTopic


class Command(BaseCommand):
    help = 'Load generated topic knowledge JSON files into the TopicKnowledge table'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear', action='store_true',
            help='Clear all existing TopicKnowledge records before loading'
        )
        parser.add_argument(
            '--dir', type=str, default=None,
            help='Directory containing topic knowledge JSON files (default: project_root/topic_knowledge/)'
        )

    def handle(self, *args, **options):
        # Resolve knowledge directory
        if options['dir']:
            knowledge_dir = Path(options['dir'])
        else:
            knowledge_dir = Path(settings.BASE_DIR).parent / 'topic_knowledge'

        if not knowledge_dir.exists():
            self.stderr.write(self.style.ERROR(f"Directory not found: {knowledge_dir}"))
            return

        json_files = sorted(knowledge_dir.glob('*.json'))
        json_files = [f for f in json_files if f.name != '_checkpoint.json']

        if not json_files:
            self.stderr.write(self.style.ERROR(f"No JSON files found in {knowledge_dir}"))
            return

        self.stdout.write(f"Found {len(json_files)} knowledge files in {knowledge_dir}")

        if options['clear']:
            deleted_count, _ = TopicKnowledge.objects.all().delete()
            self.stdout.write(self.style.WARNING(f"Cleared {deleted_count} existing records"))

        # Pre-load topic matching data
        plan_topic_map = self._build_topic_map()

        total_created = 0
        total_updated = 0
        total_matched = 0
        total_topics = 0

        for json_file in json_files:
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                roadmap_id = data.get('roadmap_id', json_file.stem)
                topics = data.get('topics', [])
                file_created = 0
                file_updated = 0
                file_matched = 0

                for topic_data in topics:
                    if topic_data.get('generation_status') != 'success':
                        continue

                    knowledge_dict = topic_data.get('knowledge', {})
                    topic_name = topic_data.get('topic_name', '')
                    section_id = topic_data.get('section_id', '')

                    # Try to match to existing Topic via TrainingPlan
                    matched_topic = self._match_topic(
                        topic_name, roadmap_id, plan_topic_map
                    )

                    obj, created = TopicKnowledge.objects.update_or_create(
                        roadmap_id=roadmap_id,
                        section_id=section_id,
                        topic_name=topic_name,
                        defaults={
                            'section_name': topic_data.get('section_name', ''),
                            'topic': matched_topic,
                            'benchmark_hours': topic_data.get('benchmark_hours', 0),
                            'difficulty': topic_data.get('difficulty', 3),
                            'what_it_is': knowledge_dict.get('what_it_is', ''),
                            'what_you_will_learn': knowledge_dict.get('what_you_will_learn', []),
                            'subtopics': knowledge_dict.get('subtopics', []),
                            'validation_keywords': knowledge_dict.get('validation_keywords', []),
                            'version_hash': topic_data.get('version_hash', ''),
                            'is_active': True,
                        }
                    )

                    if created:
                        file_created += 1
                    else:
                        file_updated += 1
                    if matched_topic:
                        file_matched += 1

                total_created += file_created
                total_updated += file_updated
                total_matched += file_matched
                total_topics += len(topics)

                self.stdout.write(
                    f"  {roadmap_id}: {file_created} created, {file_updated} updated, "
                    f"{file_matched} FK-matched ({len(topics)} topics)"
                )

            except Exception as e:
                self.stderr.write(self.style.ERROR(f"Error loading {json_file.name}: {e}"))

        self.stdout.write(self.style.SUCCESS(
            f"\nDone! {total_created} created, {total_updated} updated, "
            f"{total_matched} FK-matched to Topics ({total_topics} total across {len(json_files)} roadmaps)"
        ))

    def _build_topic_map(self):
        """
        Build a mapping: roadmap_id -> {topic_name_lower: Topic instance}
        Uses TrainingPlan.source_template to link roadmap files to plans.
        """
        topic_map = {}
        plans = TrainingPlan.objects.filter(
            is_archived=False, source_template__isnull=False
        ).exclude(source_template='')

        for plan in plans:
            roadmap_id = plan.source_template
            if roadmap_id not in topic_map:
                topic_map[roadmap_id] = {}

            plan_topics = PlanTopic.objects.filter(
                plan=plan, topic__is_active=True
            ).select_related('topic')

            for pt in plan_topics:
                topic_map[roadmap_id][pt.topic.name.lower().strip()] = pt.topic

        self.stdout.write(
            f"Built topic map: {len(topic_map)} roadmaps, "
            f"{sum(len(v) for v in topic_map.values())} topics"
        )
        return topic_map

    def _match_topic(self, topic_name, roadmap_id, plan_topic_map):
        """Try to match a knowledge topic to an existing Topic model."""
        name_lower = topic_name.lower().strip()

        # 1. Try exact match within the roadmap's plan
        if roadmap_id in plan_topic_map:
            if name_lower in plan_topic_map[roadmap_id]:
                return plan_topic_map[roadmap_id][name_lower]

        # 2. Try across all plans (topic might exist in a different plan)
        for rid, topics in plan_topic_map.items():
            if name_lower in topics:
                return topics[name_lower]

        # 3. Try direct Topic table lookup
        topic = Topic.objects.filter(
            name__iexact=topic_name, is_active=True
        ).first()
        return topic
