with open('backend/app/assets/termo_garantia_template.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()
start = 0
for i, l in enumerate(lines):
    if 'class="doc-layer"' in l:
        start = i
print(''.join(lines[start:start+50]))
