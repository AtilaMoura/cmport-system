# Plano — Cadastro de Despesa Geral (pagamento único ou parcelado)

> Escopo: só categoria **Geral** (não-funcionário) por enquanto. Funcionário
> (cadastro de salário/detalhes por pessoa, pendência de pagamento por mês)
> fica pra uma etapa futura — anotado em `CATEGORIZACAO_DESPESAS.md`, não
> esquecido.

## Decisões já tomadas com o Atila
- Subcategorias de despesa: **criar/curar categorias reais** (não é só rótulo livre).
- Ao marcar parcela como paga: **sempre exige escolher o banco/conta de saída** — sem banco padrão.
- Parcela nasce como pendência e some da lista de pendência só quando marcada como paga (data padrão = hoje, editável).

## ⚠️ Achado antes de começar: já existem 21 categorias (grupo=DESPESA)

A tabela `fin_categorias` já tem categorias cadastradas (Fase 1 do módulo financeiro), então a Fase 1 abaixo não é "criar do zero" — é **reconciliar** com o que já existe:

| id | nome atual no banco |
|---|---|
| 29 | Salários |
| 30 | Adiantamento de Salário |
| 31 | Combustível - André |
| 32 | Combustível - Outro |
| 33 | Celular |
| 34 | Telefone/Fone |
| 35 | Internet |
| 36 | Contabilidade |
| 37 | Sindical |
| 38 | Impostos (FGTS/GPS/ISS) |
| 39 | Convênio |
| 40 | Sistema da Empresa |
| 41 | Seguro |
| 42 | Água/Luz |
| 43 | Aluguel |
| 44 | Escritório |
| 45 | Estacionamento/Zona Azul |
| 46 | Alimentação |
| 47 | Tarifa Bancária |
| 48 | Uber |
| 49 | Diversos |

Cruzando com o que apareceu de fato na planilha (`CATEGORIZACAO_DESPESAS.md`), faltam subcategorias pra:
- Veículo — IPVA/licenciamento/multa
- Veículo — manutenção/oficina/acidente
- Veículo — garagem
- Cartão de crédito corporativo (fatura)
- Material de escritório/informática
- Material para condomínio (repassado)
- Repasse a zelador/síndico de condomínio cliente
- Acordos/dívidas/jurídico

E "Salários"/"Adiantamento de Salário" (ids 29/30) já existem como DESPESA — mas isso é conteúdo de FUNCIONÁRIO, que vamos tratar na etapa futura à parte (provavelmente vão sair do grupo Geral quando a Fase Funcionário existir).

As 8 categorias que faltam (Veículo IPVA/multa, Veículo manutenção, Veículo garagem, Cartão de crédito corporativo, Material escritório, Material condomínio, Repasse zelador/síndico, Acordos/jurídico) **entram pela própria UI de "criar categoria" da Fase 4**, quando formos migrar os dados históricos na Fase 6 — não precisa de SQL manual.

---

## Fase 1 — Backend: modelos de dados (categorias já existem, não mexe)
1. `backend/app/schemas/despesa_schema.py` — `DespesaCreate`, `DespesaParcelaResponse`, `DespesaResponse`, `MarcarPagoRequest`.
2. `backend/app/models/despesa_model.py`:
   - **`Despesa`** (cabeçalho): `id`, `descricao`, `categoria_id` (FK `fin_categorias`), `cnpj`, `fornecedor` (texto livre), `tipo_pagamento` (`UNICO`\|`PARCELADO`), `valor_total`, `total_parcelas`, `observacao`, `criado_em`, `atualizado_em`, `deletado_em`.
   - **`DespesaParcela`** (1:N): `id`, `despesa_id` (FK), `numero_parcela`, `total_parcelas`, `valor`, `data_vencimento`, `status` (`PENDENTE`\|`PAGO`), `data_pagamento` (nullable), `banco_id` (FK `bancos`, obrigatório só ao pagar), `forma_pagamento`, `movimentacao_id` (FK `fin_movimentacoes`, preenchida só quando pago).
3. Rodar backend local — auto-migração cria as tabelas (`Base.metadata.create_all`, já é automático no startup).

## Fase 2 — Backend: repository + service (regras de negócio)
1. `despesa_repository.py` — CRUD básico de `Despesa`/`DespesaParcela`.
2. `despesa_service.py`:
   - **Criar única**: 1 `DespesaParcela` (1/1) com `data_vencimento` = data informada.
   - **Criar parcelada**: gera N `DespesaParcela`, vencimento a cada +30 dias (mesma lógica de `data_vencimento_override` já usada em boleto).
   - **Marcar como pago**: exige `banco_id` no payload (sem default) + `data_pagamento` (default hoje, mas o front manda editável); cria `MovimentacaoFinanceira` (tipo SAIDA, mesma categoria, valor da parcela, `banco_id`) e linka via `movimentacao_id`; seta `status=PAGO`.
   - **Excluir**: soft delete (`deletado_em`) na `Despesa` — parcelas ainda não pagas somem da pendência; parcelas já pagas mantêm o histórico da movimentação gerada (não desfaz).

