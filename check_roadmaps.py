import requests

roles = [
    'frontend', 'backend', 'full-stack', 'devops', 'devsecops', 'data-analyst', 
    'ai-engineer', 'ai-data-scientist', 'data-engineer', 'android', 'machine-learning', 
    'postgresql', 'ios', 'blockchain', 'qa', 'software-architect', 'cyber-security', 
    'ux-design', 'technical-writer', 'game-developer', 'server-side-game-developer', 
    'mlops', 'product-manager', 'engineering-manager', 'developer-relations', 'bi-analyst'
]

# Adjust slugs based on common github names if needed
slug_map = {
    'machine-learning': 'ml', # Check this
    'devsecops': 'devops? no', # maybe dev-sec-ops
}

def check_roles():
    base_url = "https://raw.githubusercontent.com/kamranahmedse/developer-roadmap/master/src/data/roadmaps"
    
    found = []
    missing = []
    
    for role in roles:
        # Try exact match first
        url = f"{base_url}/{role}/{role}.json"
        try:
            r = requests.head(url)
            if r.status_code == 200:
                print(f"[FOUND] {role}")
                found.append(role)
                continue
        except:
            pass
            
        # Try alternate slug
        alt = slug_map.get(role, role.replace(' ', '-'))
        if alt != role:
            url = f"{base_url}/{alt}/{alt}.json"
            try:
                r = requests.head(url)
                if r.status_code == 200:
                    print(f"[FOUND] {role} (as {alt})")
                    found.append(alt)
                    continue
            except:
                pass
        
        print(f"[MISSING] {role}")
        missing.append(role)
        
    print(f"\nFound {len(found)}/{len(roles)}")
    print("Missing:", missing)

if __name__ == "__main__":
    check_roles()
