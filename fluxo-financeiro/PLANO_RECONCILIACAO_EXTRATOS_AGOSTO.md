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

## DÚVIDAS — RESPONDIDAS pelo Atila (02/09, `anotação para IA.md` l.221–223)

1. **"iniciar o itau tec"** → era **Inter TEC** (erro de nome). Conta 524203806, banco_id 4.
2. **BTG (TEC)** → **não teve entrada** em agosto. Fora do escopo da reconciliação de entradas.
3. **Extrato Itaú agregado por dia** → seguir assim; casar a soma do dia (`BOLETOS RECEBIDOS DD/08S`)
   com a soma dos boletos daquele dia no sistema. "pode fazer isso".

## PASSO 1 — FEITO (02/09) — `ler_extratos_agosto.py`

Parser rodou, os **3 extratos fecham 100%** contra o próprio saldo corrido:

| Conta | banco_id | Lçtos | Σ entradas | Σ transf. internas | Σ saídas | saldo ini→fim |
|---|---|---|---|---|---|---|
| Inter CMPORT | 2 | 165 | 40.915,99 (66) | −12.786,75 (18) | −27.592,10 | 551,96 → 1.089,10 ✅ |
| Inter TEC | 4 | 113 | 28.395,04 (48) | +12.786,75 (18) | −47.178,92 | 6.740,19 → 743,06 ✅ |
| Itaú CMPORT | 1 | 39 | 10.412,94 (9) + 0,04 rend | −2.625,16 (7) | −6.793,61 | −342,35 → −92,32 ✅ |

- ⚠️ O campo "Saldo:" do cabeçalho do Inter é **saldo ao vivo** (dia da geração, já com movimento
  de setembro) — **não** serve pra fechar agosto. O parser usa a coluna Saldo do último lançamento.
- Transferências internas Inter↔Inter: **−12.786,75 de um lado, +12.786,75 do outro — casam exato.**
- Itaú manda Pix pra "C&M PORT"/"CMPORT" que caem ora na Inter CMPORT, ora na Inter TEC (Passo 3).
- Saída: `fluxo-financeiro/extratos_agosto_normalizado.json` (317 lançamentos).

## Plano (validar com o Atila antes de executar)

### Passo 1 — Parser único dos extratos (`ler_extratos_agosto.py`, novo)
Normaliza os 3 arquivos num formato só: `{conta, data, descricao, valor(+/-), tipo_extrato}`.
- Corrige encoding do Itaú.
- Classifica cada linha: `ENTRADA` · `SAIDA` · `TRANSFERENCIA_ENTRE_CONTAS` (Pix entre 308310110 ↔ 524203806) · `TARIFA` · `RENDIMENTO` · `DEBITO_CARTAO`.
- Só leitura, nada de banco.

### Passo 2 — Cruzamento sistema × extrato (ENTRADAS), por conta — FEITO (02/09) — `comparar_extratos_agosto.py`
Resultado completo em `RESULTADO_PASSO2_EXTRATOS_AGOSTO.md` · versão cliente em
`RECONCILIACAO_AGOSTO_CLIENTE.html` (Artifact d0556b20). **4 ajustes fecham os 3 CNPJs a 100%**
(revisado 03/09 contra a planilha mestre):
- **Itaú CMPORT: 100%** (Δ 0,00, inclusive os 3 dias agregados).
- **Inter CMPORT (2):** boleto 284 → `banco_id=2` (baixa automática Inter já feita) · Fortezza
  590,46 (31/08) → dar baixa no boleto EMABERTO (NF 7883 **ou** 7895, provável duplicata).
- **Inter TEC (2):** recibo 61 e 62 (Jussara, R$ 70 + R$ 50) → `banco_id` de 2 para 4
  (confirmado na planilha aba "Entradas e SAIDAS" r425/r426 + extrato Inter TEC).
- **QUISI 826,97 (11/08): NÃO é entrada** — devolução de pagamento à contabilidade
  (estorno + Pix refeito 12/08); despesa já lançada (`mov 1251`).
- **Achado:** parser do Passo 1 não classifica transferência que sai do Itaú (chega como
  "Pix recebido CMPORT..."). Script já cruzou e confirmou que estão lançadas. Passo 1
  precisa reclassificar antes do dashboard (Passo 5), senão conta transferência como receita.
- **Pendente deste passo:** conferência de saldo (precisa carregar SAÍDAS) — fazer junto
  com o cruzamento de saídas.

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
