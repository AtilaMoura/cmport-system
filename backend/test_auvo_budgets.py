import sys
import os
import json

# Adiciona o diretório atual ao sys.path
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.services.auvo_client import auvo_client

def test_budgets():
    print("Testando endpoint de orçamentos (budgets)...")
    
    # Testa listagem simples
    params = {"pageSize": 5, "order": "desc"}
    data = auvo_client._make_request("budgets/", params=params)
    
    if data:
        print("Sucesso na requisição!")
        print(json.dumps(data, indent=2, ensure_ascii=False)[:2000])
        
        # Se tiver resultado, tenta buscar um detalhe
        entity_list = data.get("result", {}).get("entityList", [])
        if entity_list:
            budget_id = entity_list[0].get("publicId")
            print(f"\nBuscando detalhe do orçamento {budget_id}...")
            detail = auvo_client.get_budget(budget_id)
            if detail:
                print("Sucesso no detalhe!")
                print(json.dumps(detail, indent=2, ensure_ascii=False)[:2000])
            else:
                print("Falha ao buscar detalhe.")
        else:
            print("\nNenhum orçamento encontrado na listagem simples.")
    else:
        print("Falha na requisição budgets/.")

if __name__ == "__main__":
    test_budgets()
