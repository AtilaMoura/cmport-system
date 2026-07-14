# Refatoracao.md — Tarefa Ativa de Implementação

> **Propósito:** Plano técnico da tarefa em andamento.
> Substituído integralmente a cada nova tarefa iniciada.
> Índice geral e histórico de conclusões em `PLANO_IMPLEMENTACAO.md`.

---

## Tarefa Anterior (P2 — Corpo de Nota, sessão 2026-06-17) — ARQUIVADA

Todos os itens `P2-A/B/C` implementados e confirmados no código em 2026-07-14 (ver `cmport-front/app/corpos-nota/novo/page.tsx`). Checklist de testes manuais que ainda não foi marcado está em `PENDENCIAS.md`. Trabalho continuou em commits posteriores (`8712de6`, `f80c59e`, `9bffe63`, `261db4c`).

---

## Tarefa Ativa — Feature Recibo: tipo ENTRADA/SAIDA + vínculo com serviço

### Objetivo

Reescrever o wizard de `/recibos/novo` de 3 para 5 passos (Tipo → Vínculo → Contraparte → OS → Financeiro), suportando:
- **Tipo**: ENTRADA (cliente pagou a CMPort) ou SAIDA (CMPort pagou subcontratado)
- **Vínculo**: recibo com ou sem condomínio (cliente externo PF/PJ fora do condomínio)
- **Contraparte**: o próprio condomínio, morador cadastrado, cliente externo (com cadastro rápido inline), ou nome avulso
- **OS**: reaproveitar OS já sincronizada do Auvo (evita duplicar `ManutencaoAssistencia`) ou seguir sem OS
- **Financeiro**: valor, datas, CNPJ/conta Inter emitente, opção de gerar serviço vinculado

### Estado no início desta sessão (2026-07-14)

Todo o código já estava escrito por uma sessão anterior, **não commitado**:
`backend/app/models/recibo_model.py`, `backend/app/models/servico_model.py`, `backend/app/schemas/recibo_schema.py`, `backend/app/services/recibo_service.py`, `backend/app/routers/recibo_router.py`, `backend/app/main.py` (migrações incrementais), `cmport-front/app/recibos/novo/page.tsx`.

O `PENDENCIAS.md` já apontava que essa feature estava desalinhada do `Refatoracao.md` — este arquivo agora documenta o plano técnico retroativamente e os resultados do teste local.

### Migração de banco — já resolvida

`backend/app/main.py` tem uma rotina `_run_migrations()` que roda `ALTER TABLE ... ADD COLUMN` de forma idempotente a cada start (captura erro de coluna duplicada e segue). As colunas novas de `recibos` (`tipo`, `configuracao_inter_id`, `cnpj_emitente`, `cnpj_cliente`) e `clientes.auvo_id` já estão nessa lista (linhas ~148-154). **Não é necessário ALTER TABLE manual** — nem local nem na VPS, a próxima subida do backend já aplica.

### Sessão de Teste Local (2026-07-14)

Ambiente: Docker `cmport_db` (MySQL local), backend uvicorn, frontend `next dev`, login com usuário DEV, navegação via Playwright.

#### Bug 1 — `limit=1000` excede cap do backend (422 ao carregar condomínios)

`cmport-front/app/recibos/novo/page.tsx:94` pedia `/condominios?ativo=true&limit=1000`, mas `condominio_router.py:100` define `Query(700, ge=1, le=700)`. Toda vez que o Step 2 tentava carregar a lista de condomínios, a API retornava 422 e a lista ficava vazia.
**Fix aplicado:** `limit=1000` → `limit=700` no fetch do wizard de recibo.
**Nota:** o mesmo bug existe em `cmport-front/app/clientes/novo/page.tsx:35` (pré-existente, fora do escopo desta tarefa — mencionar se for mexer nessa página).

#### Bug 2 — Lista de OS sempre mostrava "OS nº —" + warning de `key` duplicada

`GET /recibos/buscar-os` devolvia os campos brutos de `OrdemServicoService._enriquecer()` (`task_id`, `task_date`, `task_type_description`, `orientation`...), mas o frontend (`OsDisponivel` interface) esperava `numero_os`, `data_servico`, `descricao_preview`, `descricao_completa` — campos que nunca existiram na resposta. Resultado: todos os botões da lista de OS ficavam idênticos ("OS nº —"), com warning de React por `key={os.numero_os}` undefined repetido.
**Fix aplicado:** `backend/app/routers/recibo_router.py` — endpoint `buscar_os` agora mapeia a lista para o formato esperado, seguindo exatamente o padrão já usado em `corpo_nota_router.py:112-124` (`numero_os = str(task_id)`, `data_servico = task_date.date().isoformat()`, `descricao_preview`/`descricao_completa` a partir de `task_type_description`/`orientation`).
**Importante:** não alterei `OrdemServicoService._enriquecer()` nem `listar_disponiveis_condominio/cliente`, pois `ordem_servico_router.py:66` depende do formato bruto original — a transformação foi feita só na camada do router de recibo.

