import sys
import os
import requests

# Adiciona o diretório atual ao sys.path
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.services.auvo_client import auvo_client

def test_endpoint(endpoint):
    url = f"{auvo_client.BASE_URL}/{endpoint}"
    headers = auvo_client._get_headers()
    print(f"Testando: {url}")
    try:
        response = requests.get(url, headers=headers, params={"pageSize": 1}, timeout=10)
        print(f"  Status: {response.status_code}")
        if response.status_code == 200:
            return True, response.json()
        else:
            return False, response.text[:200]
    except Exception as e:
        return False, str(e)

def main():
    endpoints = [
        "serviceOrders",
        "serviceOrders/",
        "tasks",
        "tasks/",
        "service-orders",
        "service_orders",
        "customers", # Para verificar se o token está ok
    ]
    
    for ep in endpoints:
        success, result = test_endpoint(ep)
        if success:
            print(f"  ✅ SUCESSO em '{ep}'!")
            if ep != "customers":
                import json
                print("\nAMOSTRA DE RESULTADO:")
                print(json.dumps(result, indent=2, ensure_ascii=False)[:1000])
        else:
            print(f"  ❌ FALHA em '{ep}': {result}")
        print("-" * 40)

if __name__ == "__main__":
    main()
