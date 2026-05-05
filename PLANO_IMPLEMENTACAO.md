# Plano de Implementação — CMPort

**Última atualização:** 2026-05-05
**Status atual:** Fases 0–9 e Sub-fases 10A–10G concluídas. Sub-fase 11 concluída. **Sub-fase 12 em andamento.**

Convenções: `[x]` concluído · `[~]` em andamento · `[ ]` a fazer.

---

## Histórico de Fases Concluídas

| Fase | Descrição |
|---|---|
| 0–9 | Estrutura base, autenticação, condominios, serviços, notas fiscais, boletos, dashboard |
| 10A | Sincronização de Produtos Auvo |
| 10B | Sincronização de Orçamentos Auvo |
| 10C | Termo de Garantia — criação, PDF via LibreOffice |
| 10D | Email: remoção do XML como anexo, limpeza de fluxo |
| 10F | Correções e ajustes pós-10D |
| 10G | Geração de termo via HTML + WeasyPrint com preview no frontend |

---

## Sub-fase 10E — Futuro (fora do escopo atual)

`[ ]` Geração de nota fiscal a partir de orçamento Auvo:
- A partir do detalhe do orçamento local, criar registro em `notas_fiscais` com produtos/serviços
- Permitir disparar emissão fiscal externa
- Vincular automaticamente a `ManutencaoAssistencia` correspondente

---

## Sub-fase 11 — Armazenamento de PDF de Notas Fiscais (MinIO → R2)

### Resumo

O sistema atual importa XMLs de notas fiscais e descarta qualquer PDF que venha junto. Esta fase adiciona um storage S3-compatível (MinIO em dev e prod, com troca futura para Cloudflare R2 apenas via configuração) para persistir o PDF da NF. O banco guardará apenas a chave do objeto (`pdf_object_key`). O fluxo de importação de ZIP será estendido para capturar PDFs, um novo endpoint permitirá upload manual, e o envio de e-mail de boleto passará a anexar o PDF da nota automaticamente.

### Arquitetura Alvo

```
Upload ZIP (XML + PDF)     Upload manual PDF       Envio de e-mail
       │                         │                        │
       ▼                         ▼                        ▼
nota_fiscal_router ──────────────────────────── boleto_router
       │                         │                        │
       ▼                         ▼                        ▼
NotaFiscalService         NotaFiscalService        BoletoService
.importar_xmls()          .upload_pdf_nota()       .enviar_email_boleto()
(extrai PDF do ZIP,       (valida, faz upload)     (baixa PDF da NF
 faz upload ao final)              │                se existir)
       │                           │                        │
       └───────────────────────────┘                        │
                       │                                    │
                       ▼                                    ▼
               StorageClient (core/storage_client.py)
               boto3 + endpoint_url (MinIO ou R2)
                       │
                       ▼
               NotaFiscalRepository.update_pdf_key()
                       │
                       ▼
               notas_fiscais.pdf_object_key (String, nullable)
```

**Princípio de portabilidade MinIO → R2:** `StorageClient` usa `boto3` com `endpoint_url` configurável. Troca para R2 = muda 4 variáveis de ambiente. Zero mudança de código.

---

### Mudanças por Camada

#### Backend

**NOVO: `backend/app/core/storage_client.py`**

Abstração S3-compatível com responsabilidades:
- Inicializar `boto3.client('s3', endpoint_url=...)` com credenciais do env
- Métodos: `upload(bucket, key, data, content_type)`, `download(bucket, key) → bytes`, `delete(bucket, key)`, `get_presigned_url(bucket, key, expiry_seconds) → str`, `ensure_bucket_exists(bucket)`
- Instância singleton criada no startup, injetada via `Depends(get_storage_client)` em `core/dependencies.py`
- Por que `boto3` e não SDK nativo MinIO: boto3 funciona para MinIO, R2 e qualquer S3-compatível apenas via `endpoint_url`

**ALTERADO: `backend/app/core/config.py`**

Adicionar ao `Settings`:
```
STORAGE_ENDPOINT: str = "http://localhost:9000"
STORAGE_ACCESS_KEY: str = "minioadmin"
STORAGE_SECRET_KEY: str = "minioadmin"
STORAGE_BUCKET: str = "cmport-nfe"
STORAGE_REGION: str = "us-east-1"
```

**ALTERADO: `backend/app/models/nota_fiscal_model.py`**