## Fase 3 — Backend: router + testes manuais
1. `despesa_router.py`:
   - `POST /api/v1/despesas` — cria (único ou parcelado)
   - `GET /api/v1/despesas?ano=&mes=&cnpj=&status=` — lista com parcelas
   - `PATCH /api/v1/despesas/parcelas/{id}/pagar` — marca parcela paga (body: `data_pagamento`, `banco_id`, `forma_pagamento`)
   - `DELETE /api/v1/despesas/{id}` — soft delete
2. Testar tudo pelo `/docs` (Swagger) antes de mexer no front.

## Fase 4 — Frontend: criar despesa + gerenciar categoria
1. Botão "Nova Despesa" em `/fluxo-financeiro/despesas`.
2. Modal: descrição, categoria (dropdown vindo de `GET /api/v1/categorias-financeiras?grupo=DESPESA&ativo=true`), único ou parcelado, valor, nº parcelas (se parcelado), data da 1ª parcela.
3. No dropdown de categoria, opção "+ Nova categoria" (chama `POST /api/v1/categorias-financeiras`) e, na lista de categorias, ação de editar (`PUT`) e desativar (`DELETE`, que já é soft no backend) — backend 100% pronto, é só consumir.
4. Validação de front (mesmo padrão de `|soma - total| < 0.005` já usado em boleto).

## Fase 5 — Frontend: pendência + marcar como pago
1. Lista de despesas do mês mostra cada parcela com badge "Pendente"/"Pago".
2. Botão "Marcar como pago" abre modal: **campo banco obrigatório** (select, sem valor pré-selecionado), data pré-preenchida com hoje (editável), forma de pagamento.
3. Parcelas futuras do mesmo lançamento continuam aparecendo nos meses seguintes automaticamente até serem pagas.

## Fase 6 — Migração dos dados históricos da planilha
1. A partir de `despesas_geral.json` (558 lançamentos já categorizados), gerar os registros de `Despesa`+`DespesaParcela` retroativos, já como `PAGO` (com a data real da planilha) — não como pendência, já que já aconteceram.
2. Resolver as séries de parcela pendentes de revisão (as 24 do `OBSERVACOES_DESPESAS.md`) e os 14 "não classificados" antes de rodar a migração — decisão manual caso a caso.
3. Conferir total pós-migração contra `despesas_geral.json` (R$ 178.138,41).

## Fase 7 — Validação final
1. Bater total de Despesas Geral do sistema contra a planilha, mês a mês.
2. Confirmar que `/financeiro/fluxo-mensal` continua somando certo (já que passa a receber as movimentações geradas pelas parcelas pagas).
3. Rodar `npx tsc --noEmit` no frontend + testar fluxo manual (criar única, criar parcelada, marcar como pago, editar data).

---

## Decisões confirmadas (21/08)
1. **Mantém as 21 categorias existentes.** Backend já tem CRUD completo pronto (`fin_categoria_router.py` — `GET/POST/PUT/DELETE /api/v1/categorias-financeiras`, `DELETE` = desativar/soft, não apaga linha). Só falta **UI no frontend** pra criar/editar/desativar categoria — não existe tela hoje, categoria só aparece como dropdown em Transferências/Recibos. Isso vira parte da Fase 4 (não precisa mexer no backend, só consumir o que já existe).
2. **"Salários"/"Adiantamento de Salário" (ids 29/30) ficam de fora por enquanto** — não mexe, não inativa, não usa. Só entram quando a Fase Funcionário existir.
3. **Os 14 itens "Não classificado"** ficam pra decisão manual na Fase 6 (migração histórica), junto com as 24 séries de parcela pendentes de revisão.

## Fluxo de execução — Claude planeja/acompanha, opencode implementa
Esse plano vai ser passado em partes pro opencode (deepseek-v4-flash-free) implementar, uma fase por vez. Claude escreve a instrução detalhada de cada fase, opencode escreve o código, Claude revisa o diff e testa (Swagger/curl no backend, browser no frontend) antes de liberar a próxima fase.

Prompt detalhado de cada fase fica salvo em `fluxo-financeiro/opencode-prompts/faseN_despesa_geral.txt`.

