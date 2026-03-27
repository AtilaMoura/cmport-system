# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CMPort is a management system for condominios (residential condominiums) in Brazil. It consists of:
- **Backend**: FastAPI + SQLAlchemy + MySQL (PyMySQL)
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4

## Running the Project

### Prerequisites
- MySQL running via Docker: `docker-compose up -d db`
- Backend `.env` file at `backend/.env` (see variables below)
- SSL certificates for Banco Inter at `backend/app/auth/certificado.crt` and `backend/app/auth/key.key`

### Backend
```bash
cd backend
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
API docs: `http://localhost:8000/docs`

### Frontend
```bash
cd cmport-front
npm run dev
```

### Lint (frontend)
```bash
cd cmport-front
npm run lint
npx tsc --noEmit   # TypeScript check — must stay at zero errors
```

## Environment Variables (`backend/.env`)
```
# Database
DB_HOST=db
DB_PORT=3306
DB_NAME=cmport_gerenciamento
DB_USER=root
DB_PASSWORD=...

# Auvo (external field service platform)
AUVO_API_KEY=...
AUVO_API_TOKEN=...

# Banco Inter API
INTER_CLIENT_ID=...
INTER_CLIENT_SECRET=...
INTER_CONTA_CORRENTE=...        # bank account number (x-conta-corrente header)
INTER_CERT_PATH=app/auth/       # folder with certificado.crt + key.key
INTER_ENV=production            # "sandbox" or "production"

# App
ENV=development
```

## Deploy em Produção (VPS Hostinger)

### Servidor
- **IP**: `168.231.96.184`
- **Usuário**: `root`
- **Caminho do projeto**: `/root/cmport-system`
- **Acesso**: SSH com senha (usar `paramiko` via Python quando automatizar)

### Infraestrutura
Quatro containers Docker gerenciados pelo `docker-compose.prod.yml`:
- `cmport_nginx` — Nginx proxy reverso (porta 80)
- `cmport_front` — Next.js (porta 3000 interna)
- `cmport_api` — FastAPI (porta 8000 interna)
- `cmport_db` — MySQL 8.0 (volume persistente `db_data`)

Roteamento do Nginx:
- `/` → `frontend:3000` (Next.js)
- `/api/v1/` → `backend:8000/api/v1/` (FastAPI direto, sem passar pelo Next.js)

### Como fazer deploy

O projeto **não está no GitHub**. O deploy é feito copiando arquivos diretamente via SFTP + restart do container.

**Enviar arquivos alterados (Python/paramiko):**
```python
import paramiko
from pathlib import Path

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("168.231.96.184", username="root", password="...", timeout=15)

sftp = client.open_sftp()
sftp.put("caminho/local/arquivo.py", "/root/cmport-system/caminho/remoto/arquivo.py")
sftp.close()
client.close()
```

**Reiniciar apenas o backend (sem rebuild):**
```bash
cd /root/cmport-system
docker compose -f docker-compose.prod.yml restart backend
```

**Rebuild completo (quando Dockerfile ou dependências mudam):**
```bash
cd /root/cmport-system
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f
```

**Ver logs:**
```bash
docker logs cmport_api --tail=50
docker logs cmport_front --tail=50
```

### Variáveis de produção
Arquivo `.env.production` na raiz do projeto (não commitado no git). Contém `ENV=production`, credenciais do banco, Inter, Auvo e JWT.

### Proteção do `/api/v1/dev`
Os endpoints `/dev/*` são protegidos **apenas por role** (`require_dev` — role=DEV). A verificação de `ENV=development` foi removida — funciona em produção para o usuário DEV.

## Architecture

### Backend Structure (flat layered — NOT domains-based)
```
backend/app/
  models/       — SQLAlchemy ORM models (8 models)
  repositories/ — DB access layer (queries, CRUD)
  services/     — Business logic (calls repositories, calls external APIs)
  routers/      — FastAPI route handlers (calls services)
  schemas/      — Pydantic request/response models
  core/         — config.py (DB connection string), database.py (SessionLocal)
  auth/         — SSL certificates for Banco Inter (certificado.crt, key.key)
```

