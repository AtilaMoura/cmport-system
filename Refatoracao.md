# Refatoracao.md — Tarefa Ativa de Implementação

> **Propósito:** Plano técnico da tarefa em andamento.
> Substituído integralmente a cada nova tarefa iniciada.
> Índice geral e histórico de conclusões em `PLANO_IMPLEMENTACAO.md`.

---

## Tarefas Anteriores — ARQUIVADAS

**Fluxo Financeiro — Fases 1-3 (sessão 2026-07-27/28):** CNPJ backfill em notas/recibos, endpoint `GET /financeiro/fluxo-mensal` (+ alertas de duplicata), página `/fluxo-financeiro` com 4 subpáginas, importação histórica Jan-Julho pra `fin_movimentacoes` (1168 registros). Tudo commitado local (`f197fb0` até `e0337cb`), **nada foi enviado pra produção ainda** (só os scripts de dados, que já rodaram nos dois ambientes, e o dump/restore de sincronização). Detalhes em `PENDENCIAS.md`.

**Reconciliação D2-D6 + limpeza de 3 categorias de duplicata (sessão 2026-07-27):** ver `PENDENCIAS.md`.

*(Tarefas anteriores: ver histórico em `PLANO_IMPLEMENTACAO.md`.)*

---

## Tarefa Ativa — Recibo: parcelas + ENTRADA gera serviço (opcional) + SAÍDA gera despesa

### Objetivo e escopo

Regra de negócio confirmada com o usuário:

| Tipo | Gera o quê | Como |
|---|---|---|
| **ENTRADA** | Serviço (`ManutencaoAssistencia`) | Checkbox "Gerar serviço" visível, **default marcado**, editável — usuário pode desmarcar pra criar só o recibo puro |
| **SAÍDA** | Despesa (`MovimentacaoFinanceira`, tipo `SAIDA`) | **Nunca** gera serviço. Sempre gera uma movimentação financeira. Categoria é **obrigatória**, selecionada no formulário (combobox com as categorias `DESPESA`/`FORNECEDOR` já semeadas em `fin_categorias`) |

Parcelamento (ambos os tipos):
- Recibo não tem parcela hoje — é um registro único. Vou adicionar a opção "número de parcelas" (default 1) na criação.
- Se parcelado: gera N registros `Recibo` (mesmo padrão self-referencial de `notas_fiscais.nota_vinculada_id`). **Só a parcela 1 gera o efeito colateral** (serviço, se ENTRADA; despesa, se SAÍDA) — as demais parcelas são só o registro do recebimento/pagamento daquele mês.
- Cada parcela marcada como paga (`data_pagamento` preenchida) aparece automaticamente no Fluxo Financeiro do mês correspondente — isso **já funciona hoje**, não precisa de código novo (o endpoint `/financeiro/fluxo-mensal` já filtra recibo ENTRADA/PAGO por `data_pagamento`; a despesa em `fin_movimentacoes` idem via `data`).

**Fora de escopo:** mudar o fluxo de reaproveitamento de OS existente (`numero_os`) — continua igual, só se aplica à parcela 1 de recibos ENTRADA.

### Análise dos arquivos existentes

| Arquivo | Papel atual | Mudança necessária |
|---|---|---|
| `backend/app/models/recibo_model.py` | Sem parcela, sem link pra `fin_movimentacoes` | Adicionar `numero_parcela`, `total_parcelas`, `recibo_pai_id` (self-FK) |
| `backend/app/models/fin_movimentacao_model.py` | Sem link pra `Recibo` | Adicionar `recibo_id` (FK nullable, `SET NULL`) — rastreia que a despesa nasceu de um recibo SAÍDA |
| `backend/app/schemas/recibo_schema.py` | `gerar_servico` default `False`, só usado se SAIDA; sem `parcelas`/`categoria_id` | `gerar_servico: bool = True` (agora só se aplica a ENTRADA); `parcelas: int = 1`; `categoria_id: Optional[int] = None` (obrigatório quando `tipo=SAIDA`, validado no service) |
| `backend/app/services/recibo_service.py` (`criar`, linha 44-94) | ENTRADA sempre força serviço; SAIDA cria serviço opcional | Reescrever: ENTRADA respeita `gerar_servico` (default True); SAIDA **nunca** cria serviço, sempre cria `MovimentacaoFinanceira` (categoria obrigatória); parcelamento gera N recibos, efeito colateral só na parcela 1 |
| `backend/app/repositories/recibo_repository.py` (`proximo_numero`) | Sequencial simples `REC-{ano}-{seq:03d}` | Não mexer — cada parcela recebe próprio número sequencial |
| `backend/app/repositories/fin_movimentacao_repository.py` | CRUD de movimentação | Conferir se aceita criação vinda de outro service sem duplicar lógica (reaproveitar `FinMovimentacaoRepository`/model direto, sem passar pelo router) |
| `cmport-front/app/recibos/novo/page.tsx` | Checkbox só pra SAIDA (linha 544-561); sem parcelas; sem seleção de categoria | Campo "Parcelas" (default 1) + preview; pra ENTRADA: checkbox "Gerar serviço" (default marcado); pra SAIDA: combobox de categoria (obrigatório), sem checkbox de serviço (nunca gera) |
| `cmport-front/app/recibos/page.tsx`, `[id]/page.tsx` | Sem indicação de parcela | Badge "Parcela X/Y"; no detalhe, link pras parcelas irmãs e, se SAIDA, link pra despesa gerada |

