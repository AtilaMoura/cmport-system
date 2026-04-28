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
    try:
        response = requests.get(url, headers=headers, params={"pageSize": 1}, timeout=10)
        return response.status_code, response.text[:500]
    except Exception as e:
        return 0, str(e)

def main():
    endpoints = [
        "serviceOrders",
        "serviceOrders/",
        "tasks",
        "tasks/",
        "customers",
    ]
    
    with open("discovery_log.txt", "w", encoding="utf-8") as f:
        f.write("RELATÓRIO DE DESCOBERTA AUVO\n")
        f.write("="*30 + "\n")
        
        for ep in endpoints:
            status, text = test_endpoint(ep)
            f.write(f"Endpoint: {ep}\n")
            f.write(f"Status: {status}\n")
            f.write(f"Response: {text}\n")
            f.write("-" * 30 + "\n")
            
    print("Descoberta concluída. Resultados salvos em discovery_log.txt")

if __name__ == "__main__":
    main()
