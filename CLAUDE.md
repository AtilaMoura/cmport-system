# CLAUDE.md — CMPort

Sistema de gestão de condomínios brasileiros.
- **Backend**: FastAPI + SQLAlchemy + MySQL (PyMySQL)
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4

---

## Ambiente Local

```bash
# Banco
docker-compose up -d db
# MySQL: localhost:3306 | Adminer: http://localhost:8080

# Backend
cd backend && venv\Scripts\activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
# Docs: http://localhost:8000/docs

# Frontend
cd cmport-front && npm run dev
# http://localhost:3000

# Qualidade antes de commitar
cd cmport-front && npm run lint && npx tsc --noEmit
```

---

## Deploy (VPS Hostinger)

```bash
git push vps master   # deploy automático via hook post-receive
```

Hook executa: checkout → `docker compose up -d --build` → limpeza de imagens

**Servidor:** `root@168.231.96.184` | `/root/cmport-system` | SSH: `~/.ssh/id_ed25519`

**Containers:**
- `cmport_nginx` — proxy porta 80
- `cmport_front` — Next.js :3000 interna
- `cmport_api` — FastAPI :8000 interna
- `cmport_db` — MySQL 8.0 (volume `db_data`)

Nginx: `/` → frontend | `/api/v1/` → backend direto

```bash
# Acesso manual
ssh root@168.231.96.184
docker compose -f docker-compose.prod.yml logs --tail=50
```

---

## Variáveis de Ambiente (`backend/.env`)

```
DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD
AUVO_API_KEY / AUVO_API_TOKEN
INTER_CERT_PATH=app/auth/    INTER_ENV=production
ENV=development  (local) | ENV=production  (VPS via .env.production)
# Credenciais Inter ficam no banco (ConfiguracaoInter), não mais no .env
# INTER_CLIENT_ID / INTER_CLIENT_SECRET / INTER_CONTA_CORRENTE — fallback legado apenas
```

---

## Arquitetura Backend

**Camadas obrigatórias — nunca pular:**
```
schema → model → repository → service → router
```

```
backend/app/
  models/       ORM models (SQLAlchemy)
  repositories/ queries e CRUD (sem lógica de negócio)
  services/     lógica de negócio (chama repositories e APIs externas)
  routers/      handlers FastAPI (só chama service, sem lógica)
  schemas/      Pydantic request/response
  core/         config, database, security, dependencies
  auth/         certificados Banco Inter (certificado.crt, key.key)
  assets/       assinatura.jpg (base64 no footer de email)
```

Tables criadas automaticamente no startup: `Base.metadata.create_all(bind=engine)`
Seeds no startup: `ConfiguracaoImpostosServico` + 3 usuários (DEV/ADMIN/USUARIO) se tabelas vazias.

---

## API Routes

| Prefix | Arquivo | Função |
|---|---|---|
| `/api/v1/auth` | `auth_router.py` | Login JWT + `/me` — **público** |
| `/api/v1/condominios` | `condominio_router.py` | CRUD + sync Auvo |
| `/api/v1/enderecos` | `endereco_router.py` | 1:1 por condomínio |
| `/api/v1/contatos` | `contato_router.py` | N por condomínio |
| `/api/v1/servicos` | `servico_router.py` | ManutencaoAssistencia |
| `/api/v1/notas-fiscais` | `nota_fiscal_router.py` | Import XML/ZIP, CRUD, Excel |
| `/api/v1/boletos` | `boleto_router.py` | Geração, Inter API, PDF, email |
| `/api/v1/produtos` | `produto_router.py` | Sync produtos Auvo |
| `/api/v1/orcamentos` | `orcamento_router.py` | Sync + candidatos + por-servico |
| `/api/v1/termos-garantia` | `termo_garantia_router.py` | CRUD + PDF LibreOffice |
| `/api/v1/dashboard` | `dashboard_router.py` | Stats + Excel |
| `/api/v1/auditoria` | `auditoria_router.py` | Audit trail de exclusões |
| `/api/v1/configuracoes` | `configuracao_router.py` | Email accounts + empresa + contas Inter |
| `/api/v1/dev` | `dev_router.py` | Utilitários DEV (role=DEV) |

Todos exceto `/auth` exigem JWT via `get_current_user` (injetado globalmente em `main.py`).

---

## Relacionamentos entre Models

```
Condominio (1)——(1) Endereco               [cascade delete]
Condominio (1)——(N) Contato                [cascade delete]
Condominio (1)——(N) ManutencaoAssistencia  [cascade delete]
Condominio (1)——(N) NotaFiscal             [FK condominio_id nullable]
ManutencaoAssistencia (N)——(1) NotaFiscal  [FK nota_fiscal_id nullable]
NotaFiscal (1)——(N) Boleto                 [FK nota_fiscal_id not null]
ManutencaoAssistencia (1)——(1) TermoGarantia [UNIQUE servico_id]

Standalone: ConfiguracaoImpostosServico, RegistroExclusao, Usuario,
            ConfiguracaoEmail, ConfiguracaoEmpresa, ConfiguracaoInter
```

---

## Auth JWT

```
POST /api/v1/auth/login → {access_token, role, nome}
GET  /api/v1/auth/me   → usuário autenticado
```
Roles: `DEV` > `ADMIN` > `USUARIO` — `require_dev` exige DEV.
Frontend: token em `localStorage`, header `Authorization: Bearer <token>`.

---

## Regras Críticas de Negócio

**Cálculo valor líquido (boleto_service):**
- `MANUTENCAO/ASSISTENCIA`: `liquido = valor * (1 - (pis+cofins+inss+csll)/100)`
- `OUTROS`: `liquido = valor` (sem deduções)

**Geração de parcelas — armadilhas críticas:**
- Para valor `V` na parcela `N`: passar `valor_total_override = V * total_parcelas`
- Para data `D` na parcela `N`: passar `data_vencimento_override = D - 30*(N-1) dias`
- Validação frontend: `|soma_parcelas - liquido| < 0.005` (nunca `=== 0`)
- Última parcela: `liquido - base*(n-1)` para evitar erro cumulativo de arredondamento
- `aplicar_juros: false` sempre (feature desabilitada no UI)

**Soft delete obrigatório:** chamar `registrar_exclusao()` antes de qualquer delete (salva JSON snapshot em `registros_exclusoes`).

---

## Para detalhes por domínio use os commands:

| Command | Conteúdo |
|---|---|
| `/backend` | Models completos com campos, seeds, padrões SQLAlchemy, configurações |
| `/boleto` | Fluxo 2-step, Inter API, email, scheduler, status locks |
| `/nfe` | Import flow, tipos XML, impostos, divergência |
| `/auvo` | API Auvo V2, sync, produtos, orçamentos |
| `/frontend` | Estrutura App Router, interfaces TS, state patterns |
| `/termo` | Termo de Garantia, LibreOffice, template Word |
