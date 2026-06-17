# Plano de Implementação — CMPort

**Última atualização:** 2026-06-17
**Status:** Fases 0–12.4 + Corpo de Nota + N1 + N3-backend + F1.1 + F1.2 concluídos. Janeiro/2026 importado (109 registros). Pendentes: C1 + D1 + N2 + N3-frontend + F1.3 + F1.4.

Convenções: `[x]` concluído · `[ ]` a fazer.

---

## Protocolo de Execução de Tarefas

> **Como funciona o fluxo de trabalho para cada tarefa deste plano:**

1. **Selecionar tarefa** — escolher a próxima tarefa do índice abaixo (N1, N2, N3, F1.x)
2. **Detalhar no Refatoracao.md** — antes de qualquer implementação, escrever o plano técnico completo da tarefa em `Refatoracao.md` (substitui o conteúdo anterior), com:
   - Objetivo e escopo
   - Análise dos arquivos existentes que serão lidos/modificados
   - Passo a passo por fase (A, B, C...) com arquivos a criar e modificar
   - Regras de negócio e validações
   - Checklist final
   - Testes esperados
3. **Outra IA implementa** — a implementação é executada por outro agente com base no `Refatoracao.md`
4. **Validação** — revisar o que foi implementado, testar os pontos do checklist, verificar TypeScript e deploy
5. **Marcar como concluído** — atualizar o status no índice deste arquivo (`PLANO_IMPLEMENTACAO.md`) e registrar o commit no `Refatoracao.md`

> `Refatoracao.md` é sempre **a tarefa ativa no momento** — um arquivo por vez, substituído a cada nova tarefa iniciada.

---

## Índice Geral

### ✅ Concluído

| # | Módulo | Descrição |
|---|--------|-----------|
| 0–9 | Base | Auth JWT, condomínios, serviços, notas fiscais, boletos, dashboard, Auvo, configurações |
| 10A | Sync Produtos Auvo | Sincronização de catálogo de produtos |
| 10B | Sync Orçamentos Auvo | Sync + candidatos + filtros |
| 10C | Termo de Garantia | PDF via LibreOffice, template Word |
| 10D | Email — sem XML | Remoção de XML como anexo no envio |
| 10F | Correções pós-10D | Bugs e ajustes pós-deploy |
| 10G | Termo via WeasyPrint | HTML → PDF, substituiu LibreOffice |
| 11 | Storage PDF NF | MinIO, upload, ZIP, email com PDF — sub-fases 11.1–11.6 |
| 12.1 | CC Global email | Configuração de emails em cópia global |
| 12.2 | CC por envio | CC por envio + merge com CC global |
| 12.3 | Envio em lote | Todos os boletos de um serviço em 1 email |
| 12.4 | PDF Orçamento | WeasyPrint para orçamentos, anexo no email |
| R | **Corpo da Nota de Serviço** | Ciclos, corpos, contratos, wizard 5 passos — commits `1167252`, `6754c46`, `1da01ed` |
| N1 | Corpo da Nota de Produto | `corpo_nota_model.py` já tem `tipo_nota` + `TipoNotaCorpo` cobrindo produto e serviço |
| N3-back | Boleto Manual — Backend | Endpoints `/boletos/manual`, `/registrar-pagamento`, `/enviar-email` implementados |
| F1.1 | Financeiro — Backend CRUD | Models `fin_*` + seeds + schemas + repos + services + routers — tudo implementado |
| F1.2 | Financeiro — Inter Extrato | `sincronizar_inter` + `buscar_extrato` + endpoint `/financeiro/sincronizar-inter` implementados |

### 🚧 A Implementar

| # | Módulo | Descrição |
|---|--------|-----------|
| **C1** | **Corpo da Nota — Melhorias** | Orçamento no wizard PRODUTO + auto-vínculo XML standalone + Termo de Garantia via corpo |
| D1 | **Dados — Pendentes Janeiro 2026** | 7 recibos sem condomínio mapeado — aguardando identificação |
| N2 | Leitura Nota de Entrada + Gerar Serviço | Import NF-e de entrada → auto-criar serviço |
| N3-front | Boleto Manual — Frontend | Formulário, upload PDF, badge status, marcar pago — backend já existe |
| F1.3 | Financeiro — Frontend | Sidebar 4 grupos, 3 páginas, 6 componentes |
| F1.4 | Financeiro — QA + Entrega | Teste ponta a ponta, deploy VPS |

