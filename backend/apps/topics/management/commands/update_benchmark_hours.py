from django.core.management.base import BaseCommand
from django.db.models import Count
from apps.topics.models import Topic

# Industry-standard estimated hours for learning topics (Leaf nodes)
# This map targets specific learnable units.
HOURS_MAP = {
    # --- Languages ---
    "python": 40.0, "java": 50.0, "c#": 45.0, "javascript": 35.0, "typescript": 25.0,
    "go": 30.0, "rust": 60.0, "c++": 60.0, "ruby": 30.0, "php": 25.0, "swift": 35.0, "kotlin": 35.0,
    "scala": 40.0, "r": 20.0, "dart": 20.0, "elixir": 30.0, "haskell": 40.0, "lua": 10.0,
    "perl": 20.0, "shell": 15.0, "bash": 10.0, "powershell": 10.0, "sql": 20.0, "nosql": 10.0,
    "html": 10.0, "css": 15.0, "sass": 5.0, "less": 5.0, "assembly": 40.0,

    # --- Frameworks & Libraries ---
    "react": 25.0, "angular": 35.0, "vue.js": 20.0, "svelte": 15.0, "next.js": 20.0,
    "nuxt.js": 20.0, "gatsby": 10.0, "ember.js": 25.0, "backbone.js": 15.0,
    "django": 30.0, "flask": 10.0, "fastapi": 10.0, "spring boot": 40.0, "spring": 40.0,
    "express.js": 15.0, "nestjs": 25.0, "ruby on rails": 30.0, "laravel": 30.0,
    "asp.net core": 30.0, "entity framework": 15.0, "hibernate": 15.0,
    "pandas": 15.0, "numpy": 10.0, "scikit-learn": 15.0, "tensorflow": 30.0, "pytorch": 30.0,
    "keras": 15.0, "matplotlib": 8.0, "seaborn": 8.0, "d3.js": 20.0, "three.js": 20.0,
    "jquery": 5.0, "bootstrap": 10.0, "tailwind css": 10.0, "material ui": 10.0,
    
    # --- Databases & Storage ---
    "postgresql": 15.0, "mysql": 15.0, "sqlite": 5.0, "oracle": 30.0, "sql server": 25.0,
    "mongodb": 15.0, "cassandra": 20.0, "redis": 5.0, "elasticsearch": 15.0, "dynamodb": 10.0,
    "neo4j": 15.0, "couchdb": 10.0, "firebase": 10.0, "supabase": 5.0,
    "intro to databases": 5.0, "database design": 15.0, "normalization": 5.0,
    "indexing": 3.0, "transactions": 4.0, "acid": 2.0, "cap theorem": 2.0,

    # --- Cloud & DevOps ---
    "aws": 40.0, "azure": 35.0, "gcp": 35.0, "openstack": 30.0,
    "docker": 15.0, "kubernetes": 30.0, "helm": 5.0, "podman": 5.0,
    "jenkins": 15.0, "gitlab ci": 10.0, "github actions": 8.0, "circleci": 5.0,
    "travis ci": 5.0, "terraform": 20.0, "ansible": 15.0, "chef": 15.0, "puppet": 15.0,
    "prometheus": 10.0, "grafana": 5.0, "elk stack": 20.0, "datadog": 5.0, "new relic": 5.0,
    "linux": 20.0, "unix": 20.0, "ubuntu": 10.0, "centos": 10.0, "red hat": 15.0,
    "nginx": 10.0, "apache": 10.0, "haproxy": 8.0, "load balancing": 5.0,
    "serverless": 10.0, "microservices": 20.0, "containers": 10.0, "virtualization": 10.0,

    # --- Concepts & CS Fundamentals ---
    "algorithms": 40.0, "data structures": 40.0, "computational complexity": 10.0,
    "big o notation": 5.0, "sorting algorithms": 5.0, "search algorithms": 5.0,
    "graph algorithms": 10.0, "dynamic programming": 15.0, "recursion": 5.0,
    "design patterns": 25.0, "clean code": 15.0, "refactoring": 10.0, "solid principles": 5.0,
    "oop": 15.0, "functional programming": 20.0, "reactive programming": 15.0,
    "system design": 30.0, "distributed systems": 30.0, "concurrency": 15.0, "multithreading": 15.0,
    "networking": 20.0, "osi model": 5.0, "tcp/ip": 10.0, "http/https": 5.0, "dns": 3.0,
    "security": 25.0, "owasp top 10": 10.0, "cryptography": 15.0, "auth & auth": 10.0, "oauth": 5.0,
    "jwt": 3.0, "cors": 2.0, "cookies": 2.0, "sessions": 2.0,

    # --- Tools ---
    "git": 10.0, "github": 5.0, "gitlab": 5.0, "bitbucket": 3.0,
    "jira": 5.0, "confluence": 3.0, "trello": 2.0, "slack": 1.0,
    "vscode": 5.0, "intellij idea": 5.0, "eclipse": 5.0, "vim": 15.0, "emacs": 20.0,
    "postman": 3.0, "insomnia": 2.0, "swagger": 3.0, "graphql playground": 2.0,
    "figma": 15.0, "adobe xd": 10.0, "sketch": 10.0, "zeplin": 3.0,

    # --- AI/ML specific ---
    "machine learning": 60.0, "deep learning": 60.0, "neural networks": 25.0,
    "nlp": 30.0, "computer vision": 30.0, "reinforcement learning": 40.0,
    "generative ai": 20.0, "llms": 20.0, "transformers": 20.0, "bert": 10.0, "gpt": 10.0,
    "prompt engineering": 10.0, "langchain": 15.0, "hugging face": 10.0,
    "openai api": 5.0, "stable diffusion": 10.0, "midjourney": 5.0,
    "ethical ai": 5.0, "bias in ai": 5.0, "mlops": 25.0,

    # --- Specific Small Topics (from previous prompt + general) ---
    "what is http?": 1.0, "what is domain name?": 1.0, "what is hosting?": 2.0,
    "how does the internet work?": 3.0, "browsers": 2.0, "html basics": 4.0,
    "css selectors": 2.0, "box model": 2.0, "flexbox": 4.0, "grid": 5.0,
    "variables": 1.0, "data types": 1.0, "functions": 2.0, "loops": 2.0,
    "arrays": 2.0, "objects": 2.0, "classes": 3.0, "inheritance": 2.0,
    "methods": 2.0, "interfaces": 2.0, "generics": 3.0, "exceptions": 2.0,
    "promises": 3.0, "async/await": 3.0, "callbacks": 2.0, "modules": 2.0,
    "dom manipulation": 5.0, "event handling": 3.0, "ajax": 3.0, "fetch api": 2.0,
}

