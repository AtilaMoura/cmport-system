import sys
import os
import json
import requests
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.services.auvo_client import auvo_client

def raw_request(endpoint, params=None):
    url = f"{auvo_client.BASE_URL}/{endpoint}"
    headers = auvo_client._get_headers()
    try:
        r = requests.get(url, headers=headers, params=params, timeout=30)
        print(f"  Status: {r.status_code}")
        return r.status_code, r.json()
    except Exception as e:
        print(f"  Erro: {e}")
        return None, None

def main():
    hoje = date.today()
    inicio = (hoje - timedelta(days=90)).isoformat()
    fim = hoje.isoformat()

    print("=" * 60)
    print(f"Periodo: {inicio} a {fim}")
    print("=" * 60)

    tentativas = [
        ("tasks/",          {"startDate": inicio, "endDate": fim, "pageSize": 5}),
        ("tasks/",          {"dateStart": inicio, "dateEnd": fim, "pageSize": 5}),
        ("serviceOrders/",  {"startDate": inicio, "endDate": fim, "pageSize": 5}),
        ("serviceOrders/",  {"dateStart": inicio, "dateEnd": fim, "pageSize": 5}),
        ("serviceOrders/",  {"pageSize": 5}),
        ("tasks/",          {"pageSize": 5}),
    ]

    found_orders = []
    for endpoint, params in tentativas:
        print(f"\nTestando '{endpoint}' com {params} ...")
        status, data = raw_request(endpoint, params)
        if status == 200 and data and "result" in data:
            lista = data["result"].get("entityList", [])
            total = data["result"].get("pagedSearchReturnData", {}).get("totalItems", "?")
            print(f"  OK - totalItems={total}, retornou {len(lista)} registros")
            if lista:
                found_orders = lista
                print(f"  Primeiro ID: {lista[0].get('id') or lista[0].get('taskId')}")
                break
            else:
                print("  Lista vazia.")
        elif status:
            print(f"  Falhou: {json.dumps(data, ensure_ascii=False)[:300]}")

    if not found_orders:
        print("\nNenhuma ordem encontrada.")
        return

    first = found_orders[0]
    first_id = first.get("id") or first.get("taskId")
    print(f"\nBuscando detalhes da ordem {first_id} ...")

    for ep in [f"tasks/{first_id}", f"serviceOrders/{first_id}"]:
        status, data = raw_request(ep)
        if status == 200 and data:
            detail = data.get("result", data)
            print("\nESTRUTURA COMPLETA DA ORDEM:")
            print(json.dumps(detail, indent=2, ensure_ascii=False))
            with open("auvo_so_example.json", "w", encoding="utf-8") as f:
                json.dump(detail, f, indent=2, ensure_ascii=False)
            print("\nSalvo em auvo_so_example.json")
            return

    print("\nNao foi possivel buscar detalhes. Exibindo dado da listagem:")
    print(json.dumps(first, indent=2, ensure_ascii=False))
    with open("auvo_so_example.json", "w", encoding="utf-8") as f:
        json.dump(first, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    main()
