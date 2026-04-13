"""
Management command to build ChromaDB knowledge index from PostgreSQL data.
Indexes all TopicKnowledge records + existing GlobalWisdom entries.

Usage:
    python manage.py build_knowledge_index
    python manage.py build_knowledge_index --topics-only
    python manage.py build_knowledge_index --wisdom-only
"""
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Build ChromaDB knowledge index from TopicKnowledge + GlobalWisdom data'

    def add_arguments(self, parser):
        parser.add_argument(
            '--topics-only', action='store_true',
            help='Only index topic knowledge (skip wisdom)',
        )
        parser.add_argument(
            '--wisdom-only', action='store_true',
            help='Only index admin wisdom (skip topics)',
        )

    def handle(self, *args, **options):
        from apps.entries.rag_engine import RAGEngine

        self.stdout.write("Initializing RAG Engine...")
        rag = RAGEngine.get_instance()

        topics_only = options.get('topics_only', False)
        wisdom_only = options.get('wisdom_only', False)

        if not wisdom_only:
            self.stdout.write("Building topic knowledge index...")
            topic_count = rag.build_topic_index()
            self.stdout.write(self.style.SUCCESS(
                f"Indexed {topic_count} topic knowledge documents into ChromaDB"
            ))

        if not topics_only:
            self.stdout.write("Loading admin wisdom entries...")
            wisdom_count = rag.bulk_load_wisdom()
            self.stdout.write(self.style.SUCCESS(
                f"Loaded {wisdom_count} admin wisdom entries into ChromaDB"
            ))

        # Health check
        health = rag.health_check()
        self.stdout.write(f"\nHealth check: {health}")
        self.stdout.write(self.style.SUCCESS("Done!"))