### Regras de negócio e validações

- **Agrupamento de parcelas:** parcela 1 = "mãe" (`recibo_pai_id=NULL`), demais apontam pra ela. Cada parcela é um `Recibo` completo e independente (número próprio, pode virar PAGO individualmente).
- **Cálculo de valor por parcela:** `round(valor_total / parcelas, 2)`; última parcela = `valor_total - soma_das_anteriores` (evita perda de centavo).
- **Vencimento por parcela:** parcela N = `data_vencimento_base + 30*(N-1)` dias (mesmo padrão já documentado no `CLAUDE.md` pra boleto).
- **ENTRADA:** `gerar_servico` default `true`, editável. Serviço só na parcela 1.
- **SAÍDA:** nunca gera serviço. Sempre gera 1 `MovimentacaoFinanceira` (só na parcela 1), com `categoria_id` obrigatório (`grupo` da categoria deve ser `DESPESA` ou `FORNECEDOR` — validar no service, rejeitar `RECEITA`), `valor=recibo.valor`, `data=recibo.data_pagamento or recibo.data_emissao`, `origem="MANUAL"`, `status="PENDENTE"`, `recibo_id=recibo.id`.
- **Sincronização básica:** se o recibo SAÍDA for atualizado depois (valor, status, data_pagamento) e tiver `MovimentacaoFinanceira` vinculada, atualizar os mesmos campos nela (`ReciboService.atualizar`).
- **Retrocompatibilidade:** recibos existentes = `numero_parcela=1, total_parcelas=1, recibo_pai_id=NULL` (default de coluna cobre, sem backfill necessário).
- Seguir `CLAUDE.md`: nunca pular camada, comentários em português, zero erros `tsc`, soft delete (nunca hard delete).

### Passo a passo por fase

#### Fase A — Backend: model + schema
- [ ] A1. `recibo_model.py`: `numero_parcela`, `total_parcelas` (Integer, default 1), `recibo_pai_id` (self-FK nullable)
- [ ] A2. `fin_movimentacao_model.py`: `recibo_id` (FK `recibos.id`, `ondelete=SET NULL`, nullable)
- [ ] A3. `ALTER TABLE` manual local + produção pras 2 tabelas (sem quebrar dado existente — colunas nullable/com default)
- [ ] A4. `ReciboCreate`: `gerar_servico: bool = True`, `parcelas: int = 1` (`ge=1`), `categoria_id: Optional[int] = None`
- [ ] A5. `ReciboResponse`: incluir `numero_parcela`, `total_parcelas`, `recibo_pai_id`

#### Fase B — Backend: service
- [ ] B1. Validar: se `tipo=SAIDA`, `categoria_id` é obrigatório e a categoria precisa ter `grupo in (DESPESA, FORNECEDOR)` — 422 se faltar ou for `RECEITA`
- [ ] B2. ENTRADA: `if payload.gerar_servico:` cria serviço (comportamento igual ao de hoje, só que agora checável)
- [ ] B3. SAIDA: nunca chama `_criar_servico`; sempre cria `MovimentacaoFinanceira` com os campos da regra acima
- [ ] B4. Parcelamento (`payload.parcelas > 1`): criar parcela 1 completa (com efeito colateral); loop parcelas 2..N só com os campos do recibo (sem side-effect), `recibo_pai_id` apontando pra parcela 1
- [ ] B5. `ReciboService.atualizar`: se recibo tiver `MovimentacaoFinanceira` vinculada (buscar por `recibo_id`), sincronizar `valor`/`data`/status equivalente

