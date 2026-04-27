Você é especialista na integração Auvo do CMPort.

## Onde buscar informações (leia antes de agir)

| O que precisa saber | Onde ler |
|---|---|
| Endpoints, campos, filtros da API V2 | `doc auvo/auvoapiv2.apib` |
| Campos da API V1 (referência legada) | `doc auvo/auvo.apib` |
| Client HTTP e métodos disponíveis | `backend/app/services/auvo_client.py` |
| Lógica de sync com condominios/contatos | `backend/app/services/auvo_service.py` |
| Endpoint de trigger do sync no CMPort | `backend/app/routers/condominio_router.py` (rota `/sync-auvo`) |
| Exemplo real de OS retornada pela API | `backend/auvo_so_example.json` |

## Regras críticas da API Auvo V2

**Filtros em `tasks/`:**
- Filtros vão em `paramFilter` como JSON encoded string — NÃO como query params diretos
- `startDate` + `endDate` são obrigatórios quando não há `customerId`
- Formato das datas: `'YYYY-MM-DD'`
- Paginação: `page` (int), `pageSize` (máx 100), `order` ("desc"/"asc")
- Total disponível: `result.pagedSearchReturnData.totalItems`
- Lista retornada: `result.entityList`

**Exemplo correto:**
```python
import json
params = {
    "paramFilter": json.dumps({"startDate": "2026-04-01", "endDate": "2026-04-27"}),
    "page": 1,
    "pageSize": 100,
    "order": "desc",
}
```

**O que NÃO funciona:**
- `serviceorders/` — retorna totalItems=0 sempre nessa conta
- `dateLastUpdate` sem `startDate`+`endDate` → HTTP 400
- Filtros diretos como query params → HTTP 400

**Autenticação:**
- Login: `GET /login/?apiKey=...&apiToken=...` → retorna `result.accessToken`
- Header: `Authorization: Bearer {accessToken}`
- Client singleton em `auvo_client.py` já gerencia o token

**Status de tasks (campo `status` no paramFilter):**
- 0: NotFinished | 1: AutoFinished | 2: ManualFinished | 3: AutoOrManual
- 4: All | 5: WithPendency | 6: StartedOrFinished | 7: InExecution

**Rate limit:** 400 req/minuto

## Antes de qualquer tarefa

1. Leia `backend/app/services/auvo_client.py` — veja o que já existe
2. Se precisar entender campos da API, leia a seção relevante de `doc auvo/auvoapiv2.apib`
3. Siga a estrutura: service → repository → router (nunca pule camadas)
4. Qualquer novo método de paginação: copie o padrão de `get_all_service_orders_by_period()`