## Status de execução
- **21/08/2026**: Fase 1 (schema + model `Despesa`/`DespesaParcela`) disparada pro opencode.
- **21/08/2026 (retomada)**: **Fase 1 concluída e validada.**
  - ⚠️ Nota técnica: `opencode/deepseek-v4-flash-free` não existe mais (mudou o lineup gratuito) — modelo trocado pra `opencode/mimo-v2.5-free`. Também achado bug de ordem de argumento (`-f` engolindo a mensagem se vier antes) — corrigido, tudo documentado na memória `feedback_workflow_opencode_delegation.md`.
  - Diff conferido: só os 3 arquivos esperados (`backend/app/models/despesa_model.py`, `backend/app/schemas/despesa_schema.py`, +1 linha de import em `main.py`), nada mais tocado.
  - Backend local subiu sem erro; auto-migração criou `despesas` e `despesa_parcelas` com exatamente o schema planejado (conferido via `DESCRIBE` no MySQL).
  - **Pronta pra Fase 2** (repository + service).
- **21/08/2026 (mesma sessão): Fase 2 concluída e validada.**
  - Arquivos criados: `backend/app/repositories/despesa_repository.py`, `backend/app/services/despesa_service.py`. Nada mais tocado.
  - Testado ponta a ponta com `fluxo-financeiro/teste_fase2_despesa.py` (script de teste manual, faz cleanup dos dados no final): despesa única, despesa parcelada 3x com arredondamento, marcar como pago (gera `MovimentacaoFinanceira` vinculada), soft delete — tudo passou.
  - **Pronta pra Fase 3** (router + testes via Swagger).
- **22/08/2026: Fase 3 concluída e validada.**
  - Arquivo criado: `backend/app/routers/despesa_router.py`. `main.py` recebeu só 2 linhas (import + `include_router`, prefixo `/api/v1/despesas`).
  - Testado via HTTP real (backend local + login JWT + curl), não só Swagger: `POST` único, `POST` parcelado (5x de R$100, datas certas), `POST` com validação inválida (422), `PATCH` marcar pago sem banco (422 — confirma que banco é obrigatório), `PATCH` marcar pago com banco (200, gera `MovimentacaoFinanceira`), `GET /{id}`, `DELETE` (204 + depois 404, soft delete funcionando).
  - Dados de teste limpos do banco local depois do teste.
  - **Pronta pra Fase 4** (frontend: criar despesa + gerenciar categoria).
- **22/08/2026: Fase 4 código pronto, falta teste visual no navegador.**
  - Arquivos: `cmport-front/lib/fluxoFinanceiro.ts` (+2 interfaces, nada removido), `cmport-front/app/fluxo-financeiro/despesas/page.tsx` (reescrito: botão "+ Nova Despesa", modal com único/parcelado, categoria com criar/editar/desativar inline). Nada mais tocado.
  - `npx tsc --noEmit` limpo, código revisado linha a linha bate com o especificado.
  - Backend e frontend local subiram sem erro (`localhost:8000`, `localhost:3000`).
  - **Não consegui testar clicando de verdade no navegador** — extensão Claude in Chrome não conectada nesta sessão. Falta: abrir `/fluxo-financeiro/despesas`, clicar "+ Nova Despesa", criar uma despesa única e uma parcelada, testar "+ Nova categoria" e "Gerenciar categorias" (editar/desativar).

## Revisão de escopo (22/08/2026) — feedback do Atila depois de ver a Fase 4

3 gaps identificados testando o formulário, decisões já confirmadas:

1. **Campo "Fornecedor" sai, entra "Banco previsto" (opcional).** Não travado — só pré-preenche o banco na hora de marcar como pago (continua editável ali).
2. **Parcelado precisa de valor e vencimento editáveis por parcela**, não só um total dividido automaticamente. Ao escolher nº de parcelas + data da 1ª, o sistema sugere uma tabela (valor = total/N, vencimento +30 dias cada) **editável linha a linha**. Botão "replicar valor pra todas" preenche tudo de uma vez. Total mostrado = soma calculada (não é mais um campo de input pra validar contra).
3. **Novo tipo de despesa: `RECORRENTE`** (sem prazo — ex: BeNuven, telefone, água, tarifas bancárias). Sem data de fim; gera pendências automaticamente com **12 meses de horizonte** (confirmado com o Atila), renovando todo mês via job agendado (mesmo padrão do `AutoSync-OS`/`AutoSync-ORC` que já existe no projeto). Cada pendência gerada pode ter o valor ajustado antes de pagar (ex: conta de água variável) — exige endpoint novo pra editar uma parcela ainda `PENDENTE`.