### ⏸ Fora do Escopo Atual

| # | Descrição |
|---|-----------|
| 10E | Geração de nota fiscal a partir de orçamento Auvo |

---

## C1 — Corpo da Nota: Melhorias (Prioridade Alta)

**Plano técnico detalhado:** `Refatoracao.md`

### Objetivo
Três melhorias no módulo Corpo da Nota que amarram tudo desde o início: nota, serviço, orçamento e Termo de Garantia — sem redundância de dados, sem duplicidade na base. O serviço mantém autonomia total.

### Fase 1 — Fix: Orçamentos no Wizard PRODUTO (1 linha, frontend)
Tabs OS / ORCAMENTO / MANUAL ocultas para `tipo_nota=PRODUTO` — usuário não consegue vincular orçamento ou OS ao criar corpo de produto.

- [ ] `cmport-front/app/corpos-nota/novo/page.tsx` linha ~891: `tipoNota === 'SERVICO'` → `tipoNota !== 'MANUTENCAO'`
- [ ] Wizard PRODUTO → Step 3 exibe tabs, seleção de Orçamento/OS funciona
- [ ] `npx tsc --noEmit` zerado

### Fase 2 — Fix: Vínculo Automático Nota PRODUTO Standalone (backend)
Ao importar XML PRODUTO, `tentar_vincular_por_nota_fiscal` nunca encontra corpos `tipo_nota=PRODUTO` — só busca corpos SERVIÇO. Nota fica solta.

- [ ] `corpo_nota_repository.py`: +2 métodos (`list_candidatos_produto_standalone_por_numero_nf`, `list_candidatos_produto_standalone_por_mes`)
- [ ] `corpo_nota_service.py`: +método `_tentar_vincular_nota_produto_standalone` + fallback em `tentar_vincular_por_nota_fiscal`
- [ ] XML nota PRODUTO importado vincula automaticamente ao corpo PRODUTO correto
- [ ] Múltiplos candidatos → retorna lista para vínculo manual (sem erro)

### Fase 3 — Termo de Garantia via Corpo da Nota (backend + frontend)
Corpo com OS + produtos + garantia preenchidos permite gerar Termo diretamente, sem reabrir o serviço.

**Princípio:** `TermoGarantia.servico_id` é o FK obrigatório (dono é o serviço). `CorpoNota.termo_garantia_id` é referência de conveniência. Nenhum dado duplicado.

- [ ] `corpo_nota_service.py`: helpers `_serializar_produtos_para_termo`, `_extrair_prazo_meses`, método `pre_gerar_termo`
- [ ] `corpo_nota_schema.py`: schema `PreGerarTermoResponse`
- [ ] `corpo_nota_router.py`: `GET /{corpo_id}/pre-gerar-termo`
- [ ] `cmport-front/app/corpos-nota/[id]/page.tsx`: botão "Gerar Termo" + modal de confirmação + estado B (Termo já gerado)
- [ ] Modal pré-preenchido; data vazia se corpo criado antes do serviço (usuário preenche)
- [ ] Após salvar: `POST /termos-garantia/` + `PATCH /corpos-nota/{id}` com `termo_garantia_id`
- [ ] PDF do Termo correto; "Ver no Serviço →" abre `/servicos/{id}` com autonomia total

### Checklist Final C1
- [ ] Snapshot de regressão coletado antes de começar
- [ ] Fase 1 concluída: tabs PRODUTO funcionando
- [ ] Fase 2 concluída: XML PRODUTO standalone vincula automaticamente
- [ ] Fase 3 concluída: Termo gerado via corpo, vínculo bidirecional
- [ ] Corpos SERVIÇO simples e SERVIÇO+produto: `conteudo_gerado` idêntico ao snapshot
- [ ] Serviço em `/servicos/[id]` sem regressão (autonomia total mantida)
- [ ] `npx tsc --noEmit` zerado
- [ ] Deploy: `git push vps master`
- [ ] Smoke test produção

