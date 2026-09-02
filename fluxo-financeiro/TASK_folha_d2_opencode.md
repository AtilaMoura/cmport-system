# TASK opencode — scripts da Fase D2 (migração folha histórica)

> Você (opencode) só escreve os **4 scripts Python** descritos aqui. Nada mais.
> O Claude revisa cada script, roda em banco LOCAL e valida. **Você nunca roda em produção.**

## Regras (não quebrar)

1. **Só criar/editar estes 4 arquivos**, em `fluxo-financeiro/`:
   - `corrigir_cadastro_funcionarios_d2.py`
   - `remover_folha_solta_d2.py`
   - `migrar_folha_historica_d2.py`
   - `recategorizar_bucket_d2.py`
2. **Não tocar** em nada de `backend/app/` (models, routers, services, schemas), nem no frontend, nem em outros scripts de `fluxo-financeiro/`.
3. **Não decidir dados.** A lista do que fazer está congelada em `fluxo-financeiro/folha_d2_input.json`. Os scripts só leem esse arquivo e aplicam. Não inventar ID, valor, categoria, nem "melhorar" a lista.
4. Todo script:
   - `--ambiente local|producao` (default `local`), `--aplicar` (sem ele = dry-run que só imprime).
   - Conexão MySQL: `SET NAMES utf8mb4` em TODA conexão.
   - Local: PyMySQL direto (`DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` do `backend/.env`).
   - Produção: via SSH+docker igual `fluxo-financeiro/comparar_extrato_tec_agosto.py` (função `q(ssh, sql)` — copiar esse padrão).
   - Idempotente (rodar 2x não duplica / não quebra).
   - `sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")` no topo.
5. **Nunca `DELETE`.** Exclusão = `registrar_exclusao(...)` (snapshot) + `UPDATE ... SET deletado_em = NOW()`.
6. Comentários em português.

## Fonte de dados dos scripts

`fluxo-financeiro/folha_d2_input.json` tem as chaves:
- `cadastro_correcoes` — lista `{funcionario_id, set:{campo:valor}, variaveis:{campo:valor}, motivo}`
- `remover` — lista `{fonte:"mov_orfa"|"despesa_avulsa", id, data, valor, funcionario_id, descricao}`
- `criar` — lista `{linha_planilha, funcionario_id, cnpj:"CMPORT"|"TEC", categoria_id, valor, data_pagamento, data_vencimento, descricao, tipo_pagamento:"UNICO", banco_id:null, forma_pagamento:"PIX", observacao}`
- `recategorizar` — lista `{fonte, id, categoria_atual, categoria_nova_id, descricao}`
- `nao_tocar` — referência (o que jamais tocar)

CNPJ: `"CMPORT"` → `22761557000188`, `"TEC"` → `65756913000188`.

---

## Script 1 — `corrigir_cadastro_funcionarios_d2.py`

Para cada item de `cadastro_correcoes`:
- `UPDATE funcionarios SET <campos de "set">, atualizado_em=NOW() WHERE id=<funcionario_id> AND deletado_em IS NULL`
- se `variaveis` não vazio: `UPDATE funcionario_variaveis SET <campos>, atualizado_em=NOW() WHERE funcionario_id=<id>`
- `adiantamento_tipo` é enum: gravar a string `'FIXO'`.

Dry-run: para cada campo, imprimir `funcionario | campo | valor_atual → valor_novo`. Não alterar nada que já está com o valor certo.

---

## Script 2 — `remover_folha_solta_d2.py`

Para cada item de `remover`:

**Checagem de segurança (aborta o script inteiro se falhar em qualquer item):**
- registro existe e `deletado_em IS NULL`.
- `fonte="mov_orfa"`: `SELECT COUNT(*) FROM despesa_parcelas WHERE movimentacao_id=<id>` = 0; idem `fin_movimentacao_servicos`, `fin_movimentacao_orcamentos`, `fin_movimentacao_os_fornecedor`.
- `fonte="despesa_avulsa"`: nenhuma parcela da despesa está vinculada a `fin_movimentacao_servicos` de outra despesa (checar `despesa.id` só tem as próprias parcelas).
- valor no banco == `valor` do JSON (tolerância R$0,02). Se diferente, **abortar e reportar** (não deletar).

