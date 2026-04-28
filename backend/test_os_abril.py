"""
Testa todas as formas documentadas de listar tasks/OSs na API Auvo V2.
A chave é que os filtros vão em `paramFilter` como JSON encoded, não como query params diretos.
"""
import sys
import os
import json
import requests
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.services.auvo_client import auvo_client

BASE = auvo_client.BASE_URL

def req(endpoint, params):
    url = f"{BASE}/{endpoint}"
    headers = auvo_client._get_headers()
    try:
        r = requests.get(url, headers=headers, params=params, timeout=30)
        print(f"  → HTTP {r.status_code}  URL: {r.url}")
        if r.status_code == 200:
            data = r.json()
            lista = data.get("result", {}).get("entityList", [])
            total = data.get("result", {}).get("pagedSearchReturnData", {}).get("totalItems", "?")
            print(f"  → totalItems={total}  retornou={len(lista)}")
            return lista, total
        else:
            txt = r.text[:300]
            print(f"  → Erro: {txt}")
            return [], 0
    except Exception as e:
        print(f"  → Exceção: {e}")
        return [], 0


def testar(titulo, endpoint, params):
    print(f"\n{'='*60}")
    print(f"TESTE: {titulo}")
    print(f"  endpoint: {endpoint}")
    print(f"  params: {json.dumps(params, ensure_ascii=False)}")
    lista, total = req(endpoint, params)
    if lista:
        print(f"  ✅ SUCESSO — {total} registros disponíveis")
        for o in lista[:3]:
            tid = o.get("taskID") or o.get("taskId") or o.get("id")
            cliente = o.get("customerDescription") or o.get("customer") or ""
            data_os = (o.get("taskDate") or "")[:10]
            print(f"     id={tid}  cliente={cliente[:40]}  data={data_os}")
    else:
        print(f"  ❌ Sem resultado")
    return lista, total


def main():
    hoje = date.today()
    # Mês atual (abril)
    abril_ini = hoje.replace(day=1).isoformat()
    abril_fim = hoje.isoformat()
    # Mês passado (março) — para dados históricos
    marco_ini = "2026-03-01"
    marco_fim = "2026-03-31"
    # Últimos 90 dias
    ini_90 = (hoje - timedelta(days=90)).isoformat()

    print(f"Período atual : {abril_ini} a {abril_fim}")
    print(f"Período antigo: {marco_ini} a {marco_fim}")

    # ── 1. paramFilter JSON com startDate/endDate (abril) ──────────────────────
    testar(
        "paramFilter JSON: startDate+endDate (abril)",
        "tasks/",
        {
            "paramFilter": json.dumps({"startDate": abril_ini, "endDate": abril_fim}),
            "page": 1, "pageSize": 10, "order": "desc",
        },
    )

    # ── 2. paramFilter JSON com startDate/endDate (março) ──────────────────────
    testar(
        "paramFilter JSON: startDate+endDate (março)",
        "tasks/",
        {
            "paramFilter": json.dumps({"startDate": marco_ini, "endDate": marco_fim}),
            "page": 1, "pageSize": 10, "order": "desc",
        },
    )

    # ── 3. paramFilter JSON com dateLastUpdate (últimos 90 dias) ───────────────
    testar(
        "paramFilter JSON: dateLastUpdate (90 dias)",
        "tasks/",
        {
            "paramFilter": json.dumps({"dateLastUpdate": ini_90}),
            "page": 1, "pageSize": 10, "order": "desc",
        },
    )

    # ── 4. paramFilter JSON: status=4 (All) sem filtro de data ─────────────────
    testar(
        "paramFilter JSON: status=4 (All tasks, sem data)",
        "tasks/",
        {
            "paramFilter": json.dumps({"status": 4}),
            "page": 1, "pageSize": 10, "order": "desc",
        },
    )

    # ── 5. paramFilter JSON: finalizadas (status=3) abril ──────────────────────
    testar(
        "paramFilter JSON: status=3 finalizadas (abril)",
        "tasks/",
        {
            "paramFilter": json.dumps({"startDate": abril_ini, "endDate": abril_fim, "status": 3}),
            "page": 1, "pageSize": 10, "order": "desc",
        },
    )

    # ── 6. Sem paramFilter, só page/pageSize (sem filtro algum) ────────────────
    testar(
        "Sem filtro (page/pageSize apenas)",
        "tasks/",
        {"page": 1, "pageSize": 10, "order": "desc"},
    )

    # ── 7. serviceorders com paramFilter JSON ──────────────────────────────────
    testar(
        "serviceorders/ com paramFilter startDate+endDate (março)",
        "serviceorders/",
        {
            "paramFilter": json.dumps({"startDate": marco_ini, "endDate": marco_fim}),
            "page": 1, "pageSize": 10, "order": 0,
        },
    )

    # ── 8. serviceorders sem filtro ────────────────────────────────────────────
    testar(
        "serviceorders/ sem filtro",
        "serviceorders/",
        {"page": 1, "pageSize": 10, "order": 0},
    )

    print(f"\n{'='*60}")
    print("Testes concluídos.")


if __name__ == "__main__":
    main()