Classificação de apoio já gerada: `fluxo-financeiro/recorrentes_geral_vs_funcionario.json` — 9 itens Geral com valor fixo, 25 com valor variável (cruzado com a planilha histórica).

### Mudanças de modelo necessárias
- `Despesa`: remove `fornecedor`, adiciona `banco_previsto_id` (FK `bancos`, nullable) e `ativo` (bool, default true — pra pausar/cancelar uma RECORRENTE sem apagar histórico). `tipo_pagamento` ganha o valor `RECORRENTE`. Pra RECORRENTE, `total_parcelas` usa o sentinela `0` (= "sem limite definido").
- `DespesaCreate` (schema): pra `PARCELADO`, passa a receber uma lista `parcelas: [{numero_parcela, valor, data_vencimento}]` explícita (montada no front a partir da tabela editável) em vez de só `valor_total + total_parcelas` calculado no backend. Pra `RECORRENTE`, novos campos `valor_recorrente` e `dia_vencimento`, sem `data_primeira_parcela`/`total_parcelas` fixos.
- Novo endpoint `PUT /api/v1/despesas/parcelas/{id}` — edita `valor`/`data_vencimento` de uma parcela ainda `PENDENTE` (rejeita se já `PAGO`).
- Novo job agendado (mesmo padrão `AutoSync-*` já registrado no startup do `main.py`) — todo mês, pra cada `Despesa` `RECORRENTE` `ativo=true`, garante que existem parcelas `PENDENTE` cobrindo os próximos 12 meses a partir de hoje (gera as que faltarem, usando `valor_recorrente` e `dia_vencimento`).

### Próximas fases (renumeradas)
- **Fase 4b** — Backend: migrar model/schema pras mudanças acima + endpoint de editar parcela pendente + job de geração de recorrência.
- **Fase 4c** — Frontend: reescrever o modal de Nova Despesa com os 3 tipos (Único/Parcelado com tabela editável/Recorrente), trocar Fornecedor por Banco previsto.
- **Fase 5** — Frontend: lista de pendências com "marcar como pago" (como já estava no plano original) + edição de parcela pendente (ajustar valor de conta variável antes de pagar).
- **Fase 6** — Migração histórica (como já estava), agora já com a classificação fixo/variável dos recorrentes pronta em `recorrentes_geral_vs_funcionario.json`.
- **Fase 7** — Validação final (como já estava).

## Status de execução (continuação)
- **22/08/2026: Fase 4b (parte 1 — model + schema) concluída e validada, com correção aplicada.**
  - Opencode reescreveu `backend/app/models/despesa_model.py` e `backend/app/schemas/despesa_schema.py` exatamente como especificado no prompt — nada mais tocado (conferido por timestamp + diff).
  - **Bug achado ao testar** (não é falha do opencode — o prompt da Fase 4b propositalmente não pedia pra mexer em `main.py`): a tabela `despesas` já existia no MySQL local (criada na Fase 1) com o schema antigo, e o mecanismo de auto-migração do projeto só faz `create_all` pra tabela nova — não altera tabela existente sozinho. `GET /api/v1/despesas` quebrava com 500 (`Unknown column 'despesas.banco_previsto_id'`).
  - **Corrigido por mim**: adicionadas 5 linhas de `ALTER TABLE` em `_run_migrations()` (`backend/app/main.py`) — enum `tipo_pagamento` ganhou `RECORRENTE`, colunas `banco_previsto_id`/`dia_vencimento`/`ativo` criadas. Coluna antiga `fornecedor` **não foi apagada** (fica órfã, sem uso — soft, não destrutivo).
  - Testado após correção: `GET /api/v1/despesas` → 200 `[]`. Schema `DespesaCreate`/`DespesaResponse` no OpenAPI batem com o especificado.
  - **Ainda pendente (confirmado, não é bug):** `despesa_repository.py`, `despesa_service.py`, `despesa_router.py` continuam no formato antigo (ainda esperam `fornecedor`/`total_parcelas` calculado) — `POST /api/v1/despesas` retorna 400 (`'DespesaCreate' object has no attribute 'fornecedor'`), como esperado até a próxima leva da Fase 4b (endpoint de editar parcela pendente + job de recorrência + atualizar repository/service/router pro novo formato).

