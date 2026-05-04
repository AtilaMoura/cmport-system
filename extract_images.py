import re
import base64
import os

html_path = 'backend/app/assets/termo_garantia_template.html'
html = open(html_path, 'r', encoding='utf-8').read()

m = re.search(r'"data:image/jpeg;base64,([^"]+)"', html)
if m:
    with open('backend/app/assets/timbrado.png', 'wb') as f:
        f.write(base64.b64decode(m.group(1)))
    print("timbrado.png saved")
else:
    print("No BG found")

m3 = re.search(r'const SIG_B64\s*=\s*[\'"]([^\'"]+)[\'"]', html)
if m3:
    with open('backend/app/assets/assinatura_andre.png', 'wb') as f:
        f.write(base64.b64decode(m3.group(1)))
    print("assinatura_andre.png saved")
else:
    print("No SIG found")