---

## D1 — Dados: Pendentes Janeiro 2026

### Contexto
Janeiro/2026 foi importado com sucesso: **109 registros** (notas fiscais + serviços + boletos PAGO, total R$70.400,79).
Ficaram 7 linhas sem mapeamento porque o nome na planilha é apenas o nome do morador, não o condomínio.
Arquivo de referência: `PENDENTES_JANEIRO_2026.xlsx` (na raiz do projeto).

### Pendentes — aguardando identificação do condomínio

| Linha planilha | Nome (planilha) | Data pagto | Valor | Condomínio no sistema |
|---|---|---|---|---|
| 115 | Eraseg | 16/01/2026 | R$ 750,00 | ❓ a identificar |
| 116 | Eraseg | 23/01/2026 | R$ 1.050,00 | ❓ a identificar |
| 117 | Durval | 19/01/2026 | R$ 350,00 | ❓ a identificar |
| 118 | Adelson | 23/01/2026 | R$ 140,00 | ❓ a identificar |
| 119 | Ludmila | 23/01/2026 | R$ 70,00 | ❓ a identificar |
| 121 | Luis | 27/01/2026 | R$ 70,00 | ❓ a identificar |
| 123 | Chistopher | 28/01/2026 | R$ 100,00 | ❓ a identificar |

**Total pendente: R$ 2.530,00**

### Como inserir após identificação
1. Informar qual condomínio (nome ou ID) cada linha pertence
2. Atualizar `COND_IDS` no `gerar_sql_janeiro.py` com os novos mapeamentos (ex: `'Eraseg': 123`)
3. Remover os nomes de `PENDING_NAMES` no mesmo script
4. Rodar `python gerar_sql_janeiro.py` → gera novo SQL apenas para as linhas ainda pendentes
5. Copiar SQL para VPS e executar no banco

### Checklist
- [ ] Identificar condomínio das 7 linhas acima
- [ ] Atualizar `gerar_sql_janeiro.py` com novos mapeamentos
- [ ] Executar SQL no banco de produção
- [ ] Conferir total: deve adicionar R$ 2.530,00 ao total atual (R$ 70.400,79 → R$ 72.930,79)

---

## ✅ N1 — Corpo da Nota de Produto (NF-e)

**Concluído.** O model `corpo_nota_model.py` já usa campo `tipo_nota` com enum `TipoNotaCorpo` que cobre tanto SERVIÇO quanto PRODUTO. Ciclos, wizard, router, service, schema e repository estão implementados (parte do módulo R — Corpo da Nota de Serviço).

---

## N2 — Leitura de Nota de Entrada + Geração de Serviço

### Objetivo
Importar XML de NF-e de entrada (compras de fornecedores) e auto-criar o serviço
correspondente para controle interno, eliminando lançamento manual duplicado.

### Definição de Escopo
- [ ] Mapear campos da NF-e de entrada → campos de `ManutencaoAssistencia`
- [ ] Decidir tipo de serviço criado (MANUTENCAO / ASSISTENCIA / OUTROS) e regra de default

### Backend
- [ ] Parser XML NF-e de entrada: fornecedor, CNPJ, itens, valor total, data emissão
- [ ] Endpoint `POST /notas-fiscais/importar-entrada` — aceita XML ou ZIP
- [ ] Service: extrair dados + criar `ManutencaoAssistencia` a partir da nota
- [ ] Campo FK nullable `nota_entrada_id` em `ManutencaoAssistencia` (aditivo, sem breaking change)
- [ ] Repository: listar serviços criados a partir de nota de entrada

### Frontend
- [ ] Tela de import: upload XML/ZIP + preview dos dados extraídos antes de confirmar
- [ ] Revisão dos campos mapeados com opção de editar antes de salvar
- [ ] Indicador no serviço: badge "Origem: Nota de Entrada" quando aplicável
- [ ] `npx tsc --noEmit` zerado

