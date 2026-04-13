import json
import os
import glob

INPUT_DIR = "processed_templates"
OUTPUT_FILE = "frontend/src/data/roadmap-templates/enriched-roadmaps.ts"

def generate_ts():
    roadmaps = []
    
    # Map new IDs to old ones for backward compatibility
    id_map = {
        'frontend': 'frontend-developer',
        'backend': 'backend-developer',
        'full-stack': 'full-stack-developer',
        # others seem to match or are new
    }

    # Read all JSON files
    for filepath in glob.glob(os.path.join(INPUT_DIR, "*.json")):
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            # Remap ID
            if data['id'] in id_map:
                data['id'] = id_map[data['id']]
                
            roadmaps.append(data)
            
    # Write TS file
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write('import { RoadmapTemplate } from "@/lib/types";\n\n')
        f.write('export const enrichedRoadmaps: RoadmapTemplate[] = ')
        f.write(json.dumps(roadmaps, indent=2))
        f.write(';\n')
        
    print(f"Generated {OUTPUT_FILE} with {len(roadmaps)} roadmaps.")

if __name__ == "__main__":
    generate_ts()
