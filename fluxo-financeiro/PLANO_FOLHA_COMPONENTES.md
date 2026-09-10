# PLANO — Componentes da folha (descontos + guias) no módulo Funcionário

Origem: demanda **D-20 "Parte folha de Pagamento"** (canal Demandas Dev, aberta 09/09/2026).
Anexos: `Folha de Pagamento.pdf` (folha Agosto/2026, TEC, 5 funcionários) + `GPS.pdf` (competência 07/2026, R$ 1.816,59).
Comentário da Fabiana: salário que sai no mês N = competência N-1; adiantamento que sai = competência do mês corrente; no fluxo conta no mês em que sai do banco.

Decisões: **usar as recomendações da análise** (Atila, 10/09). Nada é removido do módulo — só acréscimo.
Execução: **opencode implementa as Fases 1, 2, 3 e 5** (worktree, só banco local); **Claude implementa as Fases 4 e 6**
(filtro global + produção). Claude revisa cada diff, roda lint/tsc/teste funcional, e só aplica com aprovação do Atila.

---

## Princípios que não podem ser quebrados

1. **Não tirar nada.** Salário, adiantamento, VT, VR, plantão, hora-extra continuam gerando parcela como hoje.
   Regressão obrigatória: com os campos de desconto = 0 e adiantamento = NENHUM, o valor gerado tem que ser
   **idêntico ao de hoje**.
2. **Não duplicar em Despesa Geral.** Guia de folha (GPS/FGTS/IRRF/contribuição) mora **só** no grupo
   `FUNCIONARIO` e some da tela de Despesa Geral (`origem=GERAL`).
3. **Salário no fluxo = LÍQUIDO.** 1 Pix no banco = 1 parcela. Os descontos (INSS, IRRF, contribuição, VT 6%,
   empréstimo) são **memória de cálculo** — reduzem o valor sugerido do salário, não viram lançamento à parte.
4. **INSS/IRRF retido não é saída no dia do salário.** Só vira saída quando a **guia** (GPS/DARF) é paga —
   aí é 1 lançamento no grupo FUNCIONARIO, sem `funcionario_id` (guia da folha inteira), com mês de competência.
5. Camadas: schema → model → repository → service → router. Soft delete sempre. Comentários em português.
   Sem hardcode de credencial. `npx tsc --noEmit` zero erro.

---

## FASE 1 — Dados (opencode)

**Colunas novas** (adicionar na lista `stmts` de `backend/app/main.py::_run_migrations()`, no fim, antes do `]`):

```sql
ALTER TABLE funcionario_variaveis ADD COLUMN desconto_inss DECIMAL(10,2) NOT NULL DEFAULT 0
ALTER TABLE funcionario_variaveis ADD COLUMN desconto_irrf DECIMAL(10,2) NOT NULL DEFAULT 0
ALTER TABLE funcionario_variaveis ADD COLUMN desconto_contrib_assistencial DECIMAL(10,2) NOT NULL DEFAULT 0
ALTER TABLE funcionario_variaveis ADD COLUMN vt_desconto_percentual DECIMAL(5,2) NOT NULL DEFAULT 0
ALTER TABLE funcionario_variaveis ADD COLUMN emprestimo_parcela DECIMAL(10,2) NOT NULL DEFAULT 0
ALTER TABLE funcionario_variaveis ADD COLUMN emprestimo_saldo DECIMAL(10,2) NOT NULL DEFAULT 0
ALTER TABLE despesa_parcelas ADD COLUMN mes_competencia DATE NULL
```

(o `_run_migrations` engole erro de "coluna já existe" — é idempotente por design)

**Model** `backend/app/models/funcionario_model.py` — em `FuncionarioVariaveis`, adicionar as 6 colunas
(mesmos nomes/tipos, `default=0, nullable=False`, `asdecimal=False`).

**Model** `backend/app/models/despesa_model.py` — em `DespesaParcela`, adicionar
`mes_competencia = Column(Date, nullable=True)`.

**Schema** `backend/app/schemas/funcionario_schema.py` — em `FuncionarioVariaveisIn`, adicionar os 6 campos
`Decimal = Decimal("0")`. (o `Response` herda de `In`, não precisa mexer)

**Schema** `backend/app/schemas/despesa_schema.py`:
- `DespesaParcelaResponse`: `mes_competencia: Optional[date] = None`
- `DespesaCreate`: `mes_competencia: Optional[date] = None` (usado só no lançamento avulso UNICO)

