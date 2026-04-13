"""
Management command to enrich topic metadata across all active training plans.

Sets benchmark_hours, domain, language, and difficulty for topics that still
have default values, based on plan context and topic name classification.

Usage:
    python manage.py enrich_topic_metadata --dry-run          # Preview only
    python manage.py enrich_topic_metadata                    # Apply changes
    python manage.py enrich_topic_metadata --plan-id=165      # Single plan only
"""

from django.core.management.base import BaseCommand
from apps.training_plans.models import TrainingPlan, PlanTopic
from apps.topics.models import Topic

# ═══════════════════════════════════════════════════════════════════════════
# PLAN → DOMAIN + LANGUAGE MAPPING
# ═══════════════════════════════════════════════════════════════════════════

PLAN_MAPPING = {
    # plan_name_lowercase → (domain, primary_language or None)
    'ai engineer':                   ('ai',                  'python'),
    'ai and data scientist':         ('ai_data_scientist',   'python'),
    'machine learning':              ('ml',                  'python'),
    'mlops':                         ('mlops',               'python'),
    'backend':                       ('backend',              None),
    'backend with python':           ('backend',             'python'),
    'frontend':                      ('frontend',            'javascript'),
    'frontend fundamentals':         ('frontend',            'javascript'),
    'android':                       ('android',             'kotlin'),
    'ios':                           ('ios',                 'swift'),
    'game developer':                ('game',                 None),
    'server side game developer':    ('game_server',          None),
    'devops':                        ('devops',               None),
    'devsecops':                     ('devsecops',            None),
    'data engineer':                 ('data_engineer',       'python'),
    'data analyst':                  ('data',                'python'),
    'postgresql':                    ('db_admin',            'sql'),
    'cyber security':                ('cyber_security',       None),
    'blockchain':                    ('blockchain',           None),
    'bi analyst':                    ('bi',                   None),
    'product manager':               ('product_manager',      None),
    'engineering manager':           ('engineering_manager',   None),
    'ux design':                     ('design',               None),
    'technical writer':              ('technical_writer',      None),
    'developer relations':           ('devrel',               None),
    'qa':                            ('qa',                   None),
    'software architect':            ('architect',            None),
}

# ═══════════════════════════════════════════════════════════════════════════
# TOPIC NAME → LANGUAGE OVERRIDES
# Specific keywords in topic name that override the plan-level language.
# Order matters — first match wins.
# ═══════════════════════════════════════════════════════════════════════════

LANGUAGE_KEYWORDS = [
    # Python ecosystem
    (['python', 'django', 'flask', 'fastapi', 'pandas', 'numpy', 'scikit-learn',
      'tensorflow', 'pytorch', 'keras', 'matplotlib', 'seaborn', 'langchain',
      'llama index', 'hugging face', 'celery', 'scrapy', 'pyspark', 'airflow',
      'jupyter', 'notebook', 'pip', 'conda'], 'python'),

    # JavaScript / TypeScript ecosystem
    (['javascript', 'react', 'vue', 'angular', 'svelte', 'next.js', 'nuxt',
      'node.js', 'express', 'nestjs', 'gatsby', 'electron', 'deno', 'bun',
      'webpack', 'vite', 'babel', 'npm', 'yarn', 'pnpm',
      'jquery', 'bootstrap', 'tailwind', 'd3.js', 'three.js', 'transformers.js'], 'javascript'),
    (['typescript'], 'typescript'),

    # Java / Kotlin ecosystem
    (['java ', 'spring boot', 'spring ', 'hibernate', 'maven', 'gradle',
      'junit', 'jetpack compose'], 'java'),
    (['kotlin'], 'kotlin'),

    # C# / .NET ecosystem
    (['c#', '.net', 'asp.net', 'entity framework', 'unity', 'xamarin', 'blazor'], 'csharp'),

    # C / C++ ecosystem
    (['c++', 'unreal engine', 'cmake', 'opengl', 'vulkan', 'directx'], 'cpp'),

    # Go
    (['golang', 'go ', 'goroutine'], 'go'),

    # Rust
    (['rust', 'cargo', 'tokio'], 'rust'),

    # Swift / iOS
    (['swift', 'swiftui', 'uikit', 'cocoapods', 'xcode'], 'swift'),

    # Ruby
    (['ruby', 'rails', 'sinatra', 'rspec'], 'ruby'),

    # PHP
    (['php', 'laravel', 'symfony', 'wordpress', 'composer'], 'php'),

    # SQL / Database
    (['sql', 'postgresql', 'mysql', 'sqlite', 'oracle', 'pl/pgsql',
      'stored procedures', 'triggers', 'views', 'indexes'], 'sql'),

    # R
    ([' r ', 'r programming', 'ggplot', 'shiny', 'tidyverse'], 'r'),

    # Solidity / Blockchain
    (['solidity', 'smart contract', 'ethereum', 'hardhat', 'truffle'], 'solidity'),

    # Shell
    (['bash', 'shell', 'powershell', 'zsh', 'terminal', 'command line'], 'bash'),

    # Dart / Flutter
    (['dart', 'flutter'], 'dart'),
]