**Aplicar (`--aplicar`):**
1. `registrar_exclusao(db, tipo="fin_movimentacao"|"despesa", registro_id=id, dados=<SELECT * do registro como dict>, motivo="Fase D2 — folha solta substituída pela migração vinculada")`.
   - Em produção não dá pra chamar a função Python do app — replicar: `INSERT INTO registros_exclusoes (tipo_registro, registro_id, dados_completos, motivo_exclusao, usuario_exclusao, criado_em) VALUES (...)` com `dados_completos` = JSON do registro.
2. `fonte="mov_orfa"`: `UPDATE fin_movimentacoes SET deletado_em=NOW() WHERE id=<id>`.
3. `fonte="despesa_avulsa"`:
   - `UPDATE despesas SET deletado_em=NOW() WHERE id=<id>`
   - `UPDATE fin_movimentacoes SET deletado_em=NOW() WHERE id IN (SELECT movimentacao_id FROM despesa_parcelas WHERE despesa_id=<id> AND movimentacao_id IS NOT NULL)`
   - (parcelas: não tem `deletado_em`; ficam órfãs da despesa soft-deletada, que é como o resto do sistema já trata — ok.)
   - **Confirmado no snapshot (`snapshot_pre_folha_d2_20260902_1540.txt`):** as 5 despesas (296, 536, 658, 659, 660) têm 1 parcela PAGO cada, com `movimentacao_id` = 1588, 1828, 1950, 1951, 1952 respectivamente. Essas 5 movimentações também viram soft-delete. `registrar_exclusao` pra cada uma também.

Dry-run: listar os 78 com `fonte | id | data | valor | funcionário | descrição` + as checagens de segurança (PASS/FAIL por item).

---

## Script 3 — `migrar_folha_historica_d2.py`

Para cada item de `criar`:
1. `SELECT id FROM despesas WHERE observacao=<observacao> AND deletado_em IS NULL` — se achou, **pular** (idempotência).
2. `INSERT INTO despesas (descricao, funcionario_id, categoria_id, cnpj, tipo_pagamento, valor_total, total_parcelas, ativo, observacao, criado_em, atualizado_em)` VALUES (`descricao`, `funcionario_id`, `categoria_id`, `<cnpj resolvido>`, `'UNICO'`, `valor`, `1`, `1`, `observacao`, NOW(), NOW()) → pegar `despesa_id`.
3. `INSERT INTO despesa_parcelas (despesa_id, numero_parcela, total_parcelas, valor, data_vencimento, status, data_pagamento, banco_id, forma_pagamento, criado_em, atualizado_em)` VALUES (`despesa_id`, `1`, `1`, `valor`, `data_vencimento`, `'PAGO'`, `data_pagamento`, NULL, `'PIX'`, NOW(), NOW()) → pegar `parcela_id`.
4. `INSERT INTO fin_movimentacoes (data, descricao, valor, tipo, categoria_id, origem, status, cnpj_titular, forma_pagamento, criado_em, atualizado_em)` VALUES (`data_pagamento`, `descricao`, `valor`, `'SAIDA'`, `categoria_id`, `'MIGRACAO'`, `'PAGO'`, `<cnpj resolvido>`, `'PIX'`, NOW(), NOW()) → pegar `mov_id`.
   - ⚠️ conferir os nomes reais das colunas de `fin_movimentacoes` no `backend/app/models/fin_movimentacao_model.py` antes (campos `origem`, `status` são `String`, não enum). Se algum campo obrigatório faltar, **perguntar ao Claude**, não chutar.
5. `UPDATE despesa_parcelas SET movimentacao_id=<mov_id> WHERE id=<parcela_id>`.

Fazer tudo numa transação por lançamento (`COMMIT` a cada um, ou 1 `COMMIT` no fim — Claude decide na review).

Dry-run: resumo `mês × funcionário × categoria → contagem, soma` + total geral (tem que dar R$ 176.429,85 / 144 lançamentos).

---

## Script 4 — `recategorizar_bucket_d2.py`

Para cada item de `recategorizar` com `categoria_nova_id` não-nulo:
- `UPDATE despesas SET categoria_id=<categoria_nova_id>, atualizado_em=NOW() WHERE id=<id> AND deletado_em IS NULL`
- **não** mexer em valor, data, banco, funcionario_id.

Itens com `acao="REVISAR (sem alvo claro)"`: só listar, não alterar.

Dry-run: `id | categoria_atual → categoria_nova | descrição`.

---

## Entrega

Os 4 scripts + rodar cada um em `--ambiente local` dry-run e colar a saída. Claude revisa, roda `--aplicar` em local, valida com `conferir_folha_funcionarios.py`, e só então o Atila autoriza produção.
