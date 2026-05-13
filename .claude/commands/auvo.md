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

---

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

---

## Produtos e Orçamentos

**Sync de produtos:**
`POST /produtos/sync` — sincroniza catálogo via `auvo_client.get_all_products()`

**Sync de orçamentos:**
`POST /orcamentos/sync?date_start=&date_end=`
Salva: `orcamentos` + `orcamento_itens` + `orcamento_task_ids`

**Busca de orçamentos por serviço:**
```
GET /orcamentos/por-servico/{servico_id}
  → OrcamentoTaskId.task_id == int(servico.numero_os)
  → null se não encontrado

GET /orcamentos/candidatos/{servico_id}
  → orçamentos do mesmo condomínio nos 90 dias antes do serviço
  → usado como fallback quando por-servico retorna null
```

**Chave de vínculo Orçamento ↔ OS:**
```
manutencoes_assistencias.numero_os  (String)
== ordens_servico.task_id           (Int)
== orcamento_task_ids.task_id       (BigInt)
```
Todos são o Auvo task ID. Um orçamento pode ter N task_ids; uma OS liga a 1 orçamento.

---

## Antes de qualquer tarefa

1. Leia `backend/app/services/auvo_client.py` — veja o que já existe
2. Se precisar entender campos da API, leia a seção relevante de `doc auvo/auvoapiv2.apib`
3. Siga a estrutura: service → repository → router (nunca pule camadas)
4. Qualquer novo método de paginação: copie o padrão de `get_all_service_orders_by_period()`
