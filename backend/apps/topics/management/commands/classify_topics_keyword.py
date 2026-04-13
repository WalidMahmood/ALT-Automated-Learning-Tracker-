from django.core.management.base import BaseCommand
from django.db.models import Q
from apps.topics.models import Topic
import logging

class Command(BaseCommand):
    help = 'Classifies topics into 26 specific Domains and Languages using keyword mapping'

    def handle(self, *args, **options):
        # Precise Mapping for 26+ Domains
        KEYWORD_MAP = {
            # --- Mobile ---
            'android': ('android', 'kotlin'),
            'kotlin': ('android', 'kotlin'),
            'jetpack': ('android', 'kotlin'),
            'apk': ('android', None),
            
            'ios': ('ios', 'swift'),
            'swift': ('ios', 'swift'),
            'xcode': ('ios', 'swift'),
            'cocoapods': ('ios', None),
            
            'react native': ('mobile', 'javascript'),
            'flutter': ('mobile', 'dart'),
            'mobile': ('mobile', None),
            'ionic': ('mobile', 'javascript'),

            # --- Game Dev ---
            'unity': ('game', 'c#'),
            'shader': ('game', None),
            'physics engine': ('game', None),
            'game design': ('game', None),
            'unreal': ('game', 'c++'), # Usually C++, but if specifically server side...
            'game server': ('game_server', None),
            'multiplayer': ('game_server', None),
            
            # --- Data & AI ---
            'data engineer': ('data_engineer', 'python'),
            'etl': ('data_engineer', 'python'),
            'pipeline': ('data_engineer', 'python'),
            'spark': ('data_engineer', 'scala'),
            'hadoop': ('data_engineer', 'java'),
            'airflow': ('data_engineer', 'python'), # Tool
            
            'ai engineer': ('ai', 'python'),
            'artificial intelligence': ('ai', 'python'),
            'transformer': ('ai', 'python'),
            'llm': ('ai', 'python'),
            'fine-tuning': ('ai', 'python'),
            
            'machine learning': ('ml', 'python'),
            'deep learning': ('ml', 'python'),
            'scikit': ('ml', 'python'),
            'tensorflow': ('ml', 'python'),
            'pytorch': ('ml', 'python'),
            
            'mlops': ('mlops', 'python'),
            'model deployment': ('mlops', None),
            
            'data analyst': ('data', 'python'), # python/sql
            'pandas': ('data', 'python'),
            'numpy': ('data', 'python'),
            'excel': ('data', None),
            'tableau': ('bi', None),
            'power bi': ('bi', None),
            'looker': ('bi', None),
            'visualization': ('bi', None),
            'dashboard': ('bi', None),
            
            'data scientist': ('ai_data_scientist', 'python'),
            'statistics': ('ai_data_scientist', None),
            
            # --- Backend & DB ---
            'postgres': ('db_admin', 'sql'),
            'postgresql': ('db_admin', 'sql'),
            'database admin': ('db_admin', 'sql'),
            'optimization': ('db_admin', 'sql'), # Generic but often DB
            
            'architect': ('architect', None),
            'system design': ('architect', None),
            'microservices': ('architect', None),
            'design pattern': ('architect', None),
            
            'blockchain': ('blockchain', 'solidity'),
            'smart contract': ('blockchain', 'solidity'),
            'ethereum': ('blockchain', 'solidity'),
            'web3': ('blockchain', None),
            'solidity': ('blockchain', 'solidity'),
            
            'backend': ('backend', None),
            'django': ('backend', 'python'),
            'node': ('backend', 'javascript'),
            'spring': ('backend', 'java'),
            'api': ('backend', None),
            
            # --- Frontend ---
            'frontend': ('frontend', None),
            'react': ('frontend', 'javascript'),
            'vue': ('frontend', 'javascript'),
            'angular': ('frontend', 'typescript'),
            'css': ('frontend', 'css'),
            'html': ('frontend', 'html'),
            'accessibility': ('frontend', None),
            
            'ux': ('design', 'figma'), # Figma is primary tool
            'ui design': ('design', 'figma'),
            'figma': ('design', 'figma'),
            'prototyping': ('design', 'figma'),
            'user research': ('design', None),
            
            # --- DevOps / Security ---
            'devops': ('devops', None),
            'docker': ('devops', 'docker'),
            'kubernetes': ('devops', 'kubernetes'),
            'aws': ('devops', 'aws'),
            'ci/cd': ('devops', None),
            'terraform': ('devops', 'terraform'),
            
            'cyber': ('cyber_security', None),
            'security': ('cyber_security', None),
            'penetration': ('cyber_security', None),
            'owasp': ('cyber_security', None),
            'hacking': ('cyber_security', None),
            
            'devsecops': ('devsecops', None),
            'sast': ('devsecops', None),
            'dast': ('devsecops', None),
            
            # --- QA ---
            'qa': ('qa', None),
            'testing': ('qa', None),
            'manual testing': ('qa', None),
            'bug': ('qa', None),
            
            'selenium': ('test_automation', 'java'),
            'cypress': ('test_automation', 'javascript'),
            'playwright': ('test_automation', 'typescript'),
            'automation': ('test_automation', None),
            
            # --- Management / Soft Skills ---
            'product manager': ('product_manager', None),
            'product management': ('product_manager', None),
            'roadmap': ('product_manager', None),
            'agile': ('product_manager', None),
            'scrum': ('product_manager', None),
            'user story': ('product_manager', None),
            
            'engineering manager': ('engineering_manager', None),
            'hiring': ('engineering_manager', None),
            'team': ('engineering_manager', None),
            'one-on-one': ('engineering_manager', None),
            'leadership': ('engineering_manager', None),
            
            'devrel': ('devrel', None),
            'advocacy': ('devrel', None),
            'community': ('devrel', None),
            'public speaking': ('devrel', None),
            
            'technical writing': ('technical_writer', None),
            'documentation': ('technical_writer', None),
            'markdown': ('technical_writer', None),
            
            # --- Fundamentals / General Tech ---
            'algorithm': ('fundamentals', None),
            'structure': ('fundamentals', None),
            'networking': ('fundamentals', None),
            'os': ('fundamentals', None),
            'computer science': ('fundamentals', None),
            'soft skill': ('soft_skills', None),
            'communication': ('soft_skills', None),
            'negotiation': ('soft_skills', None),
            'interview': ('soft_skills', None),
            
            # --- Broad Catch-alls ---
            'analysis': ('data', None),
            'analytics': ('data', None),
            'testing': ('qa', None),
            'security': ('cyber_security', None),
            'cloud': ('devops', None),
            'mobile': ('mobile', None),
            'web': ('fullstack', None),
            'app': ('mobile', None),
            'server': ('backend', None),
            'client': ('frontend', None),
            'code': ('fundamentals', None),
            'programming': ('fundamentals', None),
            'development': ('fundamentals', None),
            'architect': ('architect', None),
            'pattern': ('architect', None),
            'system': ('architect', None),
            'performance': ('backend', None),
            'optimization': ('backend', None),
            'scale': ('backend', None),
            'advanced': ('fundamentals', None), # Context usually implies advanced CS
            'introduction': ('fundamentals', None),
            'basics': ('fundamentals', None),
            
            # --- Domain Defaults to ensure they map ---
            'product': ('product_manager', None),
            'design': ('design', 'figma'),
        }
        
        # --- Defaults for Domain-Only Topics ---
        DOMAIN_DEFAULTS = {
            'android': 'kotlin',
            'ios': 'swift',
            'game': 'c#',
            'data': 'python',
            'ai': 'python',
            'ml': 'python',
            'frontend': 'javascript',
            'backend': 'python',
            'db_admin': 'sql',
            'test_automation': 'python', # or Java/JS
            'blockchain': 'solidity',
            'design': 'figma',
        }

        # 1. Keyword Scan
        topics = Topic.objects.all()
        count_keyword = 0
        updated_topics = []

        self.stdout.write(f"Scanning {topics.count()} topics against 26+ domains...")

        # Pass 1: Keywords
        for topic in topics:
            # We overwrite previous loose classifications
            name_lower = topic.name.lower()
            
            for keyword, (domain, lang) in KEYWORD_MAP.items():
                if keyword in name_lower:
                    topic.domain = domain
                    if lang:
                        topic.language = lang
                    updated_topics.append(topic)
                    count_keyword += 1
                    break
        
        if updated_topics:
            Topic.objects.bulk_update(updated_topics, ['domain', 'language'])
            self.stdout.write(f"Updated {len(updated_topics)} topics via keywords.")
            
        # Pass 2: Inheritance
        self.stdout.write("Pass 2: Inheritance...")
        topics_by_depth = Topic.objects.filter(domain='general').order_by('depth')
        updated_inheritance = []
        for topic in topics_by_depth:
            if topic.parent and topic.parent.domain != 'general':
                topic.domain = topic.parent.domain
                if not topic.language and topic.parent.language:
                    topic.language = topic.parent.language
                updated_inheritance.append(topic)
                
        if updated_inheritance:
            Topic.objects.bulk_update(updated_inheritance, ['domain', 'language'])
            self.stdout.write(f"Updated {len(updated_inheritance)} topics via inheritance.")

        # Pass 3: Defaults
        self.stdout.write("Pass 3: Domain Defaults...")
        domain_only = Topic.objects.filter(~Q(domain='general'), Q(language__isnull=True)|Q(language=''))
        updated_defaults = []
        for topic in domain_only:
            if topic.domain in DOMAIN_DEFAULTS:
                topic.language = DOMAIN_DEFAULTS[topic.domain]
                updated_defaults.append(topic)
                
        if updated_defaults:
            Topic.objects.bulk_update(updated_defaults, ['language'])
            self.stdout.write(f"Updated {len(updated_defaults)} topics with defaults.")

        self.stdout.write(self.style.SUCCESS(f"Total classified: {count_keyword + len(updated_inheritance) + len(updated_defaults)}"))