**Categorias** `backend/app/main.py::_seed_categorias_funcionario` — adicionar no fim da lista `CATEGORIAS`
(seed insere só o que falta, é idempotente):

```python
("IRRF / DARF (guia recolhida)", 16),
("Contribuicao assistencial (guia recolhida)", 17),
```

(FGTS/GPS já tem a categoria "Encargos trabalhistas (FGTS/GPS)")

---

## FASE 2 — Cálculo do líquido sugerido (opencode)

`backend/app/services/funcionario_service.py`, dentro de `sincronizar_recorrentes`.

O componente **"Salario (folha mensal)"** deixa de usar `salario_mensal` cru. Passa a usar:

```
liquido_sugerido =
    salario_mensal
  - desconto_inss
  - desconto_irrf
  - desconto_contrib_assistencial
  - (salario_mensal * vt_desconto_percentual / 100   se vt_desconto_percentual > 0, senão 0)
  - emprestimo_parcela
  - (adiantamento_valor   se adiantamento_tipo == "FIXO", senão 0)
```

- Nunca negativo: `max(liquido_sugerido, 0)`.
- Os **outros componentes** (adiantamento, VT, VR, plantão, HE) **não mudam**.
- Guardar a memória de cálculo na `Despesa.observacao` do componente Salário, texto legível:
  `"Sugestão = salário 3.000,00 − INSS 250,00 − IRRF 50,00 − contrib. 30,00 − VT 6% 180,00 − empréstimo 100,00 − adiantamento 1.000,00 = 1.390,00. Ajuste com a folha real ao marcar como pago."`
  (montar só com as linhas que têm valor > 0)

**Regressão obrigatória:** com os 6 campos = 0 e `adiantamento_tipo != "FIXO"`, `liquido_sugerido == salario_mensal`
(comportamento idêntico ao de hoje).

Obs.: `sincronizar_recorrentes` já re-valoriza as parcelas PENDENTE futuras (linhas ~196-200). Depois dessa
fase, ao salvar o funcionário, as parcelas de salário pendentes passam a mostrar o líquido — é o esperado.
O "Pendente" da aba Funcionários vai cair pro líquido.

---

## FASE 3 — Mês de competência (opencode)

`backend/app/services/funcionario_service.py::sincronizar_recorrentes`, **depois** de
`DespesaService._garantir_parcelas_recorrente(db, d)`:

Para cada despesa RECORRENTE do funcionário, preencher `mes_competencia` nas parcelas **PENDENTE que ainda
estão com `mes_competencia IS NULL`** (não sobrescreve edição manual):

- Componente **"Adiantamento de salario"**: `mes_competencia = parcela.data_vencimento.replace(day=1)`
- **Todos os outros** componentes: `mes_competencia = parcela.data_vencimento.replace(day=1) - relativedelta(months=1)`

Lançamento avulso: `despesa_service.criar`, ramo `UNICO`, passar `mes_competencia=req.mes_competencia` na
`DespesaParcela` criada.

`mes_competencia` entra no `DespesaParcelaResponse` (Fase 1) — o frontend só exibe.

---

## FASE 4 — Anti-duplicação: filtro `origem` + bloco "Encargos da folha" (CLAUDE)

**Backend** `backend/app/repositories/despesa_repository.py::listar`:

- `origem == "GERAL"` passa a **excluir** despesa cuja categoria seja do grupo `FUNCIONARIO`:
  ```python
  cat_func = db.query(CategoriaFinanceira.id).filter(CategoriaFinanceira.grupo == "FUNCIONARIO")
  q = q.filter(Despesa.fornecedor_id.is_(None), Despesa.funcionario_id.is_(None),
               Despesa.categoria_id.notin_(cat_func))
  ```
- `origem == "FUNCIONARIO"` passa a **incluir** categoria grupo `FUNCIONARIO` mesmo sem `funcionario_id`:
  ```python
  q = q.filter(or_(Despesa.funcionario_id.isnot(None), Despesa.categoria_id.in_(cat_func)))
  ```

**Frontend** `cmport-front/app/fluxo-financeiro/funcionarios/page.tsx`:
- Bloco novo **"Encargos da folha do mês"** para as despesas retornadas com `funcionario_id == null`
  (hoje o `grupos` faz `continue` nelas). Lista simples: descrição, categoria, competência, valor,
  pagar/editar/excluir inline (reusa os handlers). Soma entra num card "Encargos" separado dos salários.