# ═══════════════════════════════════════════════════════════════════════════
# TOPIC NAME → BENCHMARK HOURS
# Comprehensive map of topic names to industry-standard learning hours.
# Exact match first, then keyword / contains match.
# ═══════════════════════════════════════════════════════════════════════════

# Exact name match (lowercase) → hours
EXACT_HOURS = {
    # --- Languages (full learning) ---
    'python': 40, 'java': 50, 'javascript': 35, 'typescript': 25,
    'go': 30, 'golang': 30, 'rust': 60, 'c++': 60, 'c#': 45,
    'ruby': 30, 'php': 25, 'swift': 35, 'kotlin': 35, 'scala': 40,
    'r': 20, 'dart': 20, 'elixir': 30, 'haskell': 40, 'lua': 10,
    'perl': 20, 'sql': 20, 'html': 10, 'css': 15, 'solidity': 25,
    'julia': 10, 'assembly': 40, 'c/c++': 60,

    # --- Major Frameworks / Platforms ---
    'react': 25, 'angular': 35, 'vue.js': 20, 'vue': 20, 'svelte': 15,
    'next.js': 20, 'nuxt.js': 20, 'gatsby': 10,
    'django': 30, 'flask': 10, 'fastapi': 10, 'express.js': 15,
    'nestjs': 25, 'spring boot': 40, 'spring': 40,
    'ruby on rails': 30, 'laravel': 30, 'asp.net core': 30,
    'react native': 25, 'flutter': 25, 'swiftui': 20,
    'unity 3d': 40, 'unreal engine': 50, 'godot': 25,

    # --- AI/ML (full topics) ---
    'machine learning': 60, 'deep learning': 60, 'neural networks': 25,
    'nlp': 30, 'natural language processing': 30,
    'computer vision': 30, 'reinforcement learning': 40,
    'generative ai': 20, 'llms': 20, 'large language models': 20,
    'transformers': 20, 'bert': 10, 'gpt': 10, 'gpt models': 12,
    'prompt engineering': 10, 'langchain': 15, 'llama index': 12,
    'hugging face': 10, 'openai api': 5, 'ollama': 8,
    'rag': 15, 'fine-tuning': 25, 'ai agents': 20,
    'stable diffusion': 10, 'midjourney': 5,
    'ethical ai': 5, 'bias in ai': 5, 'mlops': 25,
    'tensorflow': 30, 'pytorch': 30, 'keras': 15,
    'scikit-learn': 15, 'pandas': 15, 'numpy': 10,
    'matplotlib': 8, 'seaborn': 8, 'plotly': 6,
    'supervised learning': 12, 'unsupervised learning': 10,
    'linear regression': 6, 'logistic regression': 6,
    'decision trees': 6, 'random forests': 6,
    'support vector machines': 6, 'k-means clustering': 6,
    'pca (dimensionality reduction)': 6,
    'cross-validation': 6, 'hyperparameter tuning': 8,
    'model evaluation & metrics': 8,
    'convolutional neural networks (cnns)': 12,
    'recurrent neural networks (rnns)': 12,
    'lstms & grus': 10, 'transfer learning': 8,
    'generative adversarial networks (gans)': 10,
    'neural networks fundamentals': 10,

    # --- AI/ML subtopics (exact entries to stop false keyword matches) ---
    'azure ai': 8, 'azure ml': 10, 'azure cognitive services': 8,
    'transformers.js': 5, 'sentence transformers': 8,
    'react prompting': 3, 'robust prompt engineering': 4,
    'prompt injection attacks': 3, 'openai moderation api': 2,
    'chat completions api': 3, 'openai functions / tools': 3,
    'open ai playground': 2, 'hugging face tasks': 5,
    'hugging face hub': 5, 'hugging face models': 5,
    'hugging face models (multimodal)': 5, 'models on hugging face': 5,
    'inference sdk': 3, 'ollama models': 4, 'ollama sdk': 4,
    'rag usecases': 3, 'rag vs fine-tuning': 3,
    'agents usecases': 3, 'multimodal ai usecases': 3,
    'langchain for multimodal apps': 8, 'llamaindex for multimodal apps': 8,
    'openai vision api': 3, 'dall-e api': 3, 'whisper api': 3,
    'open ai embedding models': 3, 'semantic search': 5,
    'data classification': 3, 'anomaly detection': 5,
    'recommendation systems': 8, 'chunking': 3, 'embedding': 3,
    'retrieval process': 3, 'purpose and functionality': 2,
    'generation': 3, 'manual implementation': 5,
    'mongodb atlas': 10, 'lancedb': 5,
    'openai assistant api': 3, 'image understanding': 3,
    'video understanding': 3, 'audio processing': 3,
    'image generation': 3, 'text-to-speech': 3, 'speech-to-text': 3,
    'ai code editors': 3, 'code completion tools': 3,
    'using sdks directly': 3, 'indexing embeddings': 3,
    'performing similarity search': 3, 'vector database (generic)': 10,
    'learn development tools': 8, 'learn vector databases': 10,
    'popular open source models': 3, 'open vs closed source models': 2,
    'mistral ai': 3, 'cohere': 3, 'replicate': 3,
    "anthropic's claude": 3, "google's gemini": 3,
    'maximum tokens': 2, 'token counting': 2,
    'capabilities / context length': 2, 'cut-off dates / knowledge': 2,
    'benefits of pre-trained models': 2, 'limitations and considerations': 2,
    'openai models': 3, 'bias and fairness': 3,
    'adding end-user ids in prompts': 2, 'conducting adversarial testing': 3,
    'know your customers / usecases': 2, 'constraining outputs and inputs': 2,
    'security and privacy concerns': 5, 'impact on product development': 2,
    'what is an ai engineer?': 2, 'ai engineer vs ml engineer': 2,
    'ai vs agi': 2, 'roles and responsiblities': 2, 'roles and responsibilities': 2,
    'inference': 3, 'training': 3, 'embeddings': 3,
    'confusion matrix': 3, 'feature scaling & normalization': 3,
    'semi-supervised learning': 5, 'self-supervised learning': 5,
    'scalars, vectors, tensors': 2, 'matrix & matrix operations': 3,
    'determinants, inverse of matrix': 2, 'basics of probability': 3,
    'what is an ml engineer?': 2,

    # --- Data ---
    'apache spark': 20, 'apache kafka': 12, 'apache airflow': 15,
    'etl pipelines': 12, 'data lakes': 8, 'stream processing': 10,
    'hadoop ecosystem': 15, 'mapreduce': 10,
    'data warehousing': 10, 'bigquery': 8, 'snowflake': 8,
    'feature engineering': 12, 'data cleaning': 8,
    'data normalization': 3, 'data generation': 2,
    'apache hadoop yarn': 5, 'hadoop, spark, mapreduce': 8,
    'data lakes & warehouses': 5, 'reverse etl usecases': 2,
    'what is cluster computing': 2,

    # --- Databases ---
    'postgresql': 15, 'mysql': 15, 'sqlite': 5, 'oracle': 30,
    'mongodb': 15, 'cassandra': 20, 'redis': 5,
    'elasticsearch': 15, 'dynamodb': 10, 'neo4j': 15,
    'firebase': 10, 'supabase': 5,
    'sql fundamentals': 15, 'database design': 15,
    'normalization': 5, 'indexing': 3, 'nosql databases': 10,
    'vector databases': 10, 'chroma': 5, 'pinecone': 5,
    'weaviate': 5, 'faiss': 5, 'qdrant': 5,
    'what are relational databases?': 2, 'sharding patterns': 5,
    'processes & memory architecture': 5, 'postgresql anonymizer': 3,
    'azure sql database': 5, 'couchdb': 5,

    # --- Cloud & DevOps ---
    'aws': 40, 'azure': 35, 'gcp': 35,
    'aws sagemaker': 15, 'azure machine learning': 15,
    'google cloud ai platform': 15,
    'cloud storage (s3, blob, gcs)': 8,
    'serverless ml (lambda, functions)': 8,
    'docker': 15, 'kubernetes': 30, 'helm': 5,
    'jenkins': 15, 'gitlab ci': 10, 'github actions': 8,
    'terraform': 20, 'ansible': 15,
    'prometheus': 10, 'grafana': 5,
    'linux': 20, 'nginx': 10, 'apache': 10,
    'microservices': 20, 'serverless': 10,
    'docker swarm': 8, 'docker compose': 5,
    'azure virtual machines': 5, 'azure blob storage': 5,
    'azure devops': 8, 'azure devops services': 5,
    'aws / azure / gcp': 10, 'aws / gcp / azure': 10,
    'providers: aws, gcp, azure': 5, 'suse linux': 5,
    'process monitoring': 3, 'networking tools': 5,
    'cloud computing basics': 3,
    'management and monitoring': 3, 'cost optimization': 3,
    'serverless computing': 3, 'serverless concepts': 3,
    'serverless options': 3, 'google deployment mgr.': 3,
    'cloud design patterns': 8,

    # --- CS Fundamentals ---
    'algorithms': 40, 'data structures': 40,
    'data structures and algorithms': 40,
    'system design': 30, 'distributed systems': 30,
    'design patterns': 25, 'clean code': 15,
    'oop': 15, 'functional programming': 20,
    'concurrency': 15, 'multithreading': 15,
    'networking': 20, 'security': 25,
    'owasp top 10': 10, 'cryptography': 15,
    'object-oriented programming': 15,
    'gof design patterns': 8,
    'basics of oop': 3, 'hashing algorithms': 5,
    'reactive programming': 8,

    # --- Tools ---
    'git': 10, 'github': 5, 'gitlab': 5,
    'jira': 5, 'postman': 3, 'swagger': 3,
    'figma': 15, 'adobe xd': 10, 'sketch': 10, 'balsamiq': 3,
    'vscode': 5, 'vs code': 3, 'vim': 15,

    # --- Frontend specific ---
    'dom manipulation': 5, 'flexbox': 4, 'grid': 5,
    'sass': 5, 'less': 5, 'tailwind css': 10,
    'material ui': 10, 'bootstrap': 10,
    'web components': 8, 'pwa': 10,
    'responsive design': 5, 'accessibility': 8,
    'webpack': 8, 'vite': 5,
    'react-router': 5, 'svelte kit': 8,
    'graphql basics': 3, 'content security policy': 5,
    'performance metrics': 3, 'performance best practices': 3,
    'offline support patterns': 3,
    'variables and data types': 1, 'functions, builtin functions': 2,

    # --- Android specific ---
    'rxkotlin': 5, 'firebase distribution': 3,
    'jetpack compose': 8,

    # --- iOS specific ---
    'learn swiftui': 10, 'rxswift': 8, 'rxswift with mvvm': 5,
    'swift package manager': 3, 'swiftlint': 2, 'swiftformat': 2,
    'accessibility inspector': 2, 'learn networking': 5,
    'learn concurrency and multithreading': 5,
    'concurrency (gcd, async/await)': 5, 'interoperability with swift': 3,
    'learn swift (recommended)': 20, 'history and why swift?': 1,
    'new project': 2, 'interface overview': 1, 'project files': 2,
    'latest swift version': 1, 'latest ios sdk': 2,

    # --- Game Dev specific ---
    'game physics': 10, 'collision detection': 8,
    'game engine': 10, 'opengl': 20, 'vulkan': 25,
    'directx': 20, 'shader programming': 15,
    'procedural generation': 12, 'ai in games': 10,
    'networking for games': 12, 'multiplayer': 15,
    'opengl es': 10, 'webgl': 5, 'metal': 5,
    'directx ray tracing': 8, 'vulkan ray tracing': 10,
    'real-time ray tracing': 5, 'physically-based rendering': 5,
    'ray tracing': 5, 'rasterization': 3, 'graphics pipeline': 5,
    'concurrency (java)': 8, 'future & promises': 3,

    # --- Game Dev subtopics (math/physics concepts) ---
    'linear algebra': 10, 'matrix': 3, 'linear transformation': 3,
    'geometry': 3, 'affine space': 3, 'affine transformation': 3,
    'vector': 3, 'projection': 3, 'perspective': 2, 'orthogonal': 2,
    'quaternion': 4, 'euler angle': 3, 'curve': 3,
    'spline': 3, 'hermite': 3, 'bezier': 3, 'catmull-rom': 3,
    'center of mass': 2, 'moment of inertia': 2,
    'acceleration': 2, 'joints': 2, 'force': 2,
    'restitution': 2, 'buoyancy': 2, 'friction': 2,
    'dynamics': 4, 'angular velocity': 2, 'linear velocity': 2,
    'ccd': 3, 'narrow phase': 3, 'intersection': 3,
    'sat': 3, 'gjk': 3, 'convexity': 3, 'epa': 3,
    'broad phase': 3, 'convex': 2, 'concave': 2,
    'convex hull': 3, 'convex decomposition': 3,
    'learn game physics': 10, 'learn projection': 5,
    'learn orientation': 5, 'learn dynamics': 6,
    'game mathematics': 10,
    'minimax': 3, 'behavior tree': 3, 'state machine': 3,
    'fuzzy logic': 3, 'mcts': 3, 'markov system': 3,
    'artificial neural network': 3, 'naive bayes classifier': 3,
    'decision tree': 3, 'decision tree learning': 3, 'ab pruning': 3,
    'goal oriented behavior': 3,

    # --- Blockchain specific ---
    'smart contracts': 15, 'ethereum': 15, 'defi': 10,
    'web3': 15, 'nft': 5, 'consensus mechanisms': 8,
    'dapps': 10, 'hardhat': 8, 'truffle': 8,
    'hybrid smart contracts': 5, 'ethereum 2.0': 5,
    'oracle networks': 5, 'blockchain structure': 3,
    'blockchain interoperability': 3, 'blockchain forking': 3,
    'crypto wallets': 3, 'crypto faucets': 1,
    'optimistic rollups & fraud proofs': 5,
    'zk rollups & zero knowledge proof': 8, 'vyper': 5,
    'foundry': 5, 'brownie': 4,

    # --- Cyber Security specific ---
    'penetration testing': 20, 'network security': 15,
    'vulnerability assessment': 12, 'malware analysis': 15,
    'incident response': 10, 'forensics': 15,
    'siem': 10, 'soc': 10,
    'introduction to cyber security': 3,
    'security frameworks (nist, cis, csf, iso': 5,
    'forensics basics': 3, 'privilege escalation': 5,
    'comptia a+': 3, 'comptia linux+': 3, 'comptia network+': 3,
    'comptia security+': 5, 'ccna': 10, 'ceh': 10,
    'cisa': 8, 'cism': 8, 'gsec': 8, 'gpen': 8,
    'gwapt': 5, 'giac': 10, 'oscp': 15, 'crest': 10, 'cissp': 15,
    'hackthebox': 8, 'tryhackme': 5, 'vulnhub': 8, 'picoctf': 5,
    'sans holiday hack challenge': 5,
    'wifi': 2, 'nfc': 1, 'infrared': 1, 'bluetooth': 2,
    'computer hardware components': 2,
    'connection types and their function': 2,
    'os-independent troubleshooting': 2,
    'networking tools (netstat, dig, ipconfig': 3,
    'identity & access management (kerberos,': 5,
    'cryptography, hashing, salting, and key': 5,
    'pki & private vs public keys': 3,
    'security tools (port scanners, protocol': 5,
    'vulnerability management & threat huntin': 5,
    'threat intel & osint': 5,
    'att&ck framework': 5, 'cyber kill chain & diamond model': 3,
    'malware analysis & types': 5,
    'web based attacks and owasp top 10': 5,
    'sql injection & xss': 5, 'buffer overflow': 3,
    'ids / ips / edr / dlp': 5, 'siem & soar': 5,
    'incident response (preparation, identifi': 5,
    'social engineering (phishing, vishing, s': 3,
    'windows': 5, 'macos': 3,
    'vmware': 2, 'virtualbox': 2, 'esxi': 2, 'proxmox': 2,
    'hypervisor': 2, 'vm': 2, 'guestos': 1, 'hostos': 1,
    'loopback / localhost': 1, 'ip': 1, 'cidr': 1,
    'subnet mask': 1, 'default gateway': 1,
    'arp': 1, 'dhcp': 1, 'nat': 1, 'vlan': 2, 'vpn': 2, 'dmz': 2,
    'saas / paas / iaas': 2,

    # --- QA specific ---
    'test automation': 20, 'selenium': 15,
    'cypress': 12, 'playwright': 10,
    'unit testing': 8, 'integration testing': 8,
    'performance testing': 10, 'load testing': 8,
    'api testing': 8, 'manual testing': 10,
    'test oracles': 3, 'non-functional testing': 5,
    'stress testing': 5, 'security testing': 5,
    'smoke testing': 2, 'selenium ide': 3,
    'postman / newman': 3, 'attack vectors': 3,
    'html, css, javascript': 3,

    # --- Product Manager / Engineering Manager ---
    'future scalability constraints': 3,
    'grooming sessions': 2, 'scrum basics': 3,
    'principles of ux design': 3, 'risk monitoring tools': 3,
    'ai in product mgmt.': 3, 'ml in product mgmt.': 3,
    'predictive analytics': 3,

    # --- Technical Writer ---
    'docs generation tools': 3, 'who is a technical writer?': 2,

    # --- Developer Relations ---
    'repetition & reinforcement': 2, 'content performance': 3,

    # --- BI Analyst ---
    'power bi': 10, 'tableau': 10, 'dimensional modeling': 5,
    'inventory optimization': 3, 'supply chain optimization': 3,
    'resume optimization': 2, 'coherence': 2,

    # --- Software Architect ---
    'java / kotlin / scala': 5, 'javascript / typescript': 5,
    'react, vue, angular': 5,
    'datawarehouse principles': 3, 'linux / unix': 5,
    'ms dynamics': 3, 'salesforce': 3,

    # --- Server Side Game Dev ---
    'learn reactive approach': 5,

    # --- Small concepts ---
    'what is http?': 1, 'what is domain name?': 1,
    'what is hosting?': 2, 'how does the internet work?': 3,
    'browsers': 2, 'dns': 3, 'cors': 2, 'jwt': 3,
    'oauth': 5, 'cookies': 2, 'sessions': 2,
    'variables': 1, 'data types': 1, 'functions': 2,
    'loops': 2, 'arrays': 2, 'objects': 2, 'classes': 3,
    'inheritance': 2, 'promises': 3, 'async/await': 3,
    'selinux': 3,

    # --- NLP specific ---
    'text preprocessing': 8, 'word embeddings (word2vec, glove)': 10,
    'transformers architecture': 15, 'bert & variants': 12,
    'named entity recognition (ner)': 8, 'sentiment analysis': 8,
    'hugging face transformers': 12,

    # --- CV specific ---
    'image processing fundamentals': 12,
    'object detection (yolo, r-cnn)': 15,
    'image segmentation': 12, 'face recognition': 10,
    'opencv': 12,

    # --- MLOps specific ---
    'model deployment': 12, 'model monitoring': 8,
    'ci/cd for machine learning': 10,
    'docker for ml': 10, 'kubernetes for ml': 12,
    'mlflow': 8, 'experiment tracking': 6,
    'model versioning': 6, 'feature stores': 6,
    'experiment tracking & model registry': 5,
    'learn mlops principles': 5, 'learn mlops': 10,
}