Um único campo novo na tabela `notas_fiscais`:
```python
pdf_object_key = Column(String(500), nullable=True)
# Chave do objeto no storage: "notas_fiscais/{nota_id}/{numero_sanitizado}.pdf"
# None = sem PDF armazenado
```
Campo derivado no schema Pydantic (não no banco): `pdf_disponivel: bool = pdf_object_key is not None`

**ALTERADO: `backend/app/main.py`**

- Migration em `_run_migrations()`: `ALTER TABLE notas_fiscais ADD COLUMN pdf_object_key VARCHAR(500) NULL`
- Startup: criar instância do `StorageClient` e chamar `ensure_bucket_exists()`. Falha → log de warning, não aborta o servidor

**ALTERADO: `backend/app/schemas/nota_fiscal_schema.py`**

Em `NotaFiscalResponse`:
```python
pdf_object_key: Optional[str] = None
pdf_disponivel: bool = False  # computado via @model_validator
```
Novo schema `UploadPdfResponse(BaseModel)`: campos `nota_id`, `pdf_object_key`, `mensagem`

**ALTERADO: `backend/app/repositories/nota_fiscal_repository.py`**

Novo método: `update_pdf_key(db, nota_id, pdf_object_key) → NotaFiscal` — apenas persistência, sem lógica de negócio

**ALTERADO: `backend/app/services/nota_fiscal_service.py`**

*Extensão de `importar_xmls()`*: ao ler um ZIP, também coletar `.pdf` em `pdfs_no_zip: dict[str, bytes]`. Após criar/confirmar a nota, tentar match:
- Estratégia 1: `numero_nota.lower()` bate com nome-base de algum PDF
- Estratégia 2: ZIP com exatamente 1 XML + 1 PDF → match direto
- Se match: chamar `storage.upload()` + `NotaFiscalRepository.update_pdf_key()`
- Falha no upload não aborta a nota — log de warning

*Novos métodos estáticos*:
- `upload_pdf_nota(db, nota_id, pdf_bytes, storage) → key`: valida nota, sanitiza `numero_nota`, faz upload, atualiza banco
- `get_pdf_url(db, nota_id, storage) → str`: verifica que nota existe e tem `pdf_object_key`, retorna presigned URL (expiry 900s)

*Extensão de `delete_nota()`*: antes de deletar, se `pdf_object_key` existir → `storage.delete()` (try/except, não-bloqueante)

**ALTERADO: `backend/app/routers/nota_fiscal_router.py`**

Novos endpoints (todos com `Depends(get_storage_client)`):

| Método | Path | Descrição |
|---|---|---|
| `POST` | `/{id}/pdf` | Upload manual — `multipart/form-data`, campo `pdf: UploadFile` |
| `GET` | `/{id}/pdf-url` | Retorna `{"url": "...", "expira_em": 900}` — 404 se sem PDF |
| `DELETE` | `/{id}/pdf` | Remove do storage + limpa `pdf_object_key` — requer role ADMIN/DEV |

**ALTERADO: `backend/app/services/boleto_service.py`**

Em `enviar_email_boleto()`, na construção de `lista_anexos`, adicionar bloco:
```python
if nota.pdf_object_key:
    try:
        pdf_nf = storage.download(settings.STORAGE_BUCKET, nota.pdf_object_key)
        lista_anexos.append((f"nota_fiscal_{nota.numero_nota}.pdf", pdf_nf, "application/pdf"))
    except Exception as e:
        print(f"[Email] Aviso: não foi possível baixar PDF da NF: {e}")
```
Parâmetro `storage: Optional[StorageClient] = None` adicionado ao método — se `None`, skip silencioso

---

#### Frontend

**ALTERADO: `cmport-front/app/notas/[id]/page.tsx`**

Extensão da interface:
```typescript
interface NotaFiscal {
  // campos existentes...
  pdf_object_key: string | null
  pdf_disponivel: boolean
}
```

Indicador de PDF na tela de detalhe:
- `pdf_disponivel === true`: badge verde "PDF Disponível" + botão "Visualizar PDF" (abre presigned URL em nova aba) + botão "Substituir"
- `pdf_disponivel === false`: badge cinza "Sem PDF" + botão "Fazer Upload do PDF"

Modal de upload:
- `<input type="file" accept=".pdf">`
- `POST multipart/form-data` para `/api/v1/notas-fiscais/{id}/pdf`
- Atualiza estado local sem reload de página