### Testes
- [ ] Importar XML válido → revisar preview → confirmar → serviço criado no banco
- [ ] Importar ZIP com múltiplos XMLs → cada um gera um serviço independente
- [ ] Importar XML inválido → erro claro no frontend, sem criar serviço
- [ ] Serviço criado aparece na listagem com badge de origem correto
- [ ] Campo `nota_entrada_id` preenchido no banco
- [ ] Importar mesmo XML duas vezes → comportamento definido (bloquear ou permitir)
- [ ] `npx tsc --noEmit` e `npm run lint` zerados
- [ ] Smoke test em produção após deploy

---

## N3 — Boleto Manual + Email + Controle

### Objetivo
Registrar manualmente boletos sem API Inter, com envio por email e controle de status.

### ✅ Backend — concluído
- [x] Endpoint `POST /boletos/manual` — criação manual (`CriarBoletoManualRequest`)
- [x] Endpoint `POST /boletos/{id}/enviar-email` — envio com PDF anexado, suporta CC e customização de corpo
- [x] Endpoint `POST /boletos/{id}/registrar-pagamento` — registrar pagamento com data
- [x] Upload de PDF: `POST /boletos/{id}/pdf` — armazenamento no MinIO
- [x] `pdf_object_key` no model para boletos sem API Inter
- [x] `forma_pagamento` enum cobre PIX, TRANSFERENCIA, CHEQUE, DINHEIRO, BOLETO_ITAU

### 🚧 Frontend — a implementar
- [ ] Formulário de cadastro: valor, vencimento, condomínio, forma de pagamento, observação
- [ ] Upload de PDF do boleto externo (drag & drop ou file input)
- [ ] Botão "Enviar Email" com PDF anexado + campo CC
- [ ] Botão "Marcar como Pago" com confirmação + campo data de pagamento
- [ ] Badge de status colorido na listagem de boletos
- [ ] `npx tsc --noEmit` zerado

### Testes (frontend)
- [ ] Criar boleto manual via formulário → aparece na listagem
- [ ] Upload PDF → link de download funcional
- [ ] Enviar email → recebimento com PDF anexado confirmado
- [ ] Marcar como PAGO → status e data atualizados na tela
- [ ] `npx tsc --noEmit` e `npm run lint` zerados
- [ ] Smoke test em produção após deploy

---

## ✅ F1.1 — Financeiro: Backend CRUD

**Concluído.** Toda a camada de backend está implementada:

| Camada | Arquivos |
|--------|----------|
| Models | `fin_categoria_model.py`, `fin_movimentacao_model.py`, `fin_saldo_inicial_model.py` |
| Schemas | `fin_categoria_schema.py`, `fin_movimentacao_schema.py`, `fin_saldo_inicial_schema.py` |
| Repositories | `fin_categoria_repository.py`, `fin_movimentacao_repository.py`, `fin_saldo_inicial_repository.py` |
| Service | `fin_movimentacao_service.py` |
| Routers | `fin_movimentacao_router.py` (`/api/v1/financeiro`), `fin_categoria_router.py` (`/api/v1/categorias-financeiras`) |

Tabelas: `fin_categorias` (enum RECEITA/FORNECEDOR/DESPESA) · `fin_movimentacoes` (origem BANCO/MANUAL, soft delete, `id_externo_banco`) · `fin_saldo_inicial` (UNIQUE ano+mes).

---

## ✅ F1.2 — Financeiro: Inter Extrato

**Concluído.** `fin_movimentacao_service.py` tem `sincronizar_inter(db, data_inicio, data_fim)` que chama `InterClient.buscar_extrato()`, cria movimentações com `origem=BANCO` e deduplica por `id_externo_banco`. Endpoint `POST /financeiro/sincronizar-inter` registrado no router.

---

## F1.3 — Financeiro: Frontend

### Objetivo
Interface completa do módulo financeiro: Sidebar refatorada para grupos,
3 páginas e 6 componentes. Zero erros TypeScript.