# ═══════════════════════════════════════════════════════════════════════════
# SMALL-TOPIC PATTERNS — checked BEFORE keyword matching to prevent
# overmatch (e.g. "Introduction to Cyber Security" matching "security"→25h)
# ═══════════════════════════════════════════════════════════════════════════

SMALL_TOPIC_PATTERNS = [
    # These patterns indicate a short-concept topic and should cap hours
    # Format: (keyword_in_name, max_hours)
    ('what is', 2),
    ('who is', 2),
    ('why ', 2),
    ('how does', 3),
    ('introduction', 3),
    ('intro to', 3),
    ('overview', 2),
    ('history and', 2),
    ('key concept', 3),
    ('benefits of', 2),
    ('limitations', 2),
    ('considerations', 2),
    ('basics of', 4),
    (' basics', 4),
    ('vs ', 3),
    ('differences', 2),
    ('types of', 3),
]

# ═══════════════════════════════════════════════════════════════════════════
# KEYWORD CATEGORIES — generic topic-type → hours
# ═══════════════════════════════════════════════════════════════════════════

KEYWORD_CATEGORIES = [
    # "Learn X" pattern — major topics, but capped
    ('learn ', 8),

    # Single-concept topics
    ('what is', 2),
    ('what are', 2),
    ('who is', 2),
    ('use cases', 3),
    ('usecases', 3),

    # Practice / Meta
    ('best practices', 5),
    ('principles', 4),
    ('patterns', 8),
    ('certification', 25),
    ('capstone', 20),
    ('project', 15),

    # Technical categories
    ('fundamentals', 6),
    ('advanced', 10),
    ('deep dive', 10),
    ('architecture', 10),
    ('performance', 5),
    ('security', 5),
    ('testing', 5),
    ('deployment', 5),
    ('monitoring', 5),
    ('debugging', 5),
    ('optimization', 5),
]


