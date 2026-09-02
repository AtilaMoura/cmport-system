# Reconciliação extratos bancários × sistema — Agosto/2026

_Sessão `session_01FsuRnHpRR7rwUrbT6oh7bs` — 02/09/2026. **PLANEJANDO, nada aplicado.**_

## Pedido do Atila (`anotação para IA.md`, linhas 194–203)

1. **Dashboard do fluxo** (`/fluxo-financeiro`): mostrar **total de entradas por banco**.
   Transferência interna de um banco pro outro **conta como entrada** no banco que recebeu.
2. Colocou os **extratos de agosto** pra cruzar com o sistema e achar **erro de lançamento do mês**.
3. **Prioridade:** bater **transferências + entradas**, por CNPJ e por banco. "iniciar o itau tec".
4. Criar estratégia, cruzar todos os valores, mostrar pro cliente e organizar o fechamento
   com base em sistema + extratos.

## O que já foi mapeado (02/09)

- **Extratos disponíveis** em `docs-e-planilhas/`:
  - `Extrato Inter.csv` — Inter CMPORT (conta 308310110), 01–31/08, saldo final 747,47. ~166 lançamentos. `;` separador, valor `-543` / `1.882,24` (pt-BR).
  - `Extrato Inter tec.csv` — Inter TEC (conta 524203806), saldo final 933,85. ~114 lançamentos.
  - `Extrato Itau.xlsx` — Itaú CMPORT (ag 8135 / cc 0017278-4). Aba `Lançamentos`, ~55 linhas. **Encoding quebrado (cp1252)** em cabeçalho e Razão Social — o parser tem que corrigir (`.encode('cp1252').decode('utf-8')`, igual `corrigir_encoding_historico.py`). Linhas agregadas tipo `BOLETOS RECEBIDOS 03/08S` (soma do dia, não item a item).
- **Transferência interna no sistema** = 1 linha `fin_movimentacoes` tipo `ENTRADA`,
  `banco_origem_id` = de onde saiu, `banco_id` = onde entrou, categoria "Outros Recebimentos",
  descrição "Pagar Contas". **16 lançamentos em agosto** (ids 2002–2016), quase todos
  TEC→CMPORT. Como já são `ENTRADA` com `banco_id` = destino, um "total de entradas por
  banco" agrupado por `banco_id` **já inclui** as transferências recebidas.
  - ⚠️ Alguns têm `banco_origem_id` = `banco_id` = CMPORT (origem = destino). Conferir no extrato
    se a origem real era a TEC (provável erro de digitação).
  - Do lado da SAÍDA, memória `CATEGORIZACAO_DESPESAS.md` mostra "Pix Inter para Inter Tec
    (Pagar Contas)" como SAIDA — ou seja transferência pode estar lançada nos 2 lados ou só 1.
- Script base: `comparar_extrato_tec_agosto.py` (commit `cab1e02`) — já casa extrato Inter TEC
  × entradas TEC (boletos pagos + recibos + `fin_movimentacoes` ENTRADA na conta 4). Estender.
- Bancos cadastrados: Itaú/Inter/Bradesco = CMPORT · Inter/BTG = TEC. **Não existe "Itaú TEC".**

## DÚVIDAS ABERTAS (pro Atila) — bloqueiam o passo 2

1. **"iniciar o itau tec" — qual conta?** Não existe conta Itaú da TEC no sistema.
   Era **Inter TEC**? **Itaú CMPORT**? Ou falta cadastrar uma conta Itaú da TEC?
2. **Falta o extrato do BTG (TEC)?** Teve movimento nessa conta em agosto?
3. Extrato Itaú vem **agregado por dia** ("BOLETOS RECEBIDOS 03/08S = 1339,68"), não item a item.
   Pro cruzamento fino a gente casa a soma do dia, ou você consegue exportar detalhado?

## Plano (validar com o Atila antes de executar)

### Passo 1 — Parser único dos extratos (`ler_extratos_agosto.py`, novo)
Normaliza os 3 arquivos num formato só: `{conta, data, descricao, valor(+/-), tipo_extrato}`.
- Corrige encoding do Itaú.
- Classifica cada linha: `ENTRADA` · `SAIDA` · `TRANSFERENCIA_ENTRE_CONTAS` (Pix entre 308310110 ↔ 524203806) · `TARIFA` · `RENDIMENTO` · `DEBITO_CARTAO`.
- Só leitura, nada de banco.

### Passo 2 — Cruzamento sistema × extrato, por conta (`comparar_extratos_agosto.py`, estende o `_tec_`)
Pra cada conta (Inter CMPORT, Inter TEC, Itaú CMPORT [, BTG?]):
- Sistema = boletos PAGO + recibos ENTRADA PAGO + `fin_movimentacoes` ENTRADA/SAIDA com `banco_id` daquela conta, mês 8.
- Casa por valor (±R$0,02) e data (±3 dias).
- 3 listas: **(a) no extrato, não no sistema** (falta lançar / lançado sem banco) ·
  **(b) no sistema, não no extrato** (conta errada / valor errado / duplicado) · **(c) bate**.
- Confere o **saldo**: saldo inicial + Σ entradas − Σ saídas do sistema == saldo final do extrato.

### Passo 3 — Transferências entre contas
- Lista as transferências internas do extrato (Pix 308310110 ↔ 524203806) e do sistema (`banco_origem_id` not null).
- Parear: cada transferência deve bater nos **dois** extratos (saiu de um, entrou no outro) e ter
  1 lançamento no sistema com origem+destino certos.
- Corrigir os que têm origem = destino.

### Passo 4 — Relatório pro cliente
Planilha (ou Artifact) com: de-para linha a linha por conta, itens não batidos com o motivo provável,
e o saldo reconciliado de cada conta. Base pro fechamento de agosto.

### Passo 5 — Dashboard `/fluxo-financeiro`
Card/tabela **"Entradas por banco"** no mês: por conta, Σ das entradas (`fluxo_mensal` linhas +
`fin_movimentacoes` ENTRADA), **incluindo transferência recebida**, com o quanto veio de
transferência interna destacado. Backend: provável novo endpoint ou campo no `fluxo_mensal`.

## Regras

- **Nada toca produção sem aprovação do Atila, item a item** (mesmo padrão dos lotes B1:
  script → dry-run → snapshot/backup → `--aplicar`).
- Scripts rodam da máquina local; `--ambiente producao` via SSH (`docker exec cmport_db mysql`),
  sem copiar nada pro servidor.
- Backup + commit são função do Claude.
- MCP `mysql-cmport` = banco **local** (não produção) — cuidado ao medir escopo.
