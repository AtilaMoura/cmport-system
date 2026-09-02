# Fase D parte 2 — Migração da folha histórica (jan–jul/2026)

_Plano montado 02/09/2026 — sessão `session_011C7k6iJC2MiR3MVwYikDAA`. **NADA aplicado.** Aguardando o Atila mandar iniciar._

## Objetivo

Tirar a folha de pagamento de jan–jul/2026 do estado "solto" em que está hoje (movimentações sem vínculo, categorias legadas, nomes com typo, abril duplicado) e deixá-la **vinculada a cada funcionário + categoria nova**, com estrutura uniforme (`Despesa` UNICO → `DespesaParcela` PAGO → `fin_movimentacao`), igual ao que a folha automática produz de agosto/setembro em diante.

## Fonte de verdade

| Arquivo | Papel |
|---|---|
| `despesas_funcionario.json` | **fonte dos valores** (caixa — o que saiu da conta). 144 lançamentos jan–jul com funcionário identificado. |
| `controle_funcionarios_2026_itens.csv` | **conferência** — total do contracheque por funcionário/mês (ver pendências 1–2). |
| `mapa_folha_funcionarios.json` | classificação de cada registro de produção (folha c/ pessoa · bucket · falso-positivo). |
| `folha_d2_input.json` | **lista congelada** do que deletar / criar / recategorizar. Gerada por `preparar_folha_d2.py`. O executor **não decide nada** — só aplica esta lista. |

## Pré-requisito

**Cliente respondeu as pendências de `PENDENCIAS_FOLHA_CLIENTE.md`** — principalmente:
- item 1 (folha entra pelo bruto/caixa) → se a resposta for "líquido", o plano muda e o `folha_d2_input.json` precisa ser regerado.
- item 2 (valores de julho de André/Welligton/Fabiana/Gabriel).
- item 10 (cancelar parcelas automáticas de agosto).

---

## Passos

### Passo 0 — Backup + snapshot _(Claude, não o executor)_

```
cd backend && ./venv/Scripts/python.exe ../fluxo-financeiro/backup_bd.py --producao --label pre_folha_d2
```
+ snapshot dos IDs que serão tocados (query SELECT dos 78 a remover + 26 a recategorizar + estado dos 7 funcionários) → `snapshot_pre_folha_d2_<ts>.txt`.

### Passo 1 — Corrigir cadastro dos funcionários

Script **`corrigir_cadastro_funcionarios_d2.py`** — lê `folha_d2_input.json["cadastro_correcoes"]`.

- Luis (id 2): `data_admissao=2025-02-14`, `variaveis.adiantamento_tipo=FIXO`, `adiantamento_valor=1680.50`
- Welligton (id 3): `data_admissao=2024-07-08`, `adiantamento_tipo=FIXO`, `adiantamento_valor=1739.38` _(ou 2028 — confirmar item 1/6)_
- Pedro (id 4): `data_admissao=2025-06-02`
- Almira (id 7): `data_admissao=2026-03-23`

Só `UPDATE` nos campos listados. **Não** mexe em salário, nome, cnpj, nem nos outros 3 funcionários.
Dry-run imprime o antes/depois de cada campo → Claude confere → `--aplicar`.

⚠️ Mudar `adiantamento_tipo` de VARIAVEL→FIXO faz a **folha automática** passar a gerar uma parcela de adiantamento por mês. Isso é o comportamento desejado daqui pra frente, mas confirmar que não cria parcela retroativa (o motor só gera pra frente).

### Passo 2 — Soft-delete da folha solta jan–jul

Script **`remover_folha_solta_d2.py`** — lê `folha_d2_input.json["remover"]` (78 IDs: 73 `fin_movimentacoes` + 5 `despesas`).

Para **cada** id da lista:
1. `SELECT` o registro e **abortar tudo** se:
   - já tem `deletado_em` preenchido, ou
   - `fin_movimentacoes`: tem `despesa_parcela` apontando pra ele (`movimentacao_id`), ou vínculo em `fin_movimentacao_servicos/_orcamentos/_os_fornecedor`, ou
   - `despesas`: tem parcela com `status=PAGO` já conciliada com outra coisa.
2. `registrar_exclusao(db, tipo, id, dados_completos_json, motivo="Fase D2 — folha solta substituída pela migração vinculada")` → grava snapshot em `registros_exclusoes`.
3. **Soft delete:** `UPDATE ... SET deletado_em = NOW()` (nunca `DELETE`).
   - `despesas`: soft-delete a despesa **e** suas parcelas **e** as `fin_movimentacoes` das parcelas.

Dry-run lista os 78 com id/data/valor/descrição/funcionário → Claude confere **1 a 1** contra `folha_d2_input.json` → `--aplicar`.

**Não toca:** nada com data em 2026-08+, nada da lista `nao_tocar` (falsos-positivos, folha-sem-pessoa, parcelas recorrentes, bucket).