Claude faz e testa essa fase direto (mudança de comportamento global — risco de regressão na tela de
Despesa Geral e no dashboard do fluxo). Validar: Despesa Geral não mostra mais item de folha; total mensal
do fluxo não muda (guia continua contando 1×, agora só na aba certa).

---

## FASE 5 — UI do cadastro + exibição (opencode)

`cmport-front/app/funcionarios/page.tsx`:

- Interface `Variaveis` + `varVazia()` + `abrirEdicao` + `salvar` (payload): adicionar
  `desconto_inss`, `desconto_irrf`, `desconto_contrib_assistencial`, `vt_desconto_percentual`,
  `emprestimo_parcela`, `emprestimo_saldo` (todos `number | string`, default `''`, mandados via `num()`).
- Seção nova no modal, depois de "Variáveis da folha", título **"Descontos (folha)"**: 6 inputs
  `type="number" step="0.01"`. Um texto de ajuda: *"Descontos reduzem o valor sugerido do salário. O valor
  real você confere com a folha do mês na hora de pagar."*
- `vt_desconto_percentual`: rótulo *"Desconto VT (% do salário)"*, `step="0.1"`, placeholder `6`.

`cmport-front/app/fluxo-financeiro/funcionarios/page.tsx`:
- Na linha de cada parcela, quando `mes_competencia` existir, mostrar `comp. MM/AAAA` ao lado do vencimento.
- No item de salário, se `despesa.observacao` tiver a memória de cálculo, mostrar num `<details>` "ver cálculo".
- Interface `Parcela` ganha `mes_competencia: string | null`; interface `Despesa` já tem `observacao`? se não,
  adicionar.

---

## FASE 6 — Migração da folha de Agosto/2026 em produção (CLAUDE)

Segue o plano **já pronto** em `PENDENCIA_FOLHA_AGOSTO.md` (abordagem "vincular, não recriar"):
A1 vincular ~17 avulsos a funcionário+categoria · A1b rescisão Pedro (mov órfã 2092) · A2 recategorizar
~15 guias pras categorias novas · A3 remover as 23 parcelas RECORRENTE PENDENTE fantasma (hard-delete só
das parcelas de agosto + `registrar_exclusao`) · A4 revalidar.

Backup + snapshot antes. Aprovação do Atila antes de tocar produção. **Não** roda junto com as Fases 1-5 —
só depois que 1-5 estiverem deployadas e a cliente tiver preenchido os descontos no cadastro.

---

## Ordem de execução

1. opencode: worktree → Fase 1 → Fase 2 → Fase 3 → Fase 5 (um TASK só, `TASK_folha_componentes_opencode.md`)
2. Claude: revisa diff, roda `uvicorn` local + `npx tsc --noEmit` + `npm run lint`, testa o fluxo (criar
   funcionário com descontos, ver líquido na aba, ver competência)
3. Claude: Fase 4 direto na working tree principal, testa Despesa Geral + fluxo
4. Claude: commit único (ou 2: back / front), mostra pro Atila, **Atila aprova deploy**
5. Deploy `git push origin master`
6. Cliente preenche descontos no cadastro dos 5 funcionários (usando as folhas)
7. Claude: Fase 6 (agosto) com aprovação

## Critério de pronto (o que Claude roda antes de aprovar)

- `cd backend && venv\Scripts\activate && uvicorn app.main:app --reload` sobe sem erro (migração aplica)
- `cd cmport-front && npx tsc --noEmit` → 0 erro
- `cd cmport-front && npm run lint` → sem erro novo
- Teste manual: funcionário novo com `salario_mensal=3000, adiantamento FIXO 1000, desconto_inss=250,
  desconto_irrf=50, desconto_contrib_assistencial=30, vt_desconto_percentual=6, emprestimo_parcela=100`
  → parcela "Salário" do mês = **1.390,00**; `mes_competencia` da parcela de salário = mês anterior ao
  vencimento; da parcela de adiantamento = mês do vencimento.
- Regressão: funcionário com descontos 0 e adiantamento NENHUM → parcela "Salário" = 3.000,00 (igual a hoje)
- Fase 4: `GET /despesas?origem=GERAL` não retorna despesa de categoria grupo FUNCIONARIO;
  `GET /despesas?origem=FUNCIONARIO` retorna as guias sem `funcionario_id`.