# Suffix multipliers for estimation
KEYWORD_HOURS = {
    'advanced': 10.0,
    'basics': 3.0,
    'introduction': 2.0,
    'overview': 1.0,
    'fundamentals': 4.0,
    'deep dive': 8.0,
    'mastery': 15.0,
    'project': 15.0,
    'certification': 25.0,
    'architecture': 10.0,
    'best practices': 5.0,
    'performance': 8.0,
    'security': 8.0,
    'testing': 8.0,
    'deployment': 5.0,
    'setup': 2.0,
    'installation': 1.0,
    'history': 1.0,
    'trends': 2.0,
}


from apps.training_plans.models import PlanTopic

# ... (imports)

class Command(BaseCommand):
    help = 'Update topic benchmark hours to realistic industry standards'

    def handle(self, *args, **kwargs):
        # Prefetch children count
        topics = Topic.objects.annotate(children_count=Count('children'))
        
        updated_count = 0
        container_count = 0
        plantopic_updated_count = 0
        
        self.stdout.write("Starting comprehensive update of benchmark hours...")
        
        for topic in topics:
            # 0. Container Logic
            if topic.children_count > 0:
                if float(topic.benchmark_hours) > 0:
                    topic.benchmark_hours = 0.0
                    topic.save()
                    container_count += 1
                continue
            
            # Use lower case name for matching
            name_lower = topic.name.lower().strip()
            original_hours = float(topic.benchmark_hours)
            new_hours = None

            # 1. Exact match
            if name_lower in HOURS_MAP:
                new_hours = HOURS_MAP[name_lower]
            
            # 2. Keyword match
            if new_hours is None:
                for key, hours in HOURS_MAP.items():
                    if key in name_lower and len(key) >= 3:
                        base_hours = hours
                        modifiers = 0.0
                        matched_modifier = False
                        for kw, kw_hours in KEYWORD_HOURS.items():
                            if kw in name_lower:
                                modifiers += kw_hours
                                matched_modifier = True
                        
                        if matched_modifier:
                            new_hours = modifiers
                        else:
                            new_hours = 2.0 
                        break

            # 3. Generic Keyword Search
            if new_hours is None:
                for kw, kw_hours in KEYWORD_HOURS.items():
                    if kw in name_lower:
                        new_hours = kw_hours
                        break
            
            # 4. Fallback for Leaf Nodes (Default 2.0 -> Heuristic)
            if new_hours is None and original_hours == 2.0:
                # Estimate based on difficulty
                if topic.difficulty == 1: new_hours = 1.0
                elif topic.difficulty == 2: new_hours = 2.0
                elif topic.difficulty == 3: new_hours = 4.0
                elif topic.difficulty == 4: new_hours = 6.0
                elif topic.difficulty == 5: new_hours = 8.0
                else: new_hours = 2.0
            
            # Determine final hours to save (if changed)
            final_hours = new_hours if new_hours is not None else original_hours
            
            if abs(final_hours - original_hours) > 0.1:
                topic.benchmark_hours = final_hours
                topic.save()
                updated_count += 1
            
            # 5. PROPAGATE TO PLANTOPICS
            # If the PlanTopic has expected_hours == 2.0 (default), update it to match the topic's new hours.
            # This ensures existing plans reflect the "industry standard" update.
            # We assume 2.0 is the "untouched default".
            
            relevant_pts = PlanTopic.objects.filter(topic=topic, expected_hours=2.0)
            if relevant_pts.exists():
                count = relevant_pts.update(expected_hours=final_hours)
                plantopic_updated_count += count
                
        self.stdout.write(self.style.SUCCESS(
            f'Finished update:\n'
            f'- {container_count} container topics set to 0h\n'
            f'- {updated_count} leaf topics updated\n'
            f'- {plantopic_updated_count} PlanTopic entries updated from default 2.0h'
        ))