Tables are auto-created on startup via `Base.metadata.create_all(bind=engine)` in `main.py`.
`ConfiguracaoImpostosServico` is seeded on startup if empty (default tax rates).

### API Routes

| Prefix | Router File | Purpose |
|---|---|---|
| `/api/v1/condominios` | `condominio_router.py` | CRUD + Auvo sync + search |
| `/api/v1/enderecos` | `endereco_router.py` | 1:1 address per condominio |
| `/api/v1/contatos` | `contato_router.py` | N contacts per condominio |
| `/api/v1/servicos` | `servico_router.py` | Maintenance/assistance records |
| `/api/v1/notas-fiscais` | `nota_fiscal_router.py` | Import XML/ZIP, CRUD, Excel export, revalidation |
| `/api/v1/boletos` | `boleto_router.py` | Generate/sync boletos, Inter API, PDF, payments |
| `/api/v1/dashboard` | `dashboard_router.py` | Aggregate stats and Excel export |
| `/api/v1/auditoria` | `auditoria_router.py` | Deletion audit trail |
| `/api/v1/dev` | `dev_router.py` | Development/testing utilities |

### Database Models & Relationships

```
Condominio (1) ——— (1) Endereco               [cascade delete]
Condominio (1) ——— (N) Contato                [cascade delete]
Condominio (1) ——— (N) ManutencaoAssistencia  [cascade delete]
Condominio (1) ——— (N) NotaFiscal             [FK condominio_id, nullable]

ManutencaoAssistencia (N) ——— (1) NotaFiscal  [FK nota_fiscal_id, nullable]

NotaFiscal (1) ——— (N) Boleto                 [FK nota_fiscal_id, not null]

ConfiguracaoImpostosServico — standalone config table (seeded on startup)
RegistroExclusao            — audit table (JSON snapshot of deleted records)
```

### All Models

| Model | Table | Key Fields |
|---|---|---|
| `Condominio` | `condominios` | nome, cnpj, razao_social |
| `Endereco` | `enderecos` | condominio_id, rua, numero, bairro, cidade, estado, cep |
| `Contato` | `contatos` | condominio_id, nome, email, telefone, principal |
| `ManutencaoAssistencia` | `manutencoes_assistencias` | condominio_id, nota_fiscal_id, tipo, numero_os, data_servico, descricao |
| `NotaFiscal` | `notas_fiscais` | see section below |
| `Boleto` | `boletos` | see section below |
| `ConfiguracaoImpostosServico` | `configuracao_impostos_servico` | tipo_servico, pct_pis, pct_cofins, pct_inss, pct_csll, ativo |
| `RegistroExclusao` | `registros_exclusoes` | entidade, entidade_id, dados_json, excluido_em |

### NotaFiscal Model Fields
- `id`, `condominio_id` (nullable FK), `numero_nota` (unique)
- `tipo` (enum: MANUTENCAO, ASSISTENCIA, OUTROS)
- `status` (enum: AUTORIZADA, CANCELADA, DESCONHECIDO)
- `parcelas` (int), `valor` (float)
- `data_vencimento`, `data_pagamento`
- `cliente_nome`, `observacao`, `descricao_servico`
- `valor_boleto_parcela` (float, nullable) — per-parcel boleto amount override
- `parcelas_json` (JSON, nullable) — list of `{parcela, valor, data}` extracted from XML description
- `xml_original` (Text) — full original XML stored for re-parsing/revalidation
- **Tax fields from NFSe**: `iss`, `pis`, `cofins`, `inss`, `csll` (float, nullable)
- **Tax fields from NFe**: `icms`, `prev` (float, nullable) — `prev` = INSS retenção
- `alerta_impostos` (int, default 0) — 0=ok, 1=active alert (divergence detected)
- `divergencia_impostos` (JSON, nullable) — `{field: {pct, config, xml}}` per divergent tax
- `criado_em`