**ALTERADO: `cmport-front/app/notas/page.tsx`**

Coluna indicadora na listagem: ícone de documento se `pdf_disponivel`, traço se não — apenas visual, não interativo

---

#### Docker / Infraestrutura

**ALTERADO: `docker-compose.yml` (desenvolvimento)**

```yaml
minio:
  image: minio/minio:latest
  container_name: cmport_minio
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: minioadmin
    MINIO_ROOT_PASSWORD: minioadmin
  ports:
    - "9000:9000"   # API S3-compatível
    - "9001:9001"   # Console web (http://localhost:9001)
  volumes:
    - minio_data:/data

volumes:
  db_data:
  minio_data:   # novo
```

**ALTERADO: `docker-compose.prod.yml` (produção)**

Mesmo serviço MinIO, mas:
- Credenciais via `env_file: .env.production`
- Portas 9000/9001 **não expostas** externamente — acesso apenas interno via rede `cmport_net`
- Volume `minio_data` persistente

**ALTERADO: `backend/.env`**

```bash
# Storage (MinIO local — para R2 basta trocar as 4 vars abaixo)
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_BUCKET=cmport-nfe
STORAGE_REGION=us-east-1
```

Em `.env.production`: `STORAGE_ENDPOINT=http://minio:9000` (nome do serviço Docker), credenciais fortes

**Troca futura para R2 — apenas vars (zero mudança de código):**
```bash
STORAGE_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
STORAGE_ACCESS_KEY=<r2_access_key>
STORAGE_SECRET_KEY=<r2_secret_key>
STORAGE_REGION=auto
```

**ALTERADO: `backend/requirements.txt`** — adicionar `boto3>=1.34.0`

---

### Sequência de Implementação

#### Fase 11.1 — Infraestrutura ✅
- `[x]` Adicionar MinIO ao `docker-compose.yml` e `docker-compose.prod.yml`
- `[x]` Adicionar vars `STORAGE_*` ao `backend/.env`
- `[x]` Adicionar `boto3` ao `requirements.txt`
- `[x]` Criar `backend/app/core/storage_client.py`
- `[x]` Adicionar `STORAGE_*` ao `core/config.py`
- `[x]` Adicionar `get_storage_client()` em `core/dependencies.py`
- `[x]` `ensure_bucket_exists()` chamado no startup de `main.py` (try/except não-bloqueante) via script Python

#### Fase 11.2 — Banco de Dados ✅
- `[x]` Adicionar `pdf_object_key` ao `nota_fiscal_model.py`
- `[x]` Adicionar migration em `main.py`
- `[x]` Adicionar `update_pdf_key()` em `nota_fiscal_repository.py`
- `[x]` Estender `NotaFiscalResponse` com `pdf_object_key` e `pdf_disponivel`
- `[x]` Adicionar `UploadPdfResponse` em `nota_fiscal_schema.py`

#### Fase 11.3 — Upload Manual ✅
- `[x]` Adicionar `upload_pdf_nota()` em `nota_fiscal_service.py`
- `[x]` Adicionar `get_pdf_url()` em `nota_fiscal_service.py`
- `[x]` Adicionar `delete_pdf_nota()` em `nota_fiscal_service.py` (corrigido — lógica movida do router para o service)
- `[x]` Adicionar `POST /{id}/pdf`, `GET /{id}/pdf-url` e `DELETE /{id}/pdf` em `nota_fiscal_router.py`

#### Fase 11.4 — ZIP com PDF ✅
- `[x]` Estender `importar_xmls()` para coletar PDFs do ZIP
- `[x]` Implementar lógica de matching (nome-base e fallback 1:1)
- `[x]` Chamar `upload_pdf_nota()` ao final do processamento de cada nota
- `[x]` Router passa `storage` para `importar_xmls()`

#### Fase 11.5 — Email Automático ✅
- `[x]` Adicionar `Depends(get_storage_client)` ao endpoint de enviar email em `boleto_router.py`
- `[x]` Passar `storage` para `BoletoService.enviar_email_boleto()`
- `[x]` Adicionar download do PDF da NF em `lista_anexos` (dupla guarda: `pdf_object_key and storage`)