### Sidebar (obrigatório antes das páginas)
- [ ] Refatorar `Sidebar.tsx`: array flat → 4 grupos (`MenuGroup[]`)
- [ ] Grupos: OPERACIONAL / FISCAL / FINANCEIRO / SISTEMA
- [ ] Manter todo CSS, animações e lógica de role — apenas estrutura de dados muda
- [ ] Testar navegação em todas as rotas existentes sem regressão

### Interfaces TypeScript
- [ ] `CategoriaFinanceira` — espelha `fin_categorias`
- [ ] `Movimentacao` — espelha `fin_movimentacoes`
- [ ] `DashboardFinanceiro` — resposta do endpoint dashboard
- [ ] `SaldoInicial` — espelha `fin_saldo_inicial`
- [ ] `FormMovimentacaoManual` — payload de criação manual

### Páginas
- [ ] `/financeiro` — Dashboard com cards, breakdown e saldo do período
- [ ] `/financeiro/movimentacoes` — Tabela com filtros, ações e nova movimentação
- [ ] `/financeiro/categorias` — Gestão por grupo com toggles ativo/inativo

### Componentes
- [ ] `DashboardFinanceiro.tsx` — 4 cards topo + breakdown receitas + saldo período
- [ ] `TabelaMovimentacoes.tsx` — colunas, badges por tipo/origem/status, filtros
- [ ] `FormMovimentacaoManual.tsx` — modal: tipo → grupo → categoria → valores
- [ ] `FormCategorizar.tsx` — select inline na tabela, sem modal, salva direto
- [ ] `BotaoSincronizarInter.tsx` — estados: idle / loading / sucesso / erro
- [ ] `SaldoInicialCard.tsx` — exibe valor, clique → input inline, Enter/blur → salva

### Qualidade
- [ ] `npx tsc --noEmit` zerado
- [ ] `npm run lint` sem erros

### Testes
- [ ] Sidebar: 4 grupos visíveis, navegação para todas as rotas existentes sem regressão
- [ ] Dashboard: carrega totais do mês atual, troca de mês/ano atualiza os cards
- [ ] Saldo inicial: editar inline → Enter → salva → valor atualiza sem reload
- [ ] Nova movimentação manual: tipo → grupo → categoria → preencher → salvar → aparece na tabela
- [ ] `FormCategorizar` inline: selecionar categoria → PUT chamado → coluna categoria atualiza
- [ ] `BotaoSincronizarInter`: clicar → loading → resultado "X novas, Y duplicadas" exibido
- [ ] Página categorias: criar nova, editar nome, toggle ativo/inativo
- [ ] Filtros na tabela: mês/ano, grupo (tabs), status funcionando em combinação
- [ ] Badge ENTRADA=verde, SAIDA=vermelho, BANCO=azul, MANUAL=cinza, PENDENTE=amarelo, VALIDADO=verde
- [ ] `npx tsc --noEmit` e `npm run lint` zerados

---

## F1.4 — Financeiro: QA + Entrega

### Objetivo
Validação ponta a ponta com o cliente e deploy em produção.

- [ ] Fluxo completo com cliente: sincronizar Inter → categorizar movimentações → validar → dashboard
- [ ] Verificar saldo acumulado encadeando janeiro até mês atual com dados reais
- [ ] Confirmar que nenhuma tabela existente foi alterada (`git diff` nas migrations/models)
- [ ] Deploy VPS: `git push vps master`
- [ ] Smoke test produção: dashboard carrega, movimentações listam, categorias OK
- [ ] Smoke test Inter em produção: sincronizar 1 dia de extrato → resultado correto
- [ ] Documentar para o cliente: como usar cada página e o fluxo recomendado

### Testes de Regressão
- [ ] Boletos existentes continuam funcionando normalmente
- [ ] Notas fiscais existentes continuam funcionando
- [ ] Corpo da Nota de Serviço sem regressão
- [ ] Sidebar: todas as rotas anteriores acessíveis nos novos grupos
