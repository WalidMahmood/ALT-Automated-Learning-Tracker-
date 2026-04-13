export const TOPIC_DOMAINS = [
    { value: 'frontend', label: 'Frontend' },
    { value: 'backend', label: 'Backend' },
    { value: 'fullstack', label: 'Full Stack' },
    { value: 'devops', label: 'DevOps' },
    { value: 'devsecops', label: 'DevSecOps' },
    { value: 'mobile', label: 'Mobile' },
    { value: 'android', label: 'Android' },
    { value: 'ios', label: 'iOS' },
    { value: 'game', label: 'Game Developer' },
    { value: 'game_server', label: 'Server Side Game Developer' },
    { value: 'qa', label: 'QA' },
    { value: 'test_automation', label: 'Test Automation' },
    { value: 'data', label: 'Data Analyst' },
    { value: 'data_engineer', label: 'Data Engineer' },
    { value: 'ai', label: 'AI Engineer' },
    { value: 'ai_data_scientist', label: 'AI and Data Scientist' },
    { value: 'ml', label: 'Machine Learning' },
    { value: 'mlops', label: 'MLOps' },
    { value: 'bi', label: 'BI Analyst' },
    { value: 'blockchain', label: 'Blockchain' },
    { value: 'cyber_security', label: 'Cyber Security' },
    { value: 'architect', label: 'Software Architect' },
    { value: 'db_admin', label: 'PostgreSQL / DBA' },
    { value: 'product_manager', label: 'Product Manager' },
    { value: 'engineering_manager', label: 'Engineering Manager' },
    { value: 'design', label: 'UX Design' },
    { value: 'technical_writer', label: 'Technical Writer' },
    { value: 'devrel', label: 'Developer Relations' },
    { value: 'fundamentals', label: 'Computer Science / Fundamentals' },
    { value: 'soft_skills', label: 'Soft Skills' },
    { value: 'general', label: 'General' },
] as const;

export type TopicDomain = typeof TOPIC_DOMAINS[number]['value'];

export const TECH_STACK_OPTIONS = [
    // Languages
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C++', 'C',
    'Go', 'Rust', 'Ruby', 'PHP', 'Kotlin', 'Swift', 'Dart', 'Scala',
    'R', 'Lua', 'Perl', 'Haskell', 'Elixir', 'Clojure',
    // Frontend
    'React', 'Vue.js', 'Angular', 'Next.js', 'Nuxt.js', 'Svelte',
    'HTML', 'CSS', 'Sass', 'TailwindCSS', 'Bootstrap', 'Material UI',
    'Vite', 'Webpack', 'jQuery',
    // Backend
    'Node.js', 'Express.js', 'NestJS', 'Django', 'Flask', 'FastAPI',
    'Spring Boot', 'ASP.NET', 'Ruby on Rails', 'Laravel', 'Phoenix',
    'GraphQL', 'REST API', 'gRPC',
    // Databases
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle',
    'SQL Server', 'Cassandra', 'DynamoDB', 'Elasticsearch', 'Neo4j',
    'Firebase', 'Supabase',
    // Cloud & DevOps
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform',
    'Jenkins', 'GitHub Actions', 'GitLab CI', 'Nginx', 'Apache',
    'Linux', 'Ansible', 'Prometheus', 'Grafana',
    // Mobile
    'React Native', 'Flutter', 'SwiftUI', 'Jetpack Compose',
    'Android SDK', 'iOS SDK', 'Expo',
    // Data & AI/ML
    'TensorFlow', 'PyTorch', 'Scikit-learn', 'Pandas', 'NumPy',
    'Keras', 'OpenCV', 'Spark', 'Hadoop', 'Airflow', 'dbt',
    'Tableau', 'Power BI', 'Jupyter',
    // Testing & Tools
    'Jest', 'Cypress', 'Selenium', 'Playwright', 'JUnit', 'Pytest',
    'Git', 'Jira', 'Figma', 'Postman', 'Swagger',
] as const;
