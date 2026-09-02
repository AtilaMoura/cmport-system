# Passo 2 — Cruzamento sistema × extrato (entradas), Agosto/2026

_Rodado 02/09/2026 via `comparar_extratos_agosto.py` (SSH read-only na produção). **Nada aplicado.**_

Entradas do sistema = boletos PAGO/BAIXADO/PARCIAL + recibos ENTRADA PAGO +
`fin_movimentacoes` ENTRADA, `banco_id` da conta, mês 8/2026.
Casa por valor (±R$0,02) e data (±7 dias). Transferências internas (`mov` com
`banco_origem_id`) são separadas e vão pro Passo 3.

## Resumo por conta

| Conta | banco_id | Bate | Falta lançar (extrato→sistema) | Falta `banco_id` | Sobra no sistema |
|---|---|---|---|---|---|
| **Itaú CMPORT** | 1 | 3 + 1 soma + 3 dias agregados | — | — | — · **Δ 0,00 ✅** |
| **Inter CMPORT** | 2 | 60 (1:1) | **3 · R$ 1.617,43** | boleto 284 · R$ 1.346,39 | recibo 61 · R$ 70,00 |
| **Inter TEC** | 4 | 42 + 1 soma | **2 · R$ 120,00** | — | — |

## Itaú CMPORT — 100% reconciliado (Δ 0,00)

- 3 itens 1:1 + recibo 81 (R$ 1.921,40 = 2×960,70 no extrato).
- 3 linhas "BOLETOS RECEBIDOS DD/08S" (agregadas por dia) casam **exato** com boletos
  do sistema, mesmo com `data_pagamento` 0–2 dias depois do crédito (lag normal):
  - 03/08 R$ 1.339,68 = boleto 1204 (Cezari, NF 1375 p8)
  - 05/08 R$ 4.431,78 = boleto 1354 (Estilo Higienópolis, NF 7643 p6)
  - 20/08 R$ 487,20 = boleto 1382 (J.R.I, NF 7651 p6)

## Inter CMPORT (banco 2)

### 🟡 Caiu nesta conta, lançado SEM banco — só falta o `banco_id`
| Item | Valor | Ação |
|---|---|---|
| boleto id=284 · Cond. Ed. Olivais · NF 117-2 p4 · pago 28/08 | R$ 1.346,39 | `UPDATE boletos SET banco_id=2 WHERE id=284` |

### ❌ No extrato, dinheiro que caiu e NÃO foi lançado (R$ 1.617,43)
| Data | Valor | Descrição no extrato | Provável |
|---|---|---|---|
| 11/08 | R$ 826,97 | `Devolucao: Banco 509 - QUISI CONTABILIDADE` | estorno/devolução — lançar como entrada "Outros" ou abater despesa |
| 14/08 | R$ 200,00 | `Boleto de cobranca recebido: 112/90814315100` | boleto de cliente não registrado / registrado sem baixa |
| 31/08 | R$ 590,46 | `Pix recebido: CONJUNTO RESIDENCIAL FORTEZZA` | entrada de serviço não lançada |

### ⚠️ No sistema, sem par no extrato (R$ 70,00)
| Item | Valor | Nota |
|---|---|---|
| recibo id=61 · Cond. Ed. Jussara · REC-2026-077 · 04/08 | R$ 70,00 | caso cross-empresa conhecido (recibos Jussara) — conferir se caiu em outra conta ou banco errado |

## Inter TEC (banco 4)

### ❌ No extrato, dinheiro que caiu e NÃO foi lançado (R$ 120,00)
| Data | Valor | Descrição no extrato | Provável |
|---|---|---|---|
| 04/08 | R$ 70,00 | `Pix recebido: JOSE ERISVALDO DE ARAUJO SILVA` | entrada pequena não lançada |
| 06/08 | R$ 50,00 | `Pix recebido: JOAO LUIZ GARCIA` | entrada pequena não lançada |

### ✅ Bate por soma
- Extrato 25/08 R$ 1.912,71 = boletos 1402 + 1403 (R$ 956,36 + R$ 956,35) creditados juntos.

## Achado importante pro Passo 1 / Passo 3

O parser do Passo 1 só marca como `TRANSFERENCIA_ENTRE_CONTAS` os Pix entre as duas
contas Inter (308310110 ↔ 524203806). As transferências que **saem do Itaú** para a
Inter chegam no extrato Inter como `Pix recebido: CMPORT SISTEMAS DE ELETRONICOS` /
`CMPORT TEC SISTEMAS ELETRONICOS` e ficavam na lista "falta lançar".

O script agora cruza esses com os `mov` de transferência do sistema e confirma que
**já estão lançados** (não é dinheiro faltando):

| Conta | Itens | Valor | movs |
|---|---|---|---|
| Inter CMPORT | 24/08 (×2) | R$ 1.900,17 | 2011 (Itaú→CMPORT R$ 550,17) · 2012 (TEC→CMPORT R$ 1.350,00) |
| Inter TEC | 07/08 · 12/08 · 21/08 | R$ 2.569,17 | 2060 · 2062 · 2067 (Itaú→TEC) |

➡️ **Passo 1 (`ler_extratos_agosto.py`) precisa reclassificar** essas linhas como
transferência interna (casar por contraparte = nosso CNPJ), senão o total de
"entradas por banco" do dashboard vai contar transferência do Itaú duas vezes.

## Transferências internas — resumo pro Passo 3

| Conta destino | Extrato (recebido) | Sistema (`mov`) | Δ |
|---|---|---|---|
| Inter CMPORT (2) | 8 · R$ 7.164,36 | 12 · R$ 9.314,53 | sistema tem +R$ 2.150,17 (as 2 do Itaú "ocultas" acima + 250 de 2005/2006) |
| Inter TEC (4) | 10 · R$ 19.951,11 | 13 · R$ 22.520,28 | sistema tem +R$ 2.569,17 (as 3 do Itaú "ocultas" acima) |
| Itaú CMPORT (1) | 1 · R$ 744,18 | 4 · R$ 744,22 | bate (2002) + 3 rendimentos de R$ 0,01–0,02 mal categorizados como transferência |

Detalhe completo (origem→destino, ids, datas) no output do script.

## Fora de escopo (sem extrato)

- Bradesco (3): 6 movs · R$ 2.417,42 — "Pagar Acordo" + rendimentos.
- BTG (5): 8 movs · R$ 6.056,71 — 13º / férias / impostos de funcionário.
  (Atila confirmou: BTG não teve entrada real em agosto; esses `mov` são lançamentos
  de despesa de funcionário registrados como ENTRADA — revisar na Fase D2 da folha.)

## Ainda não feito neste passo

- **Conferência de saldo** (saldo inicial + Σ entradas − Σ saídas do sistema == saldo
  final do extrato): falta carregar as SAÍDAS do sistema. O extrato já fecha 100%
  contra o próprio saldo corrido (Passo 1). Fazer junto com o cruzamento de saídas.