import re

# Topics that should NOT get language detected from name
# (their names contain a framework/language keyword but it means something else)
LANG_FALSE_POSITIVES = {
    'react prompting', 'react prompt', 'react pattern', 'react agent',
    'angular velocity', 'angular momentum', 'angular acceleration',
    'perspective', 'perspective projection',
    'express route', 'express delivery',
    'convex hull', 'convex decomposition',
    'node', 'nodes',  # not Node.js
    'graph', 'graphs',  # not GraphQL
    'shell', 'shells',  # not Bash when in game/other contexts
    'rust prevention', 'rust resistance',
}

# Short keywords that are ambiguous and need word-boundary matching
_WORD_BOUNDARY_KEYWORDS = {
    'react', 'angular', 'vue', 'go', 'rust', 'r', 'dart', 'ruby',
    'express', 'node', 'shell', 'unity', 'rails',
}


def detect_language(topic_name, plan_language):
    """Detect language from topic name keywords. Returns plan default if no match."""
    name_lower = topic_name.lower().strip()

    # Block known false positives
    if name_lower in LANG_FALSE_POSITIVES:
        return plan_language

    padded = ' ' + name_lower + ' '  # Pad for word boundary matching

    for keywords, lang in LANGUAGE_KEYWORDS:
        for kw in keywords:
            if kw in _WORD_BOUNDARY_KEYWORDS:
                # Use word boundary matching for ambiguous keywords
                pattern = r'\b' + re.escape(kw.strip()) + r'\b'
                if re.search(pattern, name_lower):
                    # Extra check: 'react' should only match React the framework,
                    # not compound words like 'ReAct'
                    if kw == 'react' and 'ReAct' in topic_name:
                        continue
                    if kw == 'angular' and 'velocity' in name_lower:
                        continue
                    if kw == 'angular' and 'momentum' in name_lower:
                        continue
                    return lang
            else:
                if kw in padded:
                    return lang

    return plan_language