#### Fase C — Frontend
- [ ] C1. Campo "Parcelas" (default 1, min 1) — visível pros dois tipos
- [ ] C2. Preview de parcelas (nº, valor, vencimento) quando `parcelas > 1`
- [ ] C3. ENTRADA: checkbox "Gerar serviço" sempre visível, default marcado
- [ ] C4. SAIDA: combobox de categoria (`GET /categorias-financeiras?grupo=DESPESA` + `?grupo=FORNECEDOR`, ou os dois juntos com label de grupo), obrigatório antes de submeter — **sem** checkbox de serviço (nunca se aplica)
- [ ] C5. `recibos/page.tsx`: badge "Parcela X/Y"
- [ ] C6. `recibos/[id]/page.tsx`: seção "Parcelas relacionadas"; se SAIDA, link pra despesa gerada em `/fluxo-financeiro/despesas` ou `/fornecedores`

### Checklist final
- [ ] Migrations aplicadas local e produção
- [ ] Recibo ENTRADA 1x, gerar_servico=true (default) → 1 recibo + 1 serviço — igual ao comportamento de hoje
- [ ] Recibo ENTRADA 1x, gerar_servico=false → 1 recibo, 0 serviço (comportamento novo)
- [ ] Recibo SAIDA 1x → 1 recibo + 1 `MovimentacaoFinanceira` (categoria escolhida), 0 serviço (muda o comportamento de hoje, que às vezes criava serviço pra SAIDA)
- [ ] Recibo ENTRADA 3x (R$1000) → 3 recibos (parcelas somando R$1000 exato), 1 serviço só na parcela 1
- [ ] Recibo SAIDA 3x → 3 recibos, 1 `MovimentacaoFinanceira` só na parcela 1 (valor da parcela 1, não do total — ou vale considerar se a despesa deveria refletir o total; **decidir**: a despesa representa só o que foi de fato pago na parcela 1, as próximas não geram despesa nova — checar com o usuário se isso é o esperado ou se cada parcela paga devia gerar sua própria despesa)
- [ ] Marcar uma parcela futura como PAGO → aparece no Fluxo Financeiro do mês certo automaticamente (sem código novo)
- [ ] `npx tsc --noEmit` e `npm run lint` zerados
- [ ] Teste manual completo no navegador

### Decisão registrada (2026-07-28) — SAÍDA parcelado

**Resolvido:** cada parcela de um recibo SAÍDA, quando marcada como **paga**, gera sua própria `MovimentacaoFinanceira` naquele mês (uma despesa por parcela paga, não só na parcela 1). Motivo: despesa representa dinheiro saindo de fato a cada mês — diferente do serviço (ENTRADA), que representa um trabalho prestado uma única vez. Essa granularidade também evita perder informação (dá pra agregar visualmente depois, não dá pra recuperar o que não foi registrado).

**Ajuste no plano acima (Fase B):** a criação da `MovimentacaoFinanceira` pra recibo SAIDA não acontece necessariamente na criação do recibo — acontece quando a parcela é marcada como **PAGO** (`data_pagamento` preenchida), não na criação em si (uma parcela futura, ainda pendente, não é despesa realizada ainda). Se o recibo já nasce com `status=PAGO` (pagamento imediato), a despesa é criada na hora. Se nasce `PENDENTE`, a despesa só é criada quando o status virar `PAGO` (endpoint que já existe: marcar recibo como pago).

**Adiado pra depois (fora de escopo desta tarefa):** alerta/controle de vencimento de despesa parcelada (ex: avisar quando uma parcela de despesa está prestes a vencer). Anotar como possível item futuro em `PLANO_IMPLEMENTACAO.md` quando chegar a hora.

---

## ⏸ PAUSADO em 2026-07-28 — retomar por aqui

Plano completo, decisões de negócio fechadas (tabela do topo + decisão de SAÍDA parcelado acima). **Nenhuma linha de código foi escrita ainda** — só o plano. Próxima sessão: começar pela **Fase A** (model + schema + migration), seguir a ordem A → B → C do plano acima.
