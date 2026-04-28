import requests
import json
from app.services.auvo_client import auvo_client

def discover_v1():
    v1_url = "https://api.auvo.com.br/v1.0"
    endpoints = ["budgets", "quotes", "proposals", "orcamentos"]
    params = {"apiKey": auvo_client.api_key, "apiToken": auvo_client.api_token}
    
    for ep in endpoints:
        url = f"{v1_url}/{ep}"
        try:
            resp = requests.get(url, params=params, timeout=10)
            print(f"V1 Endpoint: {ep} -> Status: {resp.status_code}")
            if resp.status_code == 200:
                print(f"  [OK] Sucesso em V1 {ep}")
                print(json.dumps(resp.json(), indent=2, ensure_ascii=False)[:500])
        except Exception as e:
            print(f"V1 Endpoint: {ep} -> Erro: {e}")

if __name__ == "__main__":
    discover_v1()