def classify_hours(topic_name, current_hours, difficulty, has_children):
    """
    Determine benchmark_hours for a topic based on its name and context.
    Returns (new_hours, confidence, match_type).

    Priority order:
      1. Exact name match (highest confidence)
      2. "X vs Y" comparison topics → 3h
      3. Small-topic patterns (introduction, basics, what is) → capped hours
      4. Keyword/contains match from EXACT_HOURS (longest match wins)
      5. Category-based match (learn, fundamentals, certification, etc.)
      6. Difficulty-based fallback
    """
    # Container/root topics stay at 0
    if has_children:
        return 0, 'high', 'container'

    name_lower = topic_name.lower().strip()

    # 1. Exact name match (highest priority)
    if name_lower in EXACT_HOURS:
        hours = EXACT_HOURS[name_lower]
        return hours, 'high', 'exact'

    # 2. "X vs Y" comparison topics — always short study
    if ' vs ' in name_lower:
        return 3, 'high', 'comparison'

    # 3. SMALL-TOPIC PATTERNS — caps hours for intro/overview/basics topics
    #    This MUST run before keyword matching to prevent false-positive
    #    overmatches like "Introduction to Cyber Security" → 25h
    for pattern, max_hours in SMALL_TOPIC_PATTERNS:
        if pattern in name_lower:
            return max_hours, 'high', 'small_pattern'

    # 4. Keyword/contains match from EXACT_HOURS
    #    Requires minimum key length of 5, picks longest match
    best_match = None
    best_match_len = 0
    for key, hours in EXACT_HOURS.items():
        if len(key) >= 5 and key in name_lower:
            if len(key) > best_match_len:
                best_match = hours
                best_match_len = len(key)

    if best_match is not None:
        # Sanity cap: if the topic name is short (< 30 chars) but the
        # keyword gives > 20h, it's likely a subtopic, not the full thing
        if best_match > 20 and len(name_lower) > len(name_lower.split(maxsplit=1)[0]) + 2:
            # Multi-word name — if the matched keyword is a substring of a
            # longer name, cap to a reasonable subtopic level
            if best_match_len < len(name_lower) - 3:
                best_match = min(best_match, 10)
        return best_match, 'medium', 'keyword'

    # 5. Category-based match
    for keyword, hours in KEYWORD_CATEGORIES:
        if keyword in name_lower:
            return hours, 'medium', 'category'

    # 6. Difficulty-based fallback
    fallback_map = {1: 1, 2: 3, 3: 5, 4: 8, 5: 12}
    hours = fallback_map.get(difficulty, 3)
    return hours, 'low', 'difficulty_fallback'


