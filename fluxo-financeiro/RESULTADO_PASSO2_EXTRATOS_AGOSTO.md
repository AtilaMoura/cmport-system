# Passo 2 — Cruzamento sistema × extrato (entradas), Agosto/2026

_Rodado 02/09/2026 via `comparar_extratos_agosto.py` (SSH read-only na produção). **Nada aplicado.**_
_Versão cliente (HTML): `RECONCILIACAO_AGOSTO_CLIENTE.html` → https://claude.ai/code/artifact/d0556b20-a66a-4fc4-82d2-dc4e4684f9be_

Entradas do sistema = boletos PAGO/BAIXADO/PARCIAL + recibos ENTRADA PAGO +
`fin_movimentacoes` ENTRADA, `banco_id` da conta, mês 8/2026.
Casa por valor (±R$0,02) e data (±7 dias). Transferências internas (`mov` com
`banco_origem_id`, e linhas de extrato "Pix recebido CMPORT" que casam com elas)
são separadas e vão pro Passo 3.

## Resultado — 5 ajustes fecham os 3 CNPJs a 100% (entradas)

| Conta | banco_id | Extrato | Sistema hoje | Δ | Ajustes |
|---|---|---|---|---|---|
| **Itaú CMPORT** | 1 | 9.668,76 | 9.668,76 | **0,00 ✅** | nenhum |
| **Inter CMPORT** | 2 | 38.765,82 | 36.122,00 | 2.643,82 | 3 (1 banco + 2 lançar) |
| **Inter TEC** | 4 | 25.825,87 | 25.705,87 | 120,00 | 2 (banco) |

### Inter CMPORT (banco 2) — 3 ajustes
| # | Data | Valor | Tipo | Item | Ação |
|---|---|---|---|---|---|
| 1 | 28/08 | R$ 1.346,39 | ajuste banco | `boleto id=284` — Cond. Ed. Olivais, NF 117-2, parcela **4/10**, PAGO, `banco_id` NULL. Parcelas 1–3 (ids 281–283) têm `banco_id=2`. | `UPDATE boletos SET banco_id=2 WHERE id=284` |
| 2 | 11/08 | R$ 826,97 | lançar entrada | Extrato: `Devolucao: Banco 509 - QUISI CONTABILIDADE`. Sem registro. | criar entrada (receita "Outros" **ou** devolução de despesa paga a maior — confirmar) |
| 3 | 31/08 | R$ 590,46 | lançar entrada | Extrato: `Pix recebido - CONJUNTO RESIDENCIAL FORTEZZA`. Sem registro. | identificar nota/serviço e lançar |

Depois: `36.122,00 + 1.346,39 + 826,97 + 590,46 − 120,00 = 38.765,82` = extrato ✅
(os −120,00 são os recibos 61+62 que migram pra Inter TEC, ajustes 4 e 5.)

### Inter TEC (banco 4) — 2 ajustes
| # | Data | Valor | Tipo | Item | Ação |
|---|---|---|---|---|---|
| 4 | 04/08 | R$ 70,00 | ajuste banco | `recibo id=61` REC-2026-077 — `cliente_nome_avulso` = "Jose Erisvaldo de Araujo Silva", Ed. Jussara apto 09, `cnpj_emitente` = 65756913000188 (**TEC**), hoje `banco_id=2`. Extrato Inter TEC 04/08 R$ 70,00 `Pix recebido JOSE ERISVALDO DE ARAUJO SILVA` — match exato. | `UPDATE recibos SET banco_id=4 WHERE id=61` |
| 5 | 04/08 | R$ 50,00 | ajuste banco | `recibo id=62` REC-2026-078 — Ed. Jussara apto 02 (2 tags), `cnpj_emitente` TEC, hoje `banco_id=2`. Extrato Inter TEC 06/08 R$ 50,00 `Pix recebido JOAO LUIZ GARCIA`. | `UPDATE recibos SET banco_id=4 WHERE id=62` |

Depois: `25.705,87 + 70,00 + 50,00 = 25.825,87` = extrato ✅

### Itaú CMPORT (banco 1) — 100%, nada a fazer
- 3 itens 1:1 + recibo 81 (R$ 1.921,40 = 2×960,70).
- 3 linhas "BOLETOS RECEBIDOS DD/08S" (agregadas por dia) casam **exato**, mesmo com
  `data_pagamento` 1–2 dias depois do crédito:
  - 03/08 R$ 1.339,68 = boleto 1204 (Cezari, NF 1375 p8)
  - 05/08 R$ 4.431,78 = boleto 1354 (Estilo Higienópolis, NF 7643 p6)
  - 20/08 R$ 487,20 = boleto 1382 (J.R.I, NF 7651 p6)

## Transferências entre contas (Passo 3 — não são entradas)

Todas conferidas nas 2 pontas + lançamento no sistema.

| Grupo | Qtd | Detalhe |
|---|---|---|
| Inter CMPORT ↔ Inter TEC | 18 | Espelhadas nos 2 extratos. Líquido: TEC→CMPORT R$ 7.164,36 (8×) · CMPORT→TEC R$ 19.951,11 (10×). movs 2003–2014 / 2060–2072. |
| Envolvendo Itaú | 7 | 6 saídas Itaú→Inter (R$ 3.369,34: 200 / 50 / 1.882,24 / 199,73 / 487,20 / 550,17) + 1 volta Inter CMPORT→Itaú R$ 744,18 (27/08, mov 2002). movs 2005/2006, 2011, 2060, 2062, 2067. |
| Rendimentos Itaú mal categorizados | 3 | movs 2015/2016/2162, R$ 0,01–0,02, `banco_origem_id` = `banco_id` (categoria errada, deveria ser Rendimento puro). Cosmético. |

**Achado pro Passo 1 / dashboard (Passo 5):** as transferências que saem do Itaú chegam
na Inter como `Pix recebido: Cp :60701190-CMPORT SISTEMAS DE ELETRONICOS` (CNPJ CMPORT) —
o parser do Passo 1 só marca como `TRANSFERENCIA` os Pix entre as 2 contas Inter
(308310110 ↔ 524203806). O `comparar_extratos_agosto.py` já cruza essas linhas com os
`mov` de transferência e confirma que **estão lançadas**. Mas o `ler_extratos_agosto.py`
precisa reclassificá-las (casar contraparte = nosso CNPJ) antes do card "Entradas por
banco", senão a transferência do Itaú entra como faturamento.

## Fora de escopo (sem extrato)

- **Bradesco (3):** 6 movs · R$ 2.417,42 — "Pagar Acordo" + rendimentos.
- **BTG (5):** 8 movs · R$ 6.056,71 — 13º / férias / impostos de funcionário lançados como
  ENTRADA. Atila confirmou: BTG sem entrada real em agosto. Revisar na Fase D2 da folha.

## Ainda não feito neste passo

- **Conferência de saldo** (saldo inicial + Σ entradas − Σ saídas do sistema == saldo
  final do extrato): falta carregar as SAÍDAS do sistema. O extrato já fecha 100% contra
  o próprio saldo corrido (Passo 1). Fazer junto com o cruzamento de saídas.
