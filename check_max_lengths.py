import json
import os

INPUT_DIR = "raw_roadmaps"
max_len = 0
max_label = ""
node_type = ""
file_origin = ""

for f in os.listdir(INPUT_DIR):
    if f.endswith('.json'):
        with open(os.path.join(INPUT_DIR, f), encoding='utf-8') as j:
            try:
                data = json.load(j)
                for n in data.get('nodes', []):
                    label = n.get('data', {}).get('label', '')
                    if len(label) > max_len:
                        max_len = len(label)
                        max_label = label
                        node_type = n.get('type')
                        file_origin = f
            except:
                pass

print(f"Max length found: {max_len}")
print(f"File: {file_origin}")
print(f"Type: {node_type}")
print(f"Label: {max_label}")