#### Fase 11.6 — Frontend ✅
- `[x]` Estender interface `NotaFiscal` com `pdf_disponivel`
- `[x]` Indicador na listagem `notas/page.tsx`
- `[x]` Badge + botões em `notas/[id]/page.tsx`
- `[x]` Modal de upload de PDF
- `[x]` Download via presigned URL em nova aba
- `[x]` `npx tsc --noEmit` sem erros
- `[x]` `npm run lint` sem erros

---

### Testes e Validações

| Cenário | Endpoint | Verificação |
|---|---|---|
| Importar ZIP com XML+PDF | `POST /notas-fiscais/importar-xml` | Nota criada, `pdf_object_key` populado, PDF visível no MinIO Console |
| Importar ZIP com apenas XML | `POST /notas-fiscais/importar-xml` | Nota criada, `pdf_object_key = null`, sem erro |
| Upload manual de PDF | `POST /notas-fiscais/{id}/pdf` | Resposta 200, campo atualizado, PDF no MinIO |
| Upload de arquivo não-PDF | `POST /notas-fiscais/{id}/pdf` | Resposta 422 com mensagem clara |
| URL de download (com PDF) | `GET /notas-fiscais/{id}/pdf-url` | URL válida, PDF abre no browser |
| URL de download (sem PDF) | `GET /notas-fiscais/{id}/pdf-url` | Resposta 404 |
| Deletar nota com PDF | `DELETE /notas-fiscais/{id}` | Objeto removido do MinIO, nota deletada |
| Email de boleto (NF com PDF) | `POST /boletos/{codigo}/enviar-email` | Email recebido com PDF da NF anexado |
| Email de boleto (NF sem PDF) | `POST /boletos/{codigo}/enviar-email` | Email enviado normalmente, sem PDF da NF |
| MinIO offline — email | — | Email enviado sem PDF da NF (log de warning, não 500) |
| MinIO offline — importação | `POST /notas-fiscais/importar-xml` | Nota importada, `pdf_object_key = null`, log de warning |

**Validações pós-deploy:**
- MinIO sobe com `docker compose up -d`
- Console acessível em `http://localhost:9001`
- Bucket `cmport-nfe` criado automaticamente no startup do backend
- Notas antigas (`pdf_object_key = null`) continuam funcionando normalmente

---

### Riscos e Rollback

| Risco | Probabilidade | Mitigação |
|---|---|---|
| MinIO offline em produção | Médio | Toda lógica de storage é `try/except` — falha não bloqueia fluxo principal |
| PDF grande trava requisição | Baixo | Upload direto (não base64). Limite 50 MB via FastAPI `UploadFile` |
| `boto3` conflito de dependências | Baixo | Lib madura. Verificar `pip install boto3` antes da fase 11.1 |
| PDF no ZIP sem match com XML | Médio | Fallback 1:1 se ZIP tem exatamente 1 XML + 1 PDF |
| Presigned URL expõe dados sensíveis | Médio | URL expira em 15 min. MinIO sem porta exposta em prod |
| Volume `minio_data` sem backup | Alto | Incluir `minio_data` na rotina de backup junto com `db_data` |
| Regressão no fluxo de email | Baixo | `storage` é parâmetro opcional — se `None`, skip silencioso |

**Rollback:** feature é aditiva (campo nullable, endpoints novos, `try/except` em todo storage). Reverter código não quebra banco. Rollback completo: reverter código + executar manualmente `ALTER TABLE notas_fiscais DROP COLUMN pdf_object_key`.

---

### Checklist Final de Entrega

**Infraestrutura**
- `[x]` MinIO em `docker-compose.yml` (dev) e `docker-compose.prod.yml` (prod)
- `[x]` Vars `STORAGE_*` em `backend/.env` e `.env.production`
- `[x]` `boto3>=1.34.0` em `requirements.txt`
- `[x]` Volume `minio_data` persistente

**Backend**
- `[x]` `backend/app/core/storage_client.py` criado
- `[x]` `STORAGE_*` em `core/config.py`
- `[x]` `get_storage_client()` em `core/dependencies.py`
- `[x]` Campo `pdf_object_key` no model + migration em `main.py`
- `[x]` `update_pdf_key()` no repository
- `[x]` `pdf_disponivel` computado em `NotaFiscalResponse`
- `[x]` `upload_pdf_nota()` e `get_pdf_url()` no service
- `[x]` Lógica de PDF em `importar_xmls()` (ZIP)
- `[x]` Limpeza de PDF em `delete_nota()`
- `[x]` Endpoints `POST /{id}/pdf`, `GET /{id}/pdf-url`, `DELETE /{id}/pdf`
- `[x]` PDF da NF em `lista_anexos` no `boleto_service`

