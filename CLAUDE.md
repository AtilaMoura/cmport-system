# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CMPort is a management system for condominios (residential condominiums) in Brazil. It consists of:
- **Backend**: FastAPI + SQLAlchemy + MySQL
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS v4

## Running the Project

### Prerequisites
- MySQL running via Docker: `docker-compose up -d db`
- Backend `.env` file at `backend/.env` (see variables below)

### Backend
```bash
cd backend
# Activate virtual environment
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
API docs available at: `http://localhost:8000/docs`

### Frontend
```bash
cd cmport-front
npm run dev
```

### Lint (frontend)
```bash
cd cmport-front
npm run lint
```

## Environment Variables (`backend/.env`)
```
AUVO_API_TOKEN=...
AUVO_API_KEY=...
DB_HOST=db
DB_PORT=3306
DB_NAME=cmport_gerenciamento
DB_USER=root
DB_PASSWORD=...
ENV=development
```

## Architecture

### Backend Domain Structure
Each domain in `backend/app/domains/<domain>/` follows this pattern:
- `model.py` — SQLAlchemy ORM model
- `schema.py` — Pydantic schemas (Create/Update/Response)
- `repository.py` — Direct DB access (queries, CRUD)
- `service.py` — Business logic, calls repository
- `router.py` — FastAPI router, calls service, injected via `Depends(get_db)`

Tables are auto-created on startup via `Base.metadata.create_all(bind=engine)` in `main.py`.

### Domains
| Domain | API Prefix | Purpose |
|---|---|---|
| condominios | `/api/v1/condominios` | Core entity: residential buildings |
| enderecos | `/api/v1/enderecos` | 1:1 address per condominio |
| contatos | `/api/v1/contatos` | N contacts per condominio |
| manutencoes_assistencias | `/api/v1/servicos` | Maintenance & assistance records |
| notas_fiscais | `/api/v1/notas-fiscais` | Fiscal invoices (NF-e / NFS-e) |
| dashboard | `/api/v1/dashboard` | Aggregate stats and Excel export |
| auditoria | `/api/v1/auditoria` | Deletion audit trail |
| auvo | (no public API prefix) | External API sync (Auvo field service platform) |

### Key Relationships
```
Condominio (1) -- (1) Endereco        [cascade delete]
Condominio (1) -- (N) Contato         [cascade delete]
Condominio (1) -- (N) ManutencaoAssistencia  [cascade delete]
Condominio (1) -- (N) NotaFiscal
NotaFiscal  (1) -- (1) ManutencaoAssistencia  [nota_fiscal_id FK]
```

### Nota Fiscal Import Flow
`POST /api/v1/notas-fiscais/importar` accepts `.xml` or `.zip` files.
The service (`notas_fiscais/service.py`) auto-detects:
- XML type: `NFSe` (municipal) or `NFe` (federal) or `EventoCancelamentoNFe`
- Invoice type: `MANUTENCAO` / `ASSISTENCIA` / `OUTROS` — detected from description text prefix ("MANUTENCAO..." or "SERVICOS PRESTADOS...")
- Status: `AUTORIZADA` / `CANCELADA` — from XML fields; canceled invoices are skipped and never generate services
- When a MANUTENCAO or ASSISTENCIA nota is imported and linked to a condominio, a `ManutencaoAssistencia` record is automatically created

### Auvo Integration
`backend/app/domains/auvo/` syncs customer data from the Auvo field service API into the local condominios/enderecos/contatos tables. Triggered via the `/api/v1/condominios/sync-auvo` endpoint.

### Auditoria (Audit Trail)
Deletions anywhere in the system call `registrar_exclusao()` from `auditoria/router.py`, which stores a full JSON snapshot of the deleted record in the `registros_exclusoes` table before deletion.

### Frontend Structure
`cmport-front/app/` uses Next.js App Router:
- `page.tsx` — Dashboard (home)
- `condominios/` — List, detail `[id]`, create `novo/`, edit `[id]/editar/`
- `servicos/` — List and detail `[id]/`
- `notas/` — List, detail `[id]/`, import `importar/`

Components in `cmport-front/components/`: `Sidebar`, `ThemeToggle`, `CondominiosList`, `FormEditarCondominio`, `FloatingActionButton`.

The frontend calls the backend at `http://localhost:8000/api/v1/` using `axios`. Dark mode is supported via `next-themes` with Tailwind's `dark:` classes.

### Database
MySQL (via PyMySQL driver). Connection string built in `backend/app/core/config.py` as `mysql+pymysql://...`. SQLAlchemy `echo=True` is enabled (logs all SQL to console).