- **22/08/2026: Fase 4b2 (repository + service + router + job de recorrência) concluída e validada.**
  - Opencode reescreveu `despesa_repository.py`, `despesa_service.py`, `despesa_router.py` inteiros + 2 edições pontuais em `main.py` (função `_gerar_despesas_recorrentes_auto` + registro do job mensal no `lifespan`) — exatamente como especificado, nada mais tocado.
  - Nota sobre o processo: o primeiro monitor que usei pra saber quando o opencode terminava deu falso positivo (checava só `git status` + `pgrep`, que não enxerga processo nativo do Windows disparado via `Start-Process powershell`) — corrigido checando o PID real do `opencode.exe` direto. Ficar de olho nisso da próxima vez.
  - Backend reiniciado, subiu sem erro — job novo rodou automaticamente no startup (`[AutoSync-Despesas] Parcelas recorrentes geradas: 0`, esperado sem despesa recorrente cadastrada ainda).
  - Testado via HTTP real (não só Swagger): `POST` único (201), `POST` parcelado 3x com valores manuais (201, valor_total = soma correta), `POST` recorrente dia 10 a partir de 10/08 (201, gerou 13 parcelas cobrindo até 10/08/2027 — horizonte de 12 meses bate certo), `PATCH` marcar pago (200, gera `MovimentacaoFinanceira` linkada), `PUT` editar parcela já paga (400, rejeitada corretamente), `PUT` editar parcela pendente (200, valor e data atualizados), `POST` parcelado com 1 parcela só (422, validação do schema funcionando), `DELETE` soft delete (204 + depois 404).
  - Dados de teste limpos do banco local (despesas, parcelas, movimentação gerada) depois do teste.
  - **Backend da Despesa Geral está funcionalmente completo agora** (os 3 tipos: único, parcelado, recorrente). Falta: Fase 4c (frontend — reescrever modal com os 3 tipos e tabela de parcelas editável), Fase 5 (frontend — pendências + marcar como pago + editar parcela), Fase 6 (migração histórica), Fase 7 (validação final).

- **22/08/2026: Fase 4c (frontend — modal com os 3 tipos) concluída e validada de verdade no navegador.**
  - Opencode editou a interface `Despesa` em `lib/fluxoFinanceiro.ts` (banco_previsto_id/dia_vencimento/ativo no lugar de fornecedor) e reescreveu `despesas/page.tsx` inteiro — bate 100% com o especificado, nada mais tocado. `npx tsc --noEmit` limpo.
  - Testado clicando de verdade (Playwright, já que a extensão Claude in Chrome não conectou nesta sessão — Fase 4 tinha ficado sem esse teste, agora ficou coberto):
    - Único: criado com sucesso, valor/categoria/vencimento batendo no banco.
    - Parcelado: gerou tabela editável (3x R$100 automático), editei uma parcela manualmente, testei "Replicar valor da 1ª pra todas" (recalculou total certo), salvou com os valores editados intactos.
    - Recorrente: campo "Banco previsto" selecionado (Itaú) foi salvo certo, validação de front bloqueou dia de vencimento fora de 1-28 (alert), corrigido pra 15 gerou 12 parcelas mensais certas no banco.
  - Nota de ambiente: porta 3000 local estava ocupada por outro projeto (`verdinho-app`) — o dev server do cmport-front já estava rodando na 3001 (instância antiga de sessão anterior); tentar subir um novo `npm run dev` deu conflito de lock file. Usar a instância existente na 3001 quando isso acontecer.
  - Dados de teste (3 despesas) limpos do banco local depois do teste.
  - **Frontend de criação de despesa está completo pros 3 tipos.** Falta: Fase 5 (lista de pendências + marcar como pago + editar parcela pendente no frontend — os endpoints já existem no backend desde a Fase 4b2), Fase 6 (migração histórica), Fase 7 (validação final).

- **24/08/2026: limpeza de repositório + Fase 5 (frontend — pendências, marcar como pago, editar parcela) concluída e validada.**
  - Antes da Fase 5: removidos do git ~28 arquivos soltos na raiz do repo (planilhas, docs de análise, scripts de importação pontuais, backups .sql) que eram trabalho manual local, não código do sistema — `.gitignore` reforçado pra bloquear esses tipos de arquivo na raiz dali pra frente (mantendo `CLAUDE.md`). Commitado separado da feature.
  - Código validado de Despesa Geral (Fases 4b/4b2/4c, que ainda não tinham sido commitadas) commitado nesse momento também, antes de disparar a Fase 5.
  - Opencode (`mimo-v2.5-free`) reescreveu `despesas/page.tsx` inteiro a partir do código exato passado no prompt — conferido byte a byte contra o especificado, zero desvio. `npx tsc --noEmit` limpo.
  - Nova seção "Parcelas de despesas do mês" lista cada parcela vencendo no mês/ano filtrado (both PENDENTE e PAGO), com badge de status.
  - Testado de verdade no navegador via Playwright (extensão Claude in Chrome não conectou de novo nessa sessão): criei despesa única de teste, apareceu na lista como Pendente; editei o valor inline (R$150 → R$175,50), salvou certo; cliquei "Marcar como pago" — modal abriu com banco vazio (validação bloqueou confirmar sem banco, mostrou alert), data já em 24/08/2026, forma PIX default; selecionei Itaú e confirmei — parcela virou "Pago" mostrando banco e data, e a `MovimentacaoFinanceira` gerada apareceu certinha na lista de lançamentos already-lançados da página (R$175,50, Itaú, 1 lançamento). Sem erros no console.
  - Dados de teste (despesa id 11 + parcela + movimentação vinculada) limpos do banco local via API (DELETE) depois do teste.
  - **Frontend da Despesa Geral está completo (criação + pendências).** Falta: Fase 6 (migração histórica dos dados da planilha) e Fase 7 (validação final).
  - Bug achado pelo Atila ao testar (não é da Fase 5 em si): criar categoria dava "talvez já exista" mesmo com nome novo — causa raiz era `POST /api/v1/categorias-financeiras` sem barra final (como o frontend chama) batendo em 405, `fin_categoria_router.py` só tinha a rota com barra. Corrigido (duplicado `@router.post("")` + `@router.post("/")`, mesmo padrão do `despesa_router.py`), testado e commitado.