### Passo 3 — Recriar a folha jan–jul

Script **`migrar_folha_historica_d2.py`** — lê `folha_d2_input.json["criar"]` (144 lançamentos).

Para **cada** lançamento:
1. Idempotência: pular se já existe `Despesa` com a mesma `observacao` ("...planilha linha N") e `deletado_em IS NULL`.
2. Resolver `cnpj`: `"CMPORT"` → `22761557000188`, `"TEC"` → `65756913000188`.
3. `INSERT Despesa`:
   - `descricao`, `funcionario_id`, `categoria_id`, `cnpj`, `tipo_pagamento='UNICO'`,
   - `valor_total = valor`, `total_parcelas=1`, `ativo=1`,
   - `observacao` (linha da planilha), `criado_em/atualizado_em = NOW()`.
4. `INSERT DespesaParcela`: `numero_parcela=1`, `total_parcelas=1`, `valor`, `data_vencimento`,
   `status='PAGO'`, `data_pagamento`, `banco_id=NULL`, `forma_pagamento='PIX'`, timestamps.
5. `INSERT fin_movimentacoes`: `tipo='SAIDA'`, `data=data_pagamento`, `descricao`, `valor`,
   `categoria_id`, `cnpj_titular=cnpj`, `status='PAGO'`, `origem='MIGRACAO'`, `forma_pagamento='PIX'`,
   `deletado_em=NULL`, timestamps.
6. `UPDATE despesa_parcelas SET movimentacao_id = <id da mov>`.

Dry-run: resumo por mês × funcionário × categoria + total geral → Claude confere contra `conferir_folha_funcionarios.py` (a coluna PRODUÇÃO tem que passar a bater com JSON/FLUXO) → `--aplicar`.

### Passo 4 — Recategorizar encargos/convênio jan–jul _(opcional, separável)_

Script **`recategorizar_bucket_d2.py`** — lê `folha_d2_input.json["recategorizar"]` (26 IDs).
Só `UPDATE despesas SET categoria_id = <nova>` (95–109). **Não** mexe em valor, data, banco, nem vincula funcionário. Dry-run → conferir → `--aplicar`.

### Passo 5 — Revalidação _(Claude)_

1. `conferir_folha_funcionarios.py` → seção [1]: coluna PRODUÇÃO tem que bater com JSON/FLUXO em jan–jul (`json-prod ≈ 0`); seção [2] "folha solta com pessoa" pré-agosto tem que zerar.
2. `validar_fluxo_todos_meses.py --empresa tec` e `--empresa cmport` → conferir que os totais mensais de despesa batem com a planilha mestre.
3. `identificar_pendencias_mes.py` nos meses tocados.
4. Testar na tela: `GET /financeiro/fluxo-mensal`, tela de Funcionários (modal `DespesasFuncionario`) mês a mês.
5. Push do deploy **não é necessário** — mudança é 100% em dados de produção via SSH. Os scripts vão pro git como histórico.

---

## Divisão de trabalho (padrão Cérebro + Executor)

| Quem | Faz |
|---|---|
| **Claude** | este plano · `folha_d2_input.json` (já pronto) · Passo 0 (backup) · revisar cada script do opencode · rodar dry-run em **local** (cópia de produção) · validar · Passo 5 · commit |
| **opencode** (`opencode/<modelo>-free`, janela visível) | escrever os 3–4 scripts (`corrigir_cadastro_funcionarios_d2.py`, `remover_folha_solta_d2.py`, `migrar_folha_historica_d2.py`, `recategorizar_bucket_d2.py`) seguindo `TASK_folha_d2_opencode.md` |
| **Atila** | responder pendências com a cliente · autorizar cada `--aplicar` em produção |

**opencode NÃO:** roda nada em produção · mexe em model/router/service/schema/frontend · muda a lógica da folha automática · decide o que deletar/criar (a lista é o `folha_d2_input.json`, congelado) · toca qualquer arquivo fora dos 4 scripts nomeados.

Se o modelo free do opencode travar (já aconteceu, 502), **Claude escreve os scripts direto** — mesmo padrão da linha "A1 parte 2" no `anotação para IA.md`.

---

## Ordem de aplicação em produção (cada uma com "ok" do Atila)

```
Passo 0  backup + snapshot
Passo 1  corrigir_cadastro_funcionarios_d2.py --ambiente producao --aplicar
Passo 2  remover_folha_solta_d2.py          --ambiente producao --aplicar
Passo 3  migrar_folha_historica_d2.py       --ambiente producao --aplicar
Passo 4  recategorizar_bucket_d2.py         --ambiente producao --aplicar   (opcional)
Passo 5  revalidação (Claude)
```

Rollback: `backup_producao_pre_folha_d2_<ts>.sql` restaura tudo. Passo 2 é soft-delete (dá pra reverter `deletado_em` sem o backup).