**Frontend**
- `[x]` Interface `NotaFiscal` estendida com `pdf_disponivel`
- `[x]` Indicador na listagem `notas/page.tsx`
- `[x]` Badge + botões em `notas/[id]/page.tsx`
- `[x]` Modal de upload funcional
- `[x]` Download via presigned URL funcional
- `[x]` `npx tsc --noEmit` sem erros
- `[x]` `npm run lint` sem erros

**Qualidade**
- `[x]` Nenhuma falha de storage aborta fluxo principal
- `[x]` Chave no formato `notas_fiscais/{id}/{numero_sanitizado}.pdf`
- `[x]` Troca para R2 documentada: 4 vars + remover serviço `minio` do compose

---

## Sub-fase 12 — Melhorias no Envio de Email

### Resumo

Quatro melhorias no fluxo de email de boleto:
1. **CC global** — lista de emails em Configurações que sempre recebem cópia
2. **CC por envio** — campo "Com cópia para" no compositor de email
3. **Envio em lote** — todos os boletos de um serviço em 1 email
4. **PDF de orçamento gerado** — gerar PDF do orçamento com WeasyPrint (dados locais do banco) e anexar ao email

> Auvo não fornece PDF de orçamento — apenas `public_link`. Solução: gerar PDF próprio a partir dos dados em `orcamentos` + `orcamento_itens`.

---

### Fase 12.1 — CC Global (Configurações) ✅

- `[x]` Adicionar `emails_copia = Column(Text, nullable=True)` em `configuracao_model.py` (`ConfiguracaoEmpresa`)
- `[x]` Migration em `main.py`: `ALTER TABLE configuracao_empresa ADD COLUMN emails_copia TEXT NULL`
- `[x]` `configuracao_schema.py` → `EmpresaUpdate` e `EmpresaResponse`: `emails_copia: Optional[List[str]]` + `@field_validator` para parse JSON
- `[x]` `configuracao_service.py` → `atualizar_empresa()`: serializar `emails_copia` como JSON antes de salvar
- `[x]` Frontend `configuracoes/page.tsx`: seção "E-mails em Cópia (Global)" — input + "+" + lista com "×"; salva via `PUT /configuracoes/empresa`

### Fase 12.2 — CC por Envio + Merge CC Global ✅

- `[x]` `email_service.py` → `enviar_boleto()`: parâmetro `cc_emails: List[str] = []`; buscar `ConfiguracaoEmpresa.emails_copia`; merge via `set()`; SMTP `msg["Cc"]`; Graph `ccRecipients`
- `[x]` `boleto_service.py` → `enviar_email_boleto()`: parâmetro `cc_emails: List[str] = []`, repassar para EmailService
- `[x]` `boleto_router.py` → Form: adicionar `cc: Optional[str] = Form(None)`
- `[x]` Frontend `servicos/[id]/page.tsx`: input "Com cópia para" no compositor; parse ao enviar

### Fase 12.3 — Envio em Lote ✅

- `[x]` `boleto_router.py`: novo endpoint `POST /enviar-email-servico/{servico_id}`
- `[x]` `boleto_service.py`: novo método `enviar_email_servico()` — busca boletos da nota, baixa PDFs via Inter, envia 1 email com todos os anexos, atualiza `email_enviado_em` / `email_destinatarios`
- `[x]` Frontend `servicos/[id]/page.tsx`: botão "Enviar todos em 1 email" (visível quando nota tem > 1 parcela)

### Fase 12.4 — PDF de Orçamento Gerado ✅

- `[x]` `orcamento_service.py`: novo método `gerar_pdf(db, orcamento_id) -> bytes` — monta HTML + WeasyPrint com dados de `Orcamento` + `OrcamentoItem[]`
- `[x]` `boleto_service.py` → `enviar_email_servico()`: se `incluir_orcamento=True` e `servico.orcamento_id` existir, gerar PDF e adicionar em `anexos_extras`
- `[x]` Endpoint `enviar-email-servico`: parâmetro `incluir_orcamento: bool = Form(False)`
- `[x]` Frontend `servicos/[id]/page.tsx`: checkbox "Incluir PDF do Orçamento" (visível só se `servico.orcamento_id !== null`)