- **24/08/2026: Fase 6 (migração histórica) aplicada e validada em LOCAL — ainda não aplicada em produção.**
  - Decisão: cada linha do `despesas_geral.json` (558 lançamentos) virou uma Despesa independente tipo ÚNICO já PAGO, sem tentar reconstruir as 24 séries de parcela bagunçadas do `OBSERVACOES_DESPESAS.md` — é histórico, já aconteceu, reconstruir a série não agregava nada.
  - Banco genérico por CNPJ (decidido com o Atila, já que o JSON não tem banco por lançamento): Itaú pra CMPORT, Inter pra CMPORT TEC.
  - Criadas 8 categorias novas em local (ids 53-60): Veículo IPVA/multa, Veículo manutenção, Veículo garagem, Cartão de crédito corporativo, Material escritório, Material condomínio, Repasse zelador/síndico, Acordos/jurídico.
  - Script `fluxo-financeiro/migrar_despesa_geral.py` (dry-run por padrão, `--aplicar` pra gravar de verdade; idempotente via `fin_movimentacoes.id_externo_banco = "MIGRACAO-DESPESA-GERAL-{cnpj}-{linha_planilha}"`). Mapeamento subcategoria→categoria normaliza acentos (compara sem acento) pra não depender de encoding exato. "Contas fixas" divide por palavra-chave na descrição (Vivo Móvel→Celular, Vivo Fixo→Telefone/Fone, Internet→Internet, Água/Luz→Água/Luz). "Não classificado" (19 itens, R$5.390,12) foi pra Diversos com observação `MIGRACAO: revisar categoria` pra reclassificação manual futura.
  - Rodado em local: **558/558 inseridos, R$178.138,41 — bate exato com o JSON.** Re-rodado depois (sem `--aplicar`) confirmou idempotência (558 já existentes, 0 a inserir).
  - Validado na UI: fluxo-mensal de Janeiro/2026 mostra "DESPESAS ESCRITÓRIO R$ 21.713,82" batendo com a soma das movimentações geradas daquele mês. Sem erro no console.
  - Nota (não é bug): parcela.data_vencimento (nominal, da planilha) pode divergir de parcela.data_pagamento/movimentacao.data (real) quando o pagamento aconteceu num mês depois — 2 casos em janeiro (Cartão Clebinho, Cartão Jusmarina) por causa disso. O total geral bate 100% nos dois lados (558 parcelas = 558 movimentações = R$178.138,41), só distribui entre meses pela data real do pagamento, igual o resto do sistema já faz.
  - **Produção ainda não recebeu a migração** — Atila pediu pra segurar por enquanto, aplicar só quando ele confirmar (precisa: criar as mesmas 8 categorias em produção + rodar o script lá com backup do banco antes).
  - Próximo: aplicar em produção (quando aprovado) + Fase 7 (validação final: bater total pós-migração mês a mês contra a planilha, conferir fluxo-mensal, `tsc` + teste manual).