### Boleto Model Fields
- `id`, `nota_fiscal_id` (FK, not null)
- `numero_parcela`, `total_parcelas`
- `codigo_solicitacao` (nullable) — Inter's ID (null for manual/non-Inter boletos)
- `nosso_numero`, `seu_numero` (nullable)
- `valor_nominal`, `valor_juros`, `valor_multa`, `valor_total_recebido`
- `data_emissao`, `data_vencimento`, `data_pagamento`
- `situacao` (enum: EMABERTO, PAGO, CANCELADO, EXPIRADO, VENCIDO, BAIXADO)
- `tipo_cobranca` (enum: SIMPLES)
- `forma_pagamento` (enum: BOLETO_INTER, BOLETO_ITAU, PIX, DINHEIRO, TRANSFERENCIA, CHEQUE)
- `banco_pagamento`, `observacao`
- `criado_em`

## Key Business Logic

### Nota Fiscal Import Flow
`POST /api/v1/notas-fiscais/importar` accepts `.xml` or `.zip` files.
The service auto-detects:
- XML type: `NFSe` (municipal) or `NFe` (federal) or `EventoCancelamentoNFe`
- Invoice type: `MANUTENCAO` / `ASSISTENCIA` / `OUTROS` — from description text prefix
- Status: `AUTORIZADA` / `CANCELADA` — from XML; canceled invoices are skipped
- On import of MANUTENCAO/ASSISTENCIA nota linked to a condominio: a `ManutencaoAssistencia` record is auto-created
- Parcel data extracted from nota description text → stored in `parcelas_json`
- Tax divergence detected: compares XML taxes vs `ConfiguracaoImpostosServico` config → sets `alerta_impostos=1` if mismatch

### Tax Calculation (`boleto_service._calcular_valor_liquido()`)
- MANUTENCAO/ASSISTENCIA: `valor_liquido = valor * (1 - (pis + cofins + inss + csll) / 100)`
- OUTROS: `valor_liquido = valor` (no taxes deducted)
- Percentages sourced from `ConfiguracaoImpostosServico` table (seeded defaults below), can be overridden per request via `pct_pis`, `pct_cofins`, `pct_inss`, `pct_csll` parameters

**Default tax rates (ConfiguracaoImpostosServico seed):**
```
MANUTENCAO:  PIS 0.65%, COFINS 3.00%, INSS 11.00%, CSLL 1.00%
ASSISTENCIA: PIS 0.65%, COFINS 3.00%, INSS 11.00%, CSLL 1.00%
OUTROS:      all 0.00%
```

### Boleto Generation — 2-Step UI Flow
**Step 1 — Configuration (frontend modal)**:
- Calls `GET /boletos/config-impostos/{nota_id}` → returns `ConfigImpostosResponse`:
  `{pct_pis, pct_cofins, pct_inss, pct_csll, valor_bruto, valor_liquido, numero_os, aplicar_juros_default, alerta_impostos, divergencia_impostos}`
- User edits: tax percentages, per-parcel values, due dates, nota number, description
- Validation: sum of all parcel values must equal `valor_liquido` (no rounding; threshold 0.005)
- "Aprovar Boletos" button enabled only when validation passes

**Step 2 — Emit (frontend modal)**:
- Calls `POST /boletos/gerar-parcelas-faltantes/{nota_id}` once per parcel (individual) or for all
- Each call: `{parcelas_selecionadas: [n], valor_total_override: parcel_value * total_parcelas, data_vencimento_override: adjusted_base, pct_pis, pct_cofins, pct_inss, pct_csll, aplicar_juros: false, mensagem?}`
- The `data_vencimento_override` must be adjusted: `desired_date - 30*(parcel_num - 1) days` so backend adds offsets correctly
- User can still edit date and description in Step 2; values are locked
- "Reabrir Config" button goes back to Step 1

