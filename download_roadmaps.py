import requests
import os
import json

# The list of roles requested by the user
roles = [
    'frontend', 'backend', 'full-stack', 'devops', 'devsecops', 'data-analyst', 
    'ai-engineer', 'ai-data-scientist', 'data-engineer', 'android', 'machine-learning', 
    'postgresql', 'ios', 'blockchain', 'qa', 'software-architect', 'cyber-security', 
    'ux-design', 'technical-writer', 'game-developer', 'server-side-game-developer', 
    'mlops', 'product-manager', 'engineering-manager', 'developer-relations', 'bi-analyst'
]

# GitHub limits raw requests, but we are fetching only 26 small text files.
# Base URL for the raw JSON files
BASE_URL = "https://raw.githubusercontent.com/kamranahmedse/developer-roadmap/master/src/data/roadmaps"

# Mappings for where the slug might differ from the requested name
# Based on check_roadmaps.py results + manual intuition
SLUG_MAP = {
    'machine-learning': 'machine-learning',
    'devsecops': 'devsecops',
    'postgresql': 'postgresql-dba',
    'server-side-game-developer': 'server-side-game-developer',
    'developer-relations': 'devrel',
}

OUTPUT_DIR = "raw_roadmaps"

def download_roadmaps():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    for role in roles:
        slug = SLUG_MAP.get(role, role)
        
        # Try primary slug
        url = f"{BASE_URL}/{slug}/{slug}.json"
        
        print(f"Downloading {role} from {url}...")
        try:
            r = requests.get(url)
            if r.status_code == 200:
                with open(f"{OUTPUT_DIR}/{role}.json", "w", encoding="utf-8") as f:
                    f.write(r.text)
                print(f"✅ Saved {role}.json")
                continue
            else:
                print(f"⚠️ Failed to fetch {url} (Status: {r.status_code})")
                
                # Try fallback: maybe just the folder name differs?
                # or maybe it's in a different path structure?
                # We'll validte the failures manually if any.
        except Exception as e:
            print(f"❌ Error downloading {role}: {e}")

if __name__ == "__main__":
    download_roadmaps()