class Command(BaseCommand):
    help = 'Enrich topic metadata (benchmark_hours, domain, language, difficulty) across active plans'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview changes without saving',
        )
        parser.add_argument(
            '--plan-id',
            type=int,
            help='Process only a specific plan ID',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        plan_id = options.get('plan_id')

        if dry_run:
            self.stdout.write(self.style.WARNING('=== DRY RUN MODE — no changes will be saved ===\n'))

        # Get active plans
        plans_qs = TrainingPlan.objects.filter(is_active=True, is_archived=False)
        if plan_id:
            plans_qs = plans_qs.filter(id=plan_id)

        plans = plans_qs.order_by('plan_name')
        if not plans.exists():
            self.stdout.write(self.style.ERROR('No matching plans found.'))
            return

        total_stats = {
            'topics_processed': 0,
            'hours_updated': 0,
            'domain_updated': 0,
            'language_updated': 0,
            'expected_hours_synced': 0,
        }

        for plan in plans:
            self._process_plan(plan, dry_run, total_stats)

        # Summary
        self.stdout.write('\n' + '=' * 80)
        self.stdout.write(self.style.SUCCESS('SUMMARY'))
        self.stdout.write(f'  Topics processed:    {total_stats["topics_processed"]}')
        self.stdout.write(f'  Hours updated:       {total_stats["hours_updated"]}')
        self.stdout.write(f'  Domain updated:      {total_stats["domain_updated"]}')
        self.stdout.write(f'  Language updated:     {total_stats["language_updated"]}')
        self.stdout.write(f'  Expected hrs synced: {total_stats["expected_hours_synced"]}')
        if dry_run:
            self.stdout.write(self.style.WARNING('\n  (DRY RUN — nothing was saved)'))

    def _process_plan(self, plan, dry_run, stats):
        plan_key = plan.plan_name.lower().strip()
        mapping = PLAN_MAPPING.get(plan_key)

        if not mapping:
            self.stdout.write(self.style.WARNING(
                f'\n⚠ Plan "{plan.plan_name}" (ID={plan.id}) — no mapping found, skipping'
            ))
            return

        plan_domain, plan_language = mapping

        pts = PlanTopic.objects.filter(plan=plan).select_related('topic')
        pts = pts.order_by('sequence_order')

        # Check which topics are containers (have children in this plan)
        topic_ids = set(pts.values_list('topic_id', flat=True))
        parent_ids = set(
            Topic.objects.filter(
                id__in=topic_ids,
                children__id__in=topic_ids
            ).values_list('id', flat=True)
        )

        self.stdout.write(f'\n{"=" * 80}')
        self.stdout.write(f'Plan: {plan.plan_name} (ID={plan.id})')
        self.stdout.write(f'  Mapping: domain={plan_domain}, lang={plan_language}')
        self.stdout.write(f'  Topics: {pts.count()} ({len(parent_ids)} containers)')
        self.stdout.write(f'  {"#":>3}  {"Topic":<40} {"old_h":>5} {"new_h":>5} {"conf":<4} {"domain":<15} {"lang":<10}')
        self.stdout.write(f'  {"-"*3}  {"-"*40} {"-"*5} {"-"*5} {"-"*4} {"-"*15} {"-"*10}')

        plan_hours_updated = 0
        plan_domain_updated = 0
        plan_lang_updated = 0
        plan_exph_synced = 0

        for i, pt in enumerate(pts):
            topic = pt.topic
            has_children = topic.id in parent_ids
            current_hours = float(topic.benchmark_hours)

            # --- Classify hours ---
            new_hours, confidence, match_type = classify_hours(
                topic.name, current_hours, topic.difficulty, has_children
            )

            hours_changed = abs(new_hours - current_hours) > 0.1

            # --- Determine domain ---
            # Only update if currently 'general' (default)
            new_domain = topic.domain
            domain_changed = False
            if topic.domain == 'general' and not has_children:
                new_domain = plan_domain
                domain_changed = True

            # --- Determine language ---
            new_language = topic.language
            lang_changed = False
            if not topic.language and not has_children:
                detected = detect_language(topic.name, plan_language)
                if detected:
                    new_language = detected
                    lang_changed = True

            # --- Log ---
            changes = []
            if hours_changed: changes.append(f'{current_hours:.0f}→{new_hours}h')
            if domain_changed: changes.append(f'd:{topic.domain}→{new_domain}')
            if lang_changed: changes.append(f'l:→{new_language}')

            if changes:
                flag = '  ' if confidence == 'high' else (' ?' if confidence == 'medium' else ' !!')
                self.stdout.write(
                    f'  {i+1:>3}  {topic.name[:40]:<40} {current_hours:>5.0f} {new_hours:>5} '
                    f'{confidence[0]:<4} {new_domain:<15} {str(new_language or "-"):<10}{flag}'
                )

            # --- Apply changes ---
            topic_save_needed = False

            if hours_changed:
                topic.benchmark_hours = new_hours
                topic_save_needed = True
                plan_hours_updated += 1

            if domain_changed:
                topic.domain = new_domain
                topic_save_needed = True
                plan_domain_updated += 1

            if lang_changed:
                topic.language = new_language
                topic_save_needed = True
                plan_lang_updated += 1

            if not dry_run and topic_save_needed:
                topic.save(update_fields=['benchmark_hours', 'domain', 'language'])

            # --- Sync PlanTopic.expected_hours ---
            # If pt.expected_hours differs from the new benchmark, sync it
            final_hours = float(topic.benchmark_hours) if not hours_changed else new_hours
            if has_children:
                final_hours = 0

            pt_hours = float(pt.expected_hours)
            if abs(pt_hours - final_hours) > 0.1 and final_hours > 0:
                if not dry_run:
                    pt.expected_hours = final_hours
                    pt.save(update_fields=['expected_hours'])
                plan_exph_synced += 1

            stats['topics_processed'] += 1

        # Plan summary
        self.stdout.write(f'\n  Plan totals: hours={plan_hours_updated} domain={plan_domain_updated} '
                          f'lang={plan_lang_updated} exp_sync={plan_exph_synced}')

        stats['hours_updated'] += plan_hours_updated
        stats['domain_updated'] += plan_domain_updated
        stats['language_updated'] += plan_lang_updated
        stats['expected_hours_synced'] += plan_exph_synced
