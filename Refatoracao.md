# Refatoracao.md — Tarefa Ativa de Implementação

> **Propósito:** Plano técnico da tarefa em andamento.
> Substituído integralmente a cada nova tarefa iniciada.
> Índice geral e histórico de conclusões em `PLANO_IMPLEMENTACAO.md`.

---

## Tarefas Anteriores — ARQUIVADAS

**Recibo: parcelas + gerar_servico editável + despesa por parcela paga (sessão 2026-07-28/29):** feature completa, testada localmente (pytest + Playwright), commitada em `247d11a`. Inclui: parcelamento (`numero_parcela`/`total_parcelas`/`recibo_pai_id`), checkbox "gerar serviço" editável pra ENTRADA (funciona mesmo com OS selecionada), categoria obrigatória + despesa por parcela paga pra SAÍDA, endpoint `GET /recibos/{id}/parcelas`, cascade delete (excluir recibo remove o serviço vinculado), cards "Recibo Vinculado"/"Cobranças por Parcela" no detalhe do serviço. Migração `categoria_id` aplicada em produção em 2026-07-29 (só isso — o resto do código **ainda não foi enviado pra produção**, ver lista completa no final deste arquivo). **Ainda em aberto dessa tarefa:** decisão sobre CNPJ obrigatório no formulário (usuário não decidiu, ficou como estava); `npm run lint` não rodado.

**Análise de recibos duplicados por falta de parcela (sessão 2026-07-29):** varredura dos 39 recibos existentes encontrou 2 casos suspeitos — ver `Analise_Recibos_Parcelas_Duplicadas.md`. **Decisão do usuário:** vai resolver, mas **depois** de implementar a tarefa ativa abaixo (parcela com valor editável) — faz sentido corrigir os dados manualmente usando a UI já corrigida, ao invés de duas vezes.

**Fluxo Financeiro — Fases 1-3 (sessão 2026-07-27/28):** CNPJ backfill em notas/recibos, endpoint `GET /financeiro/fluxo-mensal` (+ alertas de duplicata), página `/fluxo-financeiro` com 4 subpáginas, importação histórica Jan-Julho pra `fin_movimentacoes` (1168 registros). Tudo commitado local (`f197fb0` até `e0337cb`), **nada foi enviado pra produção ainda** (só os scripts de dados, que já rodaram nos dois ambientes, e o dump/restore de sincronização). Detalhes em `PENDENCIAS.md`.

**Mapeamento das planilhas de Fluxo Financeiro (sessão 2026-07-29):** ver `Mapeamento_Planilhas_Fluxo_Financeiro.md` — mapa completo das seções/totais mensais das duas planilhas (CMPORT principal + TEC), análise de onde existe parcelamento real (só em Assistência e alguns acordos de Fornecedores). Comparação com o sistema (Fase 2) parcialmente feita: Manutenção e Entrada/Bancos bateram exato Jan-Jun; achado um bug de fórmula na própria planilha (Entrada de julho). Falta comparar Assistência mês a mês (é onde mora o parcelamento real) e Despesas/Fornecedores.

**Reconciliação D2-D6 + limpeza de 3 categorias de duplicata (sessão 2026-07-27):** ver `PENDENCIAS.md`.

*(Tarefas anteriores: ver histórico em `PLANO_IMPLEMENTACAO.md`.)*

---

## Tarefa Ativa — Recibo parcelado: valor de cada parcela editável (com validação de soma)

### Status: ✅ implementada e testada (2026-07-29)

- **Fase A (backend):** feita — `valores_parcelas` opcional em `ReciboCreate`, validado em `_validar_valores_parcelas` (len, valores > 0, soma com tolerância 0.01), usado em `criar()` no lugar do split automático quando enviado.
- **Fase B (frontend):** feita — inputs editáveis por parcela em `recibos/novo/page.tsx`, soma ao vivo com indicador visual, botão "Dividir igualmente", botão "Criar Recibo" desabilitado enquanto a soma não bate, resumo final mostra os valores reais.
- **Fase C (testes):** feita — 3 testes novos em `test_recibo_gera_servico.py` (soma correta aplica valores exatos; soma errada rejeitada com 422; sem `valores_parcelas` mantém o split automático de antes). Suíte: 42 passed / 3 falhas pré-existentes não relacionadas (`test_corpo_nota_produto.py`).
- **Testado no navegador (Playwright):** criação com 3 parcelas customizadas (150/100/50), validação de soma errada bloqueando o botão, correção e submissão com sucesso — valores exatos aplicados nos 3 recibos criados.
- **`npm run lint`:** rodado — 9 erros/33 warnings pré-existentes no restante do código (não relacionados a esta tarefa; `recibos/novo/page.tsx` só tem 1 warning pré-existente, `semOs` não usado, que já existia antes desta mudança).
- **Não commitado ainda** — aguardando o usuário pedir explicitamente (regra: só commitar quando pedido).

