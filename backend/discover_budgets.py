import requests
import json
from app.services.auvo_client import auvo_client

def discover():
    endpoints = ["budgets", "quotes", "proposals", "commercialProposals", "commercial-proposals", "orcamentos", "serviceOrders", "tasks"]
    headers = auvo_client._get_headers()
    
    for ep in endpoints:
        url = f"{auvo_client.BASE_URL}/{ep}"
        try:
            resp = requests.get(url, headers=headers, params={"pageSize": 10}, timeout=10)
            print(f"Endpoint: {ep} -> Status: {resp.status_code}")
            if resp.status_code == 200:
                print(f"  [OK] Sucesso em {ep}")
        except Exception as e:
            print(f"Endpoint: {ep} -> Erro: {e}")

if __name__ == "__main__":
    discover()
