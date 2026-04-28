import sys
import os
import requests
import json
from datetime import datetime, timedelta

# Adiciona o diretório atual ao sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from app.services.auvo_client import auvo_client

def test_quotations():
    # Período de teste: últimos 90 dias
    date_end = datetime.now().strftime('%Y-%m-%d')
    date_start = (datetime.now() - timedelta(days=90)).strftime('%Y-%m-%d')
    
    url = f"{auvo_client.BASE_URL}/quotations/"
    headers = auvo_client._get_headers()
    
    # Testando com os parâmetros corretos do V2
    param_filter = {
        "requestStartDate": date_start,
        "requestEndDate": date_end
    }
    
    params = {
        "paramFilter": json.dumps(param_filter),
        "page": 1,
        "pageSize": 5,
        "order": "desc"
    }
    
    print(f"Testando: {url}")
    print(f"Params: {params}")
    
    try:
        response = requests.get(url, headers=headers, params=params, timeout=15)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("SUCESSO!")
            entity_list = data.get("result", {}).get("entityList", [])
            print(f"Encontrados: {len(entity_list)} orçamentos.")
            if entity_list:
                print("Primeiro item:")
                print(json.dumps(entity_list[0], indent=2, ensure_ascii=False)[:1000])
                
                # Testar também o GET singular
                public_id = entity_list[0].get("publicId")
                if public_id:
                    print(f"\nTestando GET singular para ID {public_id}...")
                    url_single = f"{auvo_client.BASE_URL}/quotations/{public_id}"
                    resp_single = requests.get(url_single, headers=headers, timeout=15)
                    print(f"Status GET singular: {resp_single.status_code}")
                    if resp_single.status_code == 200:
                        print("Detalhe carregado com sucesso.")
        else:
            print(f"FALHA: {response.text}")
    except Exception as e:
        print(f"Erro: {str(e)}")

if __name__ == "__main__":
    test_quotations()
