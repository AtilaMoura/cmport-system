# TASK opencode — Componentes da folha (descontos + competência) no módulo Funcionário

Você (opencode) implementa **Fases 1, 2, 3 e 5**. O Claude revisa cada arquivo, roda os testes e valida.
**Você nunca roda em produção. Você só mexe nos arquivos listados abaixo.**

## Regras (não quebrar)

1. **Só editar estes arquivos:**
   - `backend/app/main.py` (2 pontos: lista `stmts` de `_run_migrations`, lista `CATEGORIAS` de `_seed_categorias_funcionario`)
   - `backend/app/models/funcionario_model.py`
   - `backend/app/models/despesa_model.py`
   - `backend/app/schemas/funcionario_schema.py`
   - `backend/app/schemas/despesa_schema.py`
   - `backend/app/services/funcionario_service.py`
   - `backend/app/services/despesa_service.py`
   - `cmport-front/app/funcionarios/page.tsx`
   - `cmport-front/app/fluxo-financeiro/funcionarios/page.tsx`
2. **Não tocar** em router, repository, nem em qualquer outro arquivo. **NÃO** mexer em
   `despesa_repository.py` (é a Fase 4, o Claude faz).
3. Camadas do projeto: schema → model → repository → service → router. Nunca pular.
4. **Soft delete sempre** — nunca `DELETE` físico. (não se aplica muito aqui, mas vale a regra)
5. **Sem hardcode de credencial.**
6. Comentários **em português**.
7. TypeScript no front: `npx tsc --noEmit` tem que dar **zero erro**.
8. Additive puro: código existente que não é citado aqui **não muda**.
9. Idempotência das migrações: só adicionar linhas no fim da lista `stmts`, o loop já engole erro de
   "coluna já existe".

---

## Contexto — como o módulo funciona hoje

- `funcionario_variaveis` guarda os valores correntes (salário, adiantamento, VT, VR, plantão, HE).
- `FuncionarioService.sincronizar_recorrentes` transforma cada componente numa **Despesa RECORRENTE**
  `(funcionario_id, categoria_id do grupo FUNCIONARIO)`. O valor da variável é a **sugestão**; a parcela
  mensal é editável na hora de pagar. O scheduler existente gera as parcelas.
- `despesa_parcelas` tem: id, despesa_id, numero_parcela, total_parcelas, valor, data_vencimento, status
  (PENDENTE/PAGO), data_pagamento, banco_id, forma_pagamento, movimentacao_id.
- A aba "Funcionários — Folha do Mês" (`cmport-front/app/fluxo-financeiro/funcionarios/page.tsx`) lista as
  parcelas do mês agrupadas por funcionário.

---

## FASE 1 — Dados

### 1.1 `backend/app/main.py` — migrações

Na função `_run_migrations()`, a lista `stmts` termina com uma linha
`"ALTER TABLE fin_saldo_inicial MODIFY valor DECIMAL(12,2) NOT NULL DEFAULT 0",` e depois `]`.
**Adicionar, imediatamente antes do `]`:**

```python
        # Folha — descontos do funcionário (memória de cálculo do líquido) + mês de competência
        "ALTER TABLE funcionario_variaveis ADD COLUMN desconto_inss DECIMAL(10,2) NOT NULL DEFAULT 0",
        "ALTER TABLE funcionario_variaveis ADD COLUMN desconto_irrf DECIMAL(10,2) NOT NULL DEFAULT 0",
        "ALTER TABLE funcionario_variaveis ADD COLUMN desconto_contrib_assistencial DECIMAL(10,2) NOT NULL DEFAULT 0",
        "ALTER TABLE funcionario_variaveis ADD COLUMN vt_desconto_percentual DECIMAL(5,2) NOT NULL DEFAULT 0",
        "ALTER TABLE funcionario_variaveis ADD COLUMN emprestimo_parcela DECIMAL(10,2) NOT NULL DEFAULT 0",
        "ALTER TABLE funcionario_variaveis ADD COLUMN emprestimo_saldo DECIMAL(10,2) NOT NULL DEFAULT 0",
        "ALTER TABLE despesa_parcelas ADD COLUMN mes_competencia DATE NULL",
```

### 1.2 `backend/app/main.py` — categorias

Na função `_seed_categorias_funcionario()`, a lista `CATEGORIAS` termina com
`("Passagem/reembolso pessoal", 15),`. **Adicionar depois:**

```python
        ("IRRF / DARF (guia recolhida)", 16),
        ("Contribuicao assistencial (guia recolhida)", 17),
```

### 1.3 `backend/app/models/funcionario_model.py`

Na classe `FuncionarioVariaveis`, logo depois da linha
`encargos_percentual = Column(Numeric(5, 2, asdecimal=False), default=0, nullable=False)`
adicionar:

```python
    # Descontos da folha — memória de cálculo do líquido sugerido do salário.
    # NÃO viram lançamento próprio; só reduzem o valor sugerido do componente "Salário".
    desconto_inss = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)
    desconto_irrf = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)
    desconto_contrib_assistencial = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)
    vt_desconto_percentual = Column(Numeric(5, 2, asdecimal=False), default=0, nullable=False)  # ex.: 6 = 6% sobre o salário base
    emprestimo_parcela = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)     # parcela mensal descontada em folha
    emprestimo_saldo = Column(Numeric(10, 2, asdecimal=False), default=0, nullable=False)       # informativo
```

### 1.4 `backend/app/models/despesa_model.py`

Na classe `DespesaParcela`, depois de
`forma_pagamento = Column(String(20), nullable=True)` adicionar:

```python
    # Mês de referência da folha (competência). Ex.: salário pago em set/2026 tem competência ago/2026.
    # Só o dia 1 do mês importa. Preenchido pelo motor da folha; editável.
    mes_competencia = Column(Date, nullable=True)
```

(o `Date` já está importado no topo do arquivo)

### 1.5 `backend/app/schemas/funcionario_schema.py`

Na classe `FuncionarioVariaveisIn`, depois de
`encargos_percentual: Decimal = Decimal("0")` adicionar:

```python
    desconto_inss: Decimal = Decimal("0")
    desconto_irrf: Decimal = Decimal("0")
    desconto_contrib_assistencial: Decimal = Decimal("0")
    vt_desconto_percentual: Decimal = Decimal("0")
    emprestimo_parcela: Decimal = Decimal("0")
    emprestimo_saldo: Decimal = Decimal("0")
```

`FuncionarioVariaveisResponse` herda de `FuncionarioVariaveisIn` — não mexer.

### 1.6 `backend/app/schemas/despesa_schema.py`

- Na classe `DespesaParcelaResponse`, depois de `forma_pagamento: Optional[str] = None` adicionar:
  ```python
      mes_competencia: Optional[date] = None
  ```
- Na classe `DespesaCreate`, depois de `observacao: Optional[str] = None` adicionar:
  ```python
      mes_competencia: Optional[date] = None  # usado só no lançamento avulso (UNICO) da folha
  ```
  (`date` já está importado no topo)

---

## FASE 2 — Cálculo do líquido sugerido

Arquivo: `backend/app/services/funcionario_service.py`, dentro de `sincronizar_recorrentes`.

Hoje o trecho que monta o estado desejado é:

```python
        if ativo and v is not None:
            salario = float(getattr(v, "salario_mensal", 0) or 0)
            for cat_nome, attr_valor, attr_dia, prefixo, gatilho in FuncionarioService._COMPONENTES:
                cat_id = cats.get(cat_nome)
                if not cat_id:
                    continue
                valor = float(getattr(v, attr_valor, 0) or 0)
                if gatilho == "salario" and salario <= 0:
                    continue
                ...
                dia = _dia_ok(getattr(v, attr_dia, None) or getattr(v, "dia_pagamento_salario", None))
                desejado.append((cat_id, valor, dia, f"{prefixo} — {func.nome}"))
```

**Mudança:** quando o componente for o de salário (`gatilho == "salario"`), o `valor` passa a ser o
**líquido sugerido** e a `descricao`/observação ganha a memória de cálculo.

1. Antes do `for` dos componentes, calcular os descontos uma vez:

```python
            salario = float(getattr(v, "salario_mensal", 0) or 0)
            # descontos da folha (memória de cálculo do líquido — não viram lançamento próprio)
            d_inss = float(getattr(v, "desconto_inss", 0) or 0)
            d_irrf = float(getattr(v, "desconto_irrf", 0) or 0)
            d_contrib = float(getattr(v, "desconto_contrib_assistencial", 0) or 0)
            vt_pct = float(getattr(v, "vt_desconto_percentual", 0) or 0)
            d_vt = round(salario * vt_pct / 100.0, 2) if vt_pct > 0 else 0.0
            d_emprest = float(getattr(v, "emprestimo_parcela", 0) or 0)
            adiant_fixo = float(getattr(v, "adiantamento_valor", 0) or 0) \
                if getattr(v, "adiantamento_tipo", "NENHUM") == "FIXO" else 0.0
            liquido_sugerido = max(
                round(salario - d_inss - d_irrf - d_contrib - d_vt - d_emprest - adiant_fixo, 2),
                0.0,
            )
            # texto legível só com as linhas que têm valor
            _partes = [f"salário {salario:,.2f}"]
            for _rot, _v in [("INSS", d_inss), ("IRRF", d_irrf), ("contrib.", d_contrib),
                             (f"VT {vt_pct:g}%", d_vt), ("empréstimo", d_emprest),
                             ("adiantamento", adiant_fixo)]:
                if _v > 0:
                    _partes.append(f"− {_rot} {_v:,.2f}")
            memoria_salario = (
                "Sugestão = " + " ".join(_partes) + f" = {liquido_sugerido:,.2f}. "
                "Ajuste com a folha real ao marcar como pago."
            ).replace(",", "X").replace(".", ",").replace("X", ".")  # formato pt-BR
```