- **24/08/2026 (mesmo dia, à noite): migração V2 — reclassificação em ÚNICO/PARCELADO/RECORRENTE (substitui a V1 acima).**
  - Atila pediu pra não jogar tudo como ÚNICO — coisas que se repetem todo mês (aluguel, contas fixas, sistemas por assinatura) deviam virar RECORRENTE, e coisas pagas em N vezes de um mesmo acordo/compra (cartão parcelado, seguro, IPVA, acordo advogado) deviam virar PARCELADO com o total real de parcelas (mesmo que a planilha só tenha capturado algumas — o que falta vira parcela PENDENTE, continuando a cadência mensal a partir da última conhecida).
  - Decisões tomadas com o Atila: Zona Azul/Uber/Tarifa Boleto Inter ficam ÚNICO cada lançamento (valor varia toda vez, RECORRENTE só aceita 1 valor fixo repetido); Cartão Clebinho/Armarinhos Fernandes são parcelas de compras específicas (PARCELADO), não fatura recorrente; "Bem Mais Familiar"/"Berazil Medicina" nem existem nesse JSON (são benefício de funcionário, ficam pro `despesas_funcionario.json`, fase futura separada).
  - Script novo `fluxo-financeiro/migrar_despesa_geral_v2.py` — apaga a migração anterior (V1 ou rodada anterior da V2) antes de reinserir, pra poder rodar quantas vezes precisar sem duplicar. Classificação final: **14 despesas RECORRENTE** (Aluguel Andre/Fabiana, Aluguel Escritório, Vivo Móvel, Vivo Fixo, Auvo Sistema, Quero Faturar Sistemas CMPORT+TEC, Quisi Contabilidade CMPORT+TEC, Conta de Luz, Conta de Água, Conta de Internet, JLA Serviços, Atila Sistemas TEC), **10 despesas PARCELADO** (Advogado Renatinho 8/10, Seguro Moto 5/7, IPVA Palio 4/5, IPVA Fiesta 1/5, Acordo André Porto 1/10, Cartão Clebinho dividido em 4 sub-séries por denominador da compra — 4x/8x/12x/3x —, Cartão Armarinhos 5/5 completo), **429 lançamentos ÚNICO** (igual à V1, mesma regra de categoria).
  - **2 bugs achados e corrigidos durante a implementação:** (1) total_parcelas ficava negativo quando o número de pagamentos encontrados era maior que o denominador do rótulo original (ex: Cartão Armarinhos achou 5 mas rótulo dizia "/02") — corrigido usando `max(denominador, encontrados)`; (2) **bug sério**: as chaves do dicionário de categoria usavam hífen comum "-", mas a subcategoria real da planilha usa travessão "—" (em-dash) — isso fazia TUDO que começa com "Veículo — " (combustível, seguro, IPVA, manutenção, garagem, pedágio) cair errado em "Diversos". Corrigido normalizando travessão/em-dash pra hífen antes de comparar. Resultado após o fix: "Diversos" voltou pros 19 itens corretos (R$5.390,12), todas as outras categorias batendo exatamente com a distribuição da V1.
  - Depois de aplicar, reiniciei o backend pra disparar o job de geração automática de parcelas futuras das 14 RECORRENTE — gerou certinho até agosto/2027 (horizonte de 12 meses a partir de hoje), 212 parcelas PENDENTE futuras no total.
  - **Itens de baixa confiança pra revisar depois** (poucos dados de origem, muita extrapolação): Acordo André Porto (só 1 pagamento encontrado de 10 esperados — 9 parcelas PENDENTE fabricadas), IPVA Carro Fiesta (1 de 5 — 4 fabricadas), Cartão Clebinho sub-série 12x (3 de 12 — 9 fabricadas). Essas parcelas PENDENTE têm valor estimado (média das parcelas conhecidas da série) e data estimada (continuando a cadência mensal) — não são reais, servem só de lembrete pra conferir depois se ainda tá em aberto.
  - Total geral confirmado igual à V1: **558 movimentações PAGAS, R$178.138,41 exato**, mais 594 parcelas totais (inclui as PENDENTE fabricadas + as futuras das recorrentes).
  - Validado na UI: janeiro/2026 mostra 87 lançamentos, categorias corretas no filtro (Combustível, Veículo IPVA/multa, etc.), sem erro no console.
  - **`migrar_despesa_geral.py` (V1) fica só como histórico** — não usar mais, a V2 é a versão vigente. Produção continua sem receber nenhuma das duas ainda.

