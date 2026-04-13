import time
import os
import google.generativeai as genai
from django.core.management.base import BaseCommand
from django.db.models import Q
from apps.topics.models import Topic

class Command(BaseCommand):
    help = 'Uses Gemini AI to classify topics into Domains and Languages'

    def handle(self, *args, **options):
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            self.stdout.write(self.style.ERROR('GEMINI_API_KEY environment variable not set'))
            return

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-pro')

        # Batch size for AI processing
        BATCH_SIZE = 50 
        
        # Fetch topics that need classification (General domain OR no language)
        # Excluding root topics might be safer, but let's process all leaf nodes basically
        topics_to_classify = Topic.objects.filter(
            Q(domain='general') | Q(language__isnull=True) | Q(language='')
        ).order_by('id')

        total = topics_to_classify.count()
        self.stdout.write(f"Found {total} topics to classify...")

        for i in range(0, total, BATCH_SIZE):
            batch = topics_to_classify[i:i+BATCH_SIZE]
            
            # Prepare prompt
            topic_names = [f"{t.id}: {t.name}" for t in batch]
            prompt = """
            You are a technical classifier for a learning system.
            Classify the following topics into:
            1. DOMAIN: Must be one of [backend, frontend, devops, mobile, data, qa, general]
            2. LANGUAGE: The primary programming language or tool (e.g. python, react, aws, kubernetes). If generic, use 'none'.
            
            Format response strictly as:
            ID|DOMAIN|LANGUAGE
            
            Example:
            101|frontend|react
            102|backend|python
            103|devops|docker
            
            Topics to classify:
            """ + "\n".join(topic_names)

            try:
                response = model.generate_content(prompt)
                lines = response.text.strip().split('\n')
                
                updates = []
                for line in lines:
                    parts = line.split('|')
                    if len(parts) == 3:
                        try:
                            t_id = int(parts[0].strip())
                            domain = parts[1].strip().lower()
                            language = parts[2].strip().lower()
                            
                            if language == 'none':
                                language = None
                                
                            # Validate domain
                            valid_domains = ['backend', 'frontend', 'devops', 'mobile', 'data', 'qa', 'general']
                            if domain not in valid_domains:
                                domain = 'general'

                            # Find topic in batch (avoid DB hit if possible, but safe to filter)
                            topic = next((t for t in batch if t.id == t_id), None)
                            if topic:
                                topic.domain = domain
                                topic.language = language
                                updates.append(topic)
                        except ValueError:
                            continue

                if updates:
                    Topic.objects.bulk_update(updates, ['domain', 'language'])
                    self.stdout.write(self.style.SUCCESS(f"Updated {len(updates)} topics in batch {i//BATCH_SIZE + 1}"))
                
                # Rate limiting safety
                time.sleep(1)

            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Batch failed: {str(e)}"))

        self.stdout.write(self.style.SUCCESS("Classification complete!"))