2. No `for` dos componentes, quando `gatilho == "salario"`:

```python
                if gatilho == "salario":
                    if salario <= 0:
                        continue
                    valor = liquido_sugerido
                else:
                    valor = float(getattr(v, attr_valor, 0) or 0)
                    if gatilho == "adiantamento" and getattr(v, "adiantamento_tipo", "NENHUM") == "NENHUM":
                        continue
                    if gatilho == "valor" and valor <= 0:
                        continue
                    if gatilho.startswith("flag:") and not getattr(v, gatilho.split(":", 1)[1], False):
                        continue
```

(ou seja: mantém a lógica dos gatilhos que existe hoje, só troca o `valor` do salário e move o
`if gatilho == "salario" and salario <= 0: continue` pra dentro desse ramo)

3. Guardar a memória de cálculo: onde a despesa do componente é **criada** (`d = Despesa(... observacao=...)`),
   e onde é **atualizada**, se `cat_nome == "Salario (folha mensal)"`, gravar `observacao = memoria_salario`.
   Na criação hoje é `observacao="Gerada automaticamente das variáveis do funcionário."` — trocar por
   `memoria_salario` só no caso do salário; os outros componentes continuam com o texto padrão.
   Na atualização, adicionar: se for o salário e `d.observacao != memoria_salario`, setar e marcar `mudou = True`.

   Para saber qual `cat_nome` está sendo processado no laço de baixo (que hoje itera `desejado` só com
   `(cat_id, valor, dia, descricao)`), inclua o `cat_nome` na tupla de `desejado`:
   `desejado.append((cat_id, valor, dia, f"{prefixo} — {func.nome}", cat_nome))` e ajuste os 2 laços que
   consomem `desejado` para desempacotar 5 itens. `cat_ids_desejados = {c for c, *_ in desejado}` continua ok.

**REGRESSÃO OBRIGATÓRIA:** com `desconto_inss = desconto_irrf = desconto_contrib_assistencial =
vt_desconto_percentual = emprestimo_parcela = 0` e `adiantamento_tipo != "FIXO"`, então
`liquido_sugerido == salario` — o valor gerado é idêntico ao de hoje.

---

## FASE 3 — Mês de competência

### 3.1 `funcionario_service.py::sincronizar_recorrentes`

Hoje, nos dois ramos (criar despesa nova / atualizar existente), chama-se
`DespesaService._garantir_parcelas_recorrente(db, d)`. **Depois** dessa chamada, em ambos os ramos,
preencher a competência das parcelas PENDENTE com `mes_competencia IS NULL`:

```python
                # competência: adiantamento = mês do próprio vencimento;
                # salário e demais componentes = mês anterior ao vencimento
                _offset = 0 if cat_nome == "Adiantamento de salario" else 1
                for _p in db.query(DespesaParcela).filter(
                    DespesaParcela.despesa_id == d.id,
                    DespesaParcela.status == StatusParcelaDespesa.PENDENTE,
                    DespesaParcela.mes_competencia.is_(None),
                ).all():
                    base = _p.data_vencimento.replace(day=1)
                    _p.mes_competencia = base - relativedelta(months=_offset)
                db.commit()
```

Imports no topo do arquivo: já tem `from datetime import datetime, date`. Adicionar
`from dateutil.relativedelta import relativedelta`. `DespesaParcela` e `StatusParcelaDespesa` já estão
importados (`from app.models.despesa_model import ...`).

### 3.2 `backend/app/services/despesa_service.py::criar`

No ramo `if req.tipo_pagamento == "UNICO":`, a `DespesaParcela` é criada assim:

```python
            despesa.parcelas.append(DespesaParcela(
                numero_parcela=1,
                total_parcelas=1,
                valor=req.valor_total,
                data_vencimento=req.data_primeira_parcela,
                status=StatusParcelaDespesa.PENDENTE,
            ))
```

Adicionar `mes_competencia=req.mes_competencia,` nessa criação (fica `None` quando não vier no request —
comportamento inalterado pros outros usos).

---

## FASE 5 — Frontend

### 5.1 `cmport-front/app/funcionarios/page.tsx`