#### Bug 3 — Data da OS exibida um dia antes (offset de fuso horário)

`cmport-front/app/recibos/novo/page.tsx:441` fazia `new Date(os.data_servico).toLocaleDateString('pt-BR')` sobre uma string `"YYYY-MM-DD"`. `new Date()` interpreta strings date-only como UTC meia-noite; convertida para o fuso local (Brasil, UTC-3), o dia exibido ficava um a menos (API retornava `2026-04-10`, tela mostrava `09/04/2026`).
**Fix aplicado:** troquei para `os.data_servico.split('-').reverse().join('/')`, sem passar pelo `Date`.

### Resultado dos testes end-to-end (após os 3 fixes)

- ✅ **ENTRADA + condomínio (VERMONT) + "o próprio condomínio" + OS reaproveitada**: criou `Recibo` (`REC-2026-019`, tipo ENTRADA, condominio_id, configuracao_inter_id, cnpj_emitente corretos) **e** vinculou/criou `ManutencaoAssistencia` com `numero_os`/`data_servico` corretos e `recibo_id` preenchido — confirmado direto no banco.
- ✅ **SAIDA + fora do condomínio + cadastro rápido de cliente externo + sem OS**: criou `Cliente` novo (`condominio_id NULL`, `auvo_id NULL`) e `Recibo` (`REC-2026-020`, tipo SAIDA, `cliente_id` preenchido, `condominio_id NULL`) — confirmado no banco. Step 4 corretamente mostrou "Nenhuma OS disponível" (cliente sem `auvo_id`) e o checkbox "Gerar OS vinculada" ficou desabilitado (correto, só disponível com condomínio).
- Sem erros de console em nenhum dos dois fluxos após os fixes.

### Nota de ambiente (não é bug do código)

Neste ambiente local, a porta 8000 já está ocupada por outro projeto (`nia_backend`, container Docker). Isso causa roteamento ambíguo entre IPv4/IPv6 quando o backend do CMPort também tenta subir na 8000 (Windows permite dois binds simultâneos em `0.0.0.0:8000`, e o SO escolhe de forma não-determinística qual processo responde). Para testar localmente, usei backend na porta 8001 + `BACKEND_URL=http://127.0.0.1:8001` em `.env.local` (revertido ao final). Se for comum testar os dois projetos ao mesmo tempo, vale considerar fixar uma porta alternativa permanente para o CMPort.

### Pendências / Checklist

- [x] Bug 1 — limit=700 no fetch de condomínios do wizard de recibo
- [x] Bug 2 — mapeamento correto de campos em `/recibos/buscar-os`
- [x] Bug 3 — parse de data sem offset de fuso
- [x] Teste local: ENTRADA + condomínio + contraparte condomínio + OS reaproveitada
- [x] Teste local: SAIDA + cliente externo (cadastro rápido) + sem OS
- [ ] Teste local: contraparte "Morador cadastrado" (dentro do condomínio)
- [ ] Teste local: "Digitar nome avulso" (sem cadastro, sem OS)
- [ ] Teste local: checkbox "Gerar OS vinculada ao recibo" quando há condomínio mas nenhuma OS para reaproveitar
- [ ] Revisar página de listagem `/recibos` e eventual detalhe para exibir os campos novos (`tipo`, `cnpj_emitente`, `cnpj_cliente`) — não verificado nesta sessão
- [x] `npx tsc --noEmit` no frontend após os fixes — zerado
- [ ] Commitar tudo (models, schema, service, router, main.py, frontend) — hoje está 100% uncommitted
- [ ] Confirmar que o próximo deploy da VPS aplica a auto-migração sem erro (idempotente, mas validar em produção)
- [ ] (Fora do escopo, achado ao investigar) `clientes/novo/page.tsx:35` tem o mesmo bug do `limit=1000` — considerar corrigir numa próxima tarefa

---

## Mapa de Arquivos (Recibo)

| Arquivo | O que muda |
|---------|-----------|
| `backend/app/models/recibo_model.py` | Campos `tipo`, `configuracao_inter_id`, `cnpj_emitente`, `cnpj_cliente` + relação `servicos` |
| `backend/app/models/servico_model.py` | Relação `recibo` (coluna `recibo_id` já existia) |
| `backend/app/schemas/recibo_schema.py` | `ReciboCreate`/`Update`/`Response` com os campos novos + `gerar_servico`, `tipo_servico`, `numero_os`, `data_servico` |
| `backend/app/services/recibo_service.py` | `_vincular_ou_criar_servico_por_os` (reaproveita OS sem duplicar) + `_criar_servico` parametrizado |
| `backend/app/routers/recibo_router.py` | Endpoint `GET /recibos/buscar-os` (corrigido nesta sessão) |
| `backend/app/main.py` | Migrações incrementais idempotentes (linhas ~148-154) |
| `cmport-front/app/recibos/novo/page.tsx` | Wizard 5 passos (corrigido: limit=700, mapeamento OS, parse de data) |
