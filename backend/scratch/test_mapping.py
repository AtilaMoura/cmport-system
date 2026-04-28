import sys
import os
import json
from datetime import datetime, timedelta

# Adiciona o diretório atual ao sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from app.services.auvo_client import auvo_client

def test_mapping():
    # Período de teste: últimos 30 dias
    date_end = datetime.now().strftime('%Y-%m-%d')
    date_start = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    
    print(f"Buscando orçamentos de {date_start} até {date_end}...")
    orcamentos = auvo_client.get_all_quotations_by_period(date_start, date_end)
    
    if not orcamentos:
        print("Nenhum orçamento encontrado no período.")
        return

    print(f"Encontrados {len(orcamentos)} orçamentos.")
    
    # Pegar o primeiro para testar o mapeamento de detalhe
    brief = orcamentos[0]
    public_id = brief.get("publicId")
    print(f"\nCarregando detalhe do orçamento {public_id}...")
    o = auvo_client.get_quotation(public_id)
    
    if not o:
        print("Erro ao carregar detalhe.")
        return

    # Simular o mapeamento que está no OrcamentoService
    summary = o.get("summary", {})
    current_stage = o.get("currentStage", {})
    discount = summary.get("discount", {})
    
    mapped_data = {
        "auvo_public_id": o.get("publicId"),
        "customer_name": o.get("customerName"),
        "current_stage_description": current_stage.get("description"),
        "is_cancelled": current_stage.get("isCancelled", False),
        "total_products": summary.get("totalProducts", 0),
        "total_services": summary.get("totalServices", 0),
        "net_total_value": summary.get("netTotalValue", 0),
    }
    
    print("\nMAPEAMENTO DE SUCESSO (SIMULADO):")
    print(json.dumps(mapped_data, indent=2, ensure_ascii=False))
    
    # Testar mapeamento de itens
    print("\nITENS (PRODUTOS):")
    for p in o.get("products", []):
        print(f"- {p.get('productId')}: {p.get('name')} | Qtd: {p.get('amount')} | Unit: {p.get('unitaryValue')}")

if __name__ == "__main__":
    test_mapping()