**Interface `Variaveis`** — adicionar os 6 campos:
```ts
  desconto_inss: number | string;
  desconto_irrf: number | string;
  desconto_contrib_assistencial: number | string;
  vt_desconto_percentual: number | string;
  emprestimo_parcela: number | string;
  emprestimo_saldo: number | string;
```

**`varVazia()`** — adicionar:
```ts
  desconto_inss: '', desconto_irrf: '', desconto_contrib_assistencial: '',
  vt_desconto_percentual: '', emprestimo_parcela: '', emprestimo_saldo: '',
```

**`abrirEdicao`** (bloco `variaveis: f.variaveis ? { ... } : varVazia()`) — adicionar:
```ts
            desconto_inss: f.variaveis.desconto_inss ?? '',
            desconto_irrf: f.variaveis.desconto_irrf ?? '',
            desconto_contrib_assistencial: f.variaveis.desconto_contrib_assistencial ?? '',
            vt_desconto_percentual: f.variaveis.vt_desconto_percentual ?? '',
            emprestimo_parcela: f.variaveis.emprestimo_parcela ?? '',
            emprestimo_saldo: f.variaveis.emprestimo_saldo ?? '',
```

**`salvar` (payload `variaveis`)** — adicionar:
```ts
          desconto_inss: num(form.variaveis.desconto_inss),
          desconto_irrf: num(form.variaveis.desconto_irrf),
          desconto_contrib_assistencial: num(form.variaveis.desconto_contrib_assistencial),
          vt_desconto_percentual: num(form.variaveis.vt_desconto_percentual),
          emprestimo_parcela: num(form.variaveis.emprestimo_parcela),
          emprestimo_saldo: num(form.variaveis.emprestimo_saldo),
```

**Seção nova no modal** — depois do bloco `<div className="pt-3 border-t ...">` das "Variáveis da folha"
(o que termina com o `<p>` "Salário, adiantamento, vales, plantão e hora extra geram uma pendência..."),
adicionar outro bloco irmão:

```tsx
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-xs font-bold text-slate-500 uppercase mb-2">Descontos (folha)</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">INSS / mês (R$)</label>
                    <input type="number" step="0.01" min="0" value={form.variaveis.desconto_inss}
                      onChange={e => setV({ desconto_inss: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">IRRF / mês (R$)</label>
                    <input type="number" step="0.01" min="0" value={form.variaveis.desconto_irrf}
                      onChange={e => setV({ desconto_irrf: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Contribuição assistencial (R$)</label>
                    <input type="number" step="0.01" min="0" value={form.variaveis.desconto_contrib_assistencial}
                      onChange={e => setV({ desconto_contrib_assistencial: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Desconto VT (% do salário)</label>
                    <input type="number" step="0.1" min="0" placeholder="6" value={form.variaveis.vt_desconto_percentual}
                      onChange={e => setV({ vt_desconto_percentual: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Empréstimo — parcela / mês (R$)</label>
                    <input type="number" step="0.01" min="0" value={form.variaveis.emprestimo_parcela}
                      onChange={e => setV({ emprestimo_parcela: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Empréstimo — saldo (R$)</label>
                    <input type="number" step="0.01" min="0" value={form.variaveis.emprestimo_saldo}
                      onChange={e => setV({ emprestimo_saldo: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Os descontos reduzem o valor sugerido do salário na folha do mês. O valor real você confere
                  com a folha na hora de marcar como pago.
                </p>
              </div>
```

### 5.2 `cmport-front/app/fluxo-financeiro/funcionarios/page.tsx`

- Interface `Parcela` — adicionar `mes_competencia: string | null;`
- Interface `Despesa` — já tem `descricao` e `categoria_id`; adicionar `observacao?: string | null;`
- Na linha de cada parcela, onde hoje aparece `venc {fmtData(l.parcela.data_vencimento)}`, adicionar depois,
  se `l.parcela.mes_competencia` existir:
  ` · comp. {new Date(l.parcela.mes_competencia + 'T00:00:00').toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' })}`
- No item cujo `l.despesa.descricao` começa com `"Salário"`, se `l.despesa.observacao` existir, adicionar
  abaixo da linha um `<details className="mt-1 text-[11px] text-slate-400"><summary>ver cálculo</summary>{l.despesa.observacao}</details>`

Não mexer em mais nada dessa tela (o bloco "Encargos da folha" é Fase 4, o Claude faz).

---

## Entrega

1. Fazer as mudanças das Fases 1, 2, 3 e 5.
2. Rodar `cd cmport-front && npx tsc --noEmit` e colar a saída (tem que ser 0 erro).
3. Listar os arquivos alterados (`git status` + `git diff --stat`).
4. **Não commitar. Não fazer push. Não rodar nada em produção.** O Claude revisa, testa o backend
   localmente e valida os números antes de qualquer commit.