### Objetivo

Hoje, ao parcelar um recibo (`parcelas > 1`), o sistema sempre divide o valor total **igualmente** entre as parcelas (`_calcular_valores_parcelas`: `round(total/n, 2)`, última parcela absorve o arredondamento). O usuário quer poder **editar o valor de cada parcela individualmente** (parcelas não precisam ser iguais — ex: parcela 1 = R$300, parcela 2 = R$150, parcela 3 = R$150), mas o sistema **sempre precisa validar que a soma das parcelas bate com o valor total** antes de permitir salvar (mesmo padrão já usado no fluxo de boleto/Inter: `servicos/[id]/page.tsx`, `somaParcelasModal()`, tolerância pequena, nunca comparar `=== 0` — ver regra já documentada no `CLAUDE.md`: `|soma_parcelas - liquido| < 0.005`).

### Escopo

- Só a criação do recibo (não editar parcelas depois de criado — isso fica fora de escopo)
- Só o valor de cada parcela (data de vencimento continua automática: `base + 30*(N-1)` dias, como hoje)
- Aplica pros dois tipos (ENTRADA e SAÍDA) — a lógica de parcelamento é a mesma pros dois

### Fase A — Backend

- **A1.** `ReciboCreate` (`recibo_schema.py`): novo campo opcional `valores_parcelas: Optional[List[float]] = None`
- **A2.** `ReciboService.criar()` (`recibo_service.py`): antes de chamar `_calcular_valores_parcelas`, se `payload.valores_parcelas` foi enviado:
  - Validar `len(valores_parcelas) == n_parcelas` (422 se não bater)
  - Validar cada valor `> 0` (422 se algum for zero/negativo)
  - Validar `abs(sum(valores_parcelas) - payload.valor) < 0.01` (422 com mensagem clara se a soma não bater com o total)
  - Se passou na validação, usar `valores_parcelas` no lugar do split automático
  - Se `valores_parcelas` não foi enviado: comportamento atual, sem mudança (retrocompatível)
- **A3.** Nenhuma migration necessária (não é campo novo de banco, é só um campo de entrada do payload — os valores já viram o campo `valor` de cada `Recibo` individual, que já existe)

### Fase B — Frontend (`recibos/novo/page.tsx`)

- **B1.** Quando `Number(parcelas) > 1`: trocar o texto de preview atual por uma lista de inputs editáveis, um valor por parcela — pré-preenchidos com o split igual sugerido (mesmo cálculo de hoje), mas editáveis
- **B2.** Soma ao vivo dos valores editados, comparada com o valor total (`Number(valor)`), com indicador visual (verde se bate dentro da tolerância, vermelho/aviso se não)
- **B3.** Botão "Criar Recibo" desabilitado enquanto a soma não bater (mesma tolerância usada no resto do sistema — nunca comparação exata)
- **B4.** Botão auxiliar "Dividir igualmente" pra resetar rápido pro split automático (conveniência, evita ter que editar tudo na mão se só quiser o padrão)
- **B5.** Enviar `valores_parcelas` no payload de `POST /recibos` quando os valores tiverem sido customizados (ou sempre enviar, já que o backend aceita e valida de qualquer forma)

### Fase C — Testes

- Atualizar `test_recibo_gera_servico.py`: caso de parcelas com valores customizados que somam certo (sucesso, valores exatos aplicados); caso que não soma (422); caso sem `valores_parcelas` (retrocompatibilidade — split automático continua igual a hoje)

### Fora de escopo (não fazer nesta tarefa)

- Editar valores de parcelas depois de criado o recibo
- Editar data de vencimento por parcela (só valor)
- Aplicar o mesmo conceito em Nota Fiscal/Boleto (já tem esse recurso lá, é só o Recibo que não tinha)

### Depois desta tarefa

Retomar a correção dos recibos duplicados (`Analise_Recibos_Parcelas_Duplicadas.md`) — usando a UI já com parcela editável pra reconstruir o caso do "Edgar" corretamente (parcela 1 com o serviço, parcelas seguintes só como pagamento) e corrigir a duplicata da "Cristina Maria Coelho".
