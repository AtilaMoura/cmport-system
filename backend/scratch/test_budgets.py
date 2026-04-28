import sys
import os
import requests
import json

# Adiciona o diretório atual ao sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from app.services.auvo_client import auvo_client

def test_endpoint(endpoint):
    url = f"{auvo_client.BASE_URL}/{endpoint}"
    headers = auvo_client._get_headers()
    print(f"Testando: {url}")
    try:
        # Tenta com e sem paramFilter
        response = requests.get(url, headers=headers, params={"pageSize": 1}, timeout=15)
        print(f"  Status: {response.status_code}")
        if response.status_code == 200:
            return True, response.json()
        else:
            return False, response.text[:200]
    except Exception as e:
        return False, str(e)

def main():
    endpoints = [
        "budgets",
        "budgets/",
        "proposals",
        "proposals/",
        "commercial-proposals",
        "commercial-proposals/",
        "commercialProposals",
        "commercialProposals/",
        "quotations",
        "quotations/",
    ]
    
    for ep in endpoints:
        success, result = test_endpoint(ep)
        if success:
            print(f"  [SUCCESS] em '{ep}'!")
            print(f"  Amostra: {str(result)[:200]}...")
        else:
            print(f"  [FAILURE] em '{ep}': {result}")
        print("-" * 40)

if __name__ == "__main__":
    main()