### Parcel Generation (`gerar_parcelas_faltantes`)
- Generates only parcelas not yet emitted (no active boleto)
- `parcelas_selecionadas: List[int]` — filter to specific parcel numbers only
- `valor_total_override` — backend divides by `nota.parcelas` → per-parcel value; to get specific per-parcel value V: pass `V * total_parcelas`
- `data_vencimento_override` = base date; backend adds `+30 * (parcel_num - 1)` days for each parcel
- `aplicar_juros: false` always sent from UI (user disabled juros feature)

### Banco Inter Integration (`inter_client.py`)
- OAuth2 client_credentials with mTLS (SSL cert required)
- Base URL: sandbox or production (controlled by `INTER_ENV`)
- Token cached with 5-min buffer before expiry
- **Functions**: `emitir_boleto(payload)`, `consultar_boleto(codigo)`, `cancelar_boleto(codigo, motivo)`, `listar_cobrancas(data_inicio, data_fim)`, `baixar_pdf(codigo)` → bytes
- `seuNumero` format: `{numero_nota[:15-len(suffix)]}-{parcela}/{total}`, max 15 chars

### Auvo Integration
`backend/app/domains/auvo/` syncs customer data from the Auvo field service API into local condominios/enderecos/contatos. Triggered via `/api/v1/condominios/sync-auvo`.

### Auditoria (Audit Trail)
Deletions call `registrar_exclusao()` from `auditoria/router.py`, storing a full JSON snapshot of the deleted record in `registros_exclusoes` before deletion.

## Frontend Structure

`cmport-front/app/` uses Next.js 16 App Router:

```
app/
  page.tsx                — Dashboard (home)
  layout.tsx              — Root layout
  condominios/
    page.tsx              — List
    novo/page.tsx         — Create
    [id]/page.tsx         — Detail
    [id]/editar/page.tsx  — Edit
  servicos/
    page.tsx              — List (includes bulk boleto generation "Gerar em Massa")
    [id]/page.tsx         — Detail + "Cobranças por Parcela" + 2-step boleto modal
  notas/
    page.tsx              — List (includes single-nota boleto generation modal)
    [id]/page.tsx         — Detail
    importar/page.tsx     — Import XML/ZIP
  boletos/
    page.tsx              — List/manage all boletos
  dev/
    page.tsx              — Development utilities
```

**Key components** in `cmport-front/components/`: `Sidebar`, `ThemeToggle`, `CondominiosList`, `FormEditarCondominio`, `FloatingActionButton`.

The frontend calls the backend at `http://localhost:8000/api/v1/` using `axios`.
Dark mode via `next-themes` with Tailwind `dark:` classes.

### Frontend State Patterns
- `ParcelaItem` interface: `{numero, valor, dataVencimento, situacaoBoleto}` — used in 2-step boleto modal to track per-parcel editable values
- `MassaItem` interface — used in "Gerar em Massa" modal in `servicos/page.tsx`
- `ConfigImpostos` interface mirrors `ConfigImpostosResponse` from backend
- Helper `addDays(dateStr, days)` — date arithmetic used for parcel date offsets

## Important Implementation Notes

- **No rounding in parcel validation**: diff threshold is `< 0.005` (half a cent), not `=== 0`
- **Last-parcel value adjustment**: use `Math.floor(liquido/n * 100)/100` for all but last; last = `liquido - base*(n-1)` to avoid cumulative rounding
- **Per-parcel Inter API call pattern**: to generate parcel N with value V from a nota with N total parcelas, pass `valor_total_override = V * N` + `parcelas_selecionadas = [N]`
- **Date adjustment for individual parcel**: pass `data_vencimento_override = desired_date - 30*(N-1) days` so backend's offset calculation lands on desired date
- **`aplicar_juros: false`** is always sent from UI — juros/mora feature is disabled from the user's perspective
- **Boleto status lock rules**: EMABERTO/VENCIDO = value locked (can't edit in Step 1); PAGO/BAIXADO = fully locked (can't regenerate); CANCELADO/EXPIRADO = can regenerate
- **`numero_nota` can be updated** via `PUT /notas-fiscais/{id}` with `{numero_nota: ...}` before emitting — saved to DB before Inter API call
