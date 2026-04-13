import json
import os
import glob
from collections import defaultdict, deque

INPUT_DIR = "raw_roadmaps"
OUTPUT_DIR = "processed_templates"

# Default benchmark hours
SECTION_HOURS = 0
TOPIC_HOURS = 8
SUBTOPIC_HOURS = 2

def sanitize_text(text):
    if not text: return "Untitled"
    return text.strip().replace('"', "'")

def build_graph(nodes, edges):
    adj = defaultdict(list)
    in_degree = defaultdict(int)
    node_map = {n['id']: n for n in nodes}
    
    for edge in edges:
        src = edge['source']
        tgt = edge['target']
        adj[src].append(tgt)
        in_degree[tgt] += 1
        if src not in in_degree: in_degree[src] = 0
            
    return adj, in_degree, node_map

def topological_sort_with_y(nodes, edges):
    """
    Topological sort that respects Y-coordinate ordering for parallel nodes.
    """
    adj, in_degree, node_map = build_graph(nodes, edges)
    
    # Priority Queue or just sorting the available nodes by Y
    # Since standard topo sort doesn't guarantee order of parallel nodes, 
    # we'll use a modified Kahn's algorithm where we pick the node with smallest Y from the queue.
    
    queue = [n['id'] for n in nodes if in_degree[n['id']] == 0]
    sorted_nodes = []
    
    while queue:
        # Sort queue by Y coordinate to process top-down
        queue.sort(key=lambda nid: node_map[nid]['position']['y'])
        
        u = queue.pop(0)
        sorted_nodes.append(node_map[u])
        
        for v in adj[u]:
            in_degree[v] -= 1
            if in_degree[v] == 0:
                queue.append(v)
                
    # Fallback: if cycle exists (graph not DAG), some nodes might be missing.
    # Append remaining nodes sorted by Y.
    seen_ids = set(n['id'] for n in sorted_nodes)
    remaining = [n for n in nodes if n['id'] not in seen_ids]
    remaining.sort(key=lambda n: n['position']['y'])
    sorted_nodes.extend(remaining)
    
    return sorted_nodes

def convert_roadmap(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    nodes = data.get('nodes', [])
    edges = data.get('edges', [])
    
    # Filter only relevant node types
    relevant_types = {'title', 'topic', 'subtopic'}
    filtered_nodes = [n for n in nodes if n.get('type') in relevant_types]
    
    # Filter edges to only connect relevant nodes
    valid_ids = set(n['id'] for n in filtered_nodes)
    filtered_edges = [
        e for e in edges 
        if e.get('source') in valid_ids and e.get('target') in valid_ids
    ]
    
    if not filtered_nodes:
        print(f"Skipping {filepath}: no relevant nodes found")
        return None

    sorted_nodes = topological_sort_with_y(filtered_nodes, filtered_edges)
    
    # Grouping Logic
    sections = []
    current_section = None
    
    # Initial section if no title starts
    if sorted_nodes[0]['type'] != 'title':
        current_section = {
            "id": "intro",
            "name": "Introduction",
            "topics": []
        }
        sections.append(current_section)
        
    for node in sorted_nodes:
        n_type = node.get('type')
        label = sanitize_text(node.get('data', {}).get('label', ''))
        
        if n_type == 'title':
            # Ignore title nodes for section creation (usually just 'Frontend' etc)
            pass
            
        elif n_type == 'topic':
            # Check previous section before starting new one
            if current_section and not current_section['topics']:
                 # Add default topic if empty
                 current_section['topics'].append({
                    "name": f"Learn {current_section['name']}",
                    "benchmarkHours": TOPIC_HOURS,
                    "difficulty": 3,
                    "children": []
                 })

            # Start new section from this main Topic
            # Generate ID from name
            section_id = label.lower().replace(' ', '-').replace('&', 'and')
            current_section = {
                "id": section_id,
                "name": label,
                "topics": []
            }
            sections.append(current_section)
                
        elif n_type == 'subtopic':
            # Add as Topic to current section
            # If no section exists yet, create a default "Basics" section
            if not current_section:
                 current_section = {
                    "id": "intro",
                    "name": "Introduction",
                    "topics": []
                }
                 sections.append(current_section)
                 
            topic = {
                "name": label,
                "benchmarkHours": SUBTOPIC_HOURS,
                "difficulty": 2,
                "children": []
            }
            current_section['topics'].append(topic)
            
    # Final check for last section
    if current_section and not current_section['topics']:
         current_section['topics'].append({
            "name": f"Learn {current_section['name']}",
            "benchmarkHours": TOPIC_HOURS,
            "difficulty": 3,
            "children": []
         })
                
    return sections

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    for filepath in glob.glob(os.path.join(INPUT_DIR, "*.json")):
        print(f"Converting {filepath}...")
        role_name = os.path.basename(filepath).replace('.json', '')
        sections = convert_roadmap(filepath)
        
        if sections:
            output_data = {
                "id": role_name,
                "name": role_name.replace('-', ' ').title(),
                "description": f"Detailed roadmap for {role_name.replace('-', ' ')}.",
                "category": "role",
                "estimatedHours": sum(len(s['topics']) * 10 for s in sections), # rough estimate
                "sections": sections
            }
            
            with open(os.path.join(OUTPUT_DIR, f"{role_name}.json"), 'w', encoding='utf-8') as f:
                json.dump(output_data, f, indent=2)
                
    print("Conversion complete.")

if __name__ == "__main__":
    main()