- **25/08/2026: DEPLOY EM PRODUÇÃO + reconciliação de fornecedores + Fase 7 (validação final) — concluídos.**
  - **Achado antes do deploy**: produção já tinha 839 lançamentos grupo=DESPESA (Jan-Jul/2026, R$409.089,65) lançados manualmente pela tela antiga/genérica, desde antes dessa feature existir — 232 deles (R$180k) jogados em "Diversos" por falta de categoria melhor. Confirmado via backup de 20/08 que é dado parado, não coisa nova sendo digitada.
  - Sincronizados 18 lançamentos de FORNECEDOR (não-despesa) que produção tinha e local não — criados os fornecedores/categorias que faltavam em local, bate exato (R$9.672,32).
  - Backup dos dois bancos feito antes de qualquer mudança em produção.
  - **Deploy**: `git push origin master` (commit `04b5233`) — GitHub Actions buildou e subiu, tabelas `despesas`/`despesa_parcelas` criadas em produção via auto-migração.
  - Criadas as 8 categorias novas em produção (ids diferentes de local: 56-63 lá vs 53-60 aqui, já que produção tem mais categorias de fornecedor no meio — script `gerar_sql_migracao_producao.py` remapeia automaticamente).
  - **Testado antes em ambiente descartável** (banco de teste criado a partir do backup de produção) antes de aplicar de verdade — pegou zero erro.
  - **Aplicado em produção**: 558 novos (R$178.138,41 exato) + 761 antigos removidos via soft-delete (Salário/Adiantamento, categorias 29/30, preservados intactos — R$111.020,52 não tocado). Backend reiniciado, parcelas futuras das 14 recorrentes geradas até agosto/2027.
  - **Fase 7 — validação final**: reconciliação mês a mês (planilha vs produção, por `data_vencimento`) bateu **100% exata** em todos os 9 meses (Jan-Set), R$178.138,41. Achado e corrigido durante a validação: 1 parcela (Banco Tarifa Boleto R$17,43) tinha `data_vencimento` com typo de ano na planilha original ("2023-01-20" em vez de "2026-01-20") que o filtro de correção do script só pegava anos <2020, não esse caso específico — corrigido direto via UPDATE nos dois bancos (local e produção).
  - Fluxo-mensal (Visão Geral) conferido na tela de produção: janeiro mostra R$46.033,78 = R$21.713,82 (despesas migradas, pela data real de pagamento) + R$24.319,96 (Salário/Adiantamento preservado) — bate exato com o que a API retorna.
  - `npx tsc --noEmit` limpo.
  - **Feature Despesa Geral está completa e no ar em produção com dado real.** Falta: as 5 melhorias de UX pedidas pelo Atila (ver detalhe da despesa com todas as parcelas, botão excluir despesa, badge "Vencida", separar Total Pago/Pendente/Geral, edição mais completa).

- **25/08/2026: Fase 8 (5 melhorias de UX) concluída e validada no navegador — ainda não deployada em produção.**
  - Backend: novo endpoint `PUT /despesas/{id}` (schema `DespesaUpdate`) permitindo editar descrição/categoria/banco previsto/observação da despesa (separado do `PUT /despesas/parcelas/{id}` que já existia só pra valor/data de parcela pendente). Commitado em `0a7af4b`.
  - Frontend (opencode, prompt em `fluxo-financeiro/opencode-prompts/fase8_melhorias_ux_despesas.txt`, revisado e com 1 ajuste manual): reescreveu `despesas/page.tsx` com as 5 melhorias:
    1. Modal de detalhe da despesa (clicando na descrição) mostrando todas as parcelas juntas, com badge de status por parcela.
    2. Botão excluir despesa (soft delete) dentro do modal de detalhe.
    3. Badge "Vencida" pra parcela PENDENTE com `data_vencimento` no passado (antes só existia Pago/Pendente).
    4. Cards de estatística separados: Total Pago / Total Pendente / Total Geral (antes era um total só, misturado).
    5. Edição mais completa no modal de detalhe: descrição, categoria, banco previsto e observação (antes só dava pra editar valor/data de uma parcela pendente isolada).
  - Estado `despesaDetalhe` derivado via `useMemo` a partir do array `despesas` (não guardado separado) — garante que o modal sempre reflete o dado mais recente depois de qualquer mutação (editar, marcar pago, excluir), sem precisar recarregar a lista manualmente.
  - Bug achado e corrigido durante o teste: parcela de despesa RECORRENTE mostrava "Única" no modal de detalhe (porque `total_parcelas=0` no banco pra recorrente) — corrigido checando `tipo_pagamento === 'RECORRENTE'` primeiro e mostrando "Parcela N" nesse caso.
  - Testado de verdade no navegador via Playwright contra dado real de produção (local, porta 3001): abri detalhe de uma despesa recorrente confirmando "Parcela 1/2/3...", editei categoria e confirmei persistência, badge "Vencida" aparecendo certo em parcela pendente com data passada, cards Pago/Pendente/Geral batendo com a soma visível na tabela, excluir despesa com confirm dialog (`browser_handle_dialog`) removendo da lista.
  - `npx tsc --noEmit` limpo.
  - Commitado em `d484acc` (frontend) + `0a7af4b` (backend, já commitado antes).
  - **Ainda não deployado em produção** — falta `git push origin master` quando o Atila confirmar.
