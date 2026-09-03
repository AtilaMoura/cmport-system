# Passo 2 — Cruzamento sistema × extrato (entradas), Agosto/2026

_Rodado 02/09/2026 via `comparar_extratos_agosto.py` (SSH read-only na produção). **Nada aplicado.**_
_Versão cliente (HTML): `RECONCILIACAO_AGOSTO_CLIENTE.html` → https://claude.ai/code/artifact/d0556b20-a66a-4fc4-82d2-dc4e4684f9be_

Entradas do sistema = boletos PAGO/BAIXADO/PARCIAL + recibos ENTRADA PAGO +
`fin_movimentacoes` ENTRADA, `banco_id` da conta, mês 8/2026.
Casa por valor (±R$0,02) e data (±7 dias). Transferências internas (`mov` com
`banco_origem_id`, e linhas de extrato "Pix recebido CMPORT" que casam com elas)
são separadas e vão pro Passo 3.

## Resultado — 4 ajustes fecham os 3 CNPJs a 100% (entradas)

_Revisado 03/09 após conferir na planilha mestre (`FLUXO FINANCEIRO CMPORT TEC - 2026.xlsx`,
aba "Entradas e SAIDAS - 2026") e reconsultar produção._

| Conta | banco_id | Extrato¹ | Sistema hoje | Δ | Após ajustes | Ajustes |
|---|---|---|---|---|---|---|
| **Itaú CMPORT** | 1 | 9.668,76 | 9.668,76 | **0,00 ✅** | 9.668,76 | nenhum |
| **Inter CMPORT** | 2 | 37.938,85 | 36.122,00 | 1.816,85 | 37.938,85 | 2 (1 banco + 1 baixa) |
| **Inter TEC** | 4 | 25.825,87 | 25.705,87 | 120,00 | 25.825,87 | 2 (banco) |
| **TOTAL (3 contas)** | — | **73.433,48** | **71.496,63** | **1.936,85** | **73.433,48 ✅** | 4 |

¹ Extrato Inter CMPORT **exclui** o crédito de R$ 826,97 (11/08) — é devolução de pagamento,
não recebimento (ver QUISI abaixo). Bruto seria 38.765,82.

Δ total = boleto 284 (1.346,39) + Fortezza (590,46). Os recibos 61/62 (R$ 120) só trocam de
CNPJ (CMPORT→TEC), não mexem no total geral.

**Por CNPJ:** CMPORT (Itaú+Inter CMPORT) 47.607,61 ext × 45.790,76 sis → 47.607,61 após ·
TEC 25.825,87 ext × 25.705,87 sis → 25.825,87 após.

### QUISI R$ 826,97 (11/08) — NÃO é entrada. Já esclarecido.

Sequência no extrato Inter CMPORT: **11/08 −826,97** (pagamento boleto QUISI) → **11/08 +826,97**
(`Devolucao: Banco 509 - QUISI CONTABILIDADE`, banco estornou) → **12/08 −826,97**
(`Pix enviado Cp :60701190-QUISI CONTABILIDADE`, refeito). A cliente pagou a contabilidade, o
banco devolveu, ela refez por Pix.
- Despesa **já lançada:** `fin_movimentacoes id=1251` SAIDA 12/08 R$ 826,97 banco 2 "Quisi Contabilidade"
  (+ `id=1255` SAIDA 11/08 R$ 413,48 banco 4 "Quisi Contabilidade TEC" — parte da TEC).
- Par −826,97/+826,97 do dia 11 se anula. Lançar só se quiser o extrato 100% linha a linha.
- **Sai da lista de pendências de entrada.**

### Inter CMPORT (banco 2) — 2 ajustes
| # | Data | Valor | Tipo | Item | Ação |
|---|---|---|---|---|---|
| 1 | 28/08 | R$ 1.346,39 | ajuste banco | `boleto id=284` — Cond. Ed. Olivais, NF 117-2, parcela **4/10**. Situação PAGO, `valor_total_recebido` 1.346,39, `forma_pagamento` BOLETO_INTER, `codigo_solicitacao` preenchido, `atualizado_em` 29/08 09:00 = **baixa automática via API Inter** (não foi o cliente). `banco_id` NULL; parcelas 1–3 (281–283) têm `banco_id=2`. Extrato: 28/08 +1.346,39 `Boleto de cobranca recebido 112/90716547560`. | `UPDATE boletos SET banco_id=2 WHERE id=284` |
| 2 | 31/08 | R$ 590,46 | dar baixa | Cond. **742** (Assoc. Moradores Conj Res Fortezza Di Ferrara). Extrato: 31/08 +590,46 `Pix recebido Cp :60701190-CONJUNTO RESIDENCIAL FORTEZZA`. **A nota e o boleto existem** mas EMABERTO — e há **DUAS notas de agosto**: NF **7895** (id 1413, boleto 1152, criado 04/08) e NF **7883** (id 1387, boleto 1465, criado 18/08), ambas R$ 590,46, venc 20/08. Provável duplicata. | cliente confirma a nota certa → `baixa` do boleto (data 31/08, banco 2) → cancelar a duplicada. **NÃO está na planilha mestre** (nem Fortezza aparece lá em 2026). |

Depois: `36.122,00 + 1.346,39 + 590,46 − 120,00 = 37.938,85` = extrato ✅
(os −120,00 são os recibos 61+62 que migram pra Inter TEC, ajustes 3 e 4.)

### Inter TEC (banco 4) — 2 ajustes
| # | Data | Valor | Tipo | Item | Ação |
|---|---|---|---|---|---|
| 3 | 04/08 | R$ 70,00 | ajuste banco | `recibo id=61` REC-2026-077 — "Jose Erivaldo - Cond. Jussara" (troca sinaleiro portão), `cnpj_emitente` TEC, hoje `banco_id=2`. **Na planilha:** aba "Entradas e SAIDAS", r425, seção ASSISTÊNCIAS MÊS AGOSTO (= TEC), marcado `*`. Extrato Inter TEC 04/08 R$ 70,00 `Pix recebido JOSE ERISVALDO`. | `UPDATE recibos SET banco_id=4 WHERE id=61` |
| 4 | 04/08 | R$ 50,00 | ajuste banco | `recibo id=62` REC-2026-078 — "João Garcia - Cond. Jussara", `cnpj_emitente` TEC, hoje `banco_id=2`. **Na planilha:** r426, mesma seção, marcado `*`. Extrato Inter TEC 06/08 R$ 50,00 `Pix recebido JOAO LUIZ GARCIA`. | `UPDATE recibos SET banco_id=4 WHERE id=62` |

Depois: `25.705,87 + 70,00 + 50,00 = 25.825,87` = extrato ✅

### Itaú CMPORT (banco 1) — 100%, nada a fazer
- 3 itens 1:1 + recibo 81 (R$ 1.921,40 = 2×960,70).
- 3 linhas "BOLETOS RECEBIDOS DD/08S" (agregadas por dia) casam **exato**, mesmo com
  `data_pagamento` 1–2 dias depois do crédito:
  - 03/08 R$ 1.339,68 = boleto 1204 (Cezari, NF 1375 p8)
  - 05/08 R$ 4.431,78 = boleto 1354 (Estilo Higienópolis, NF 7643 p6)
  - 20/08 R$ 487,20 = boleto 1382 (J.R.I, NF 7651 p6)

## Investigação 03/09 (planilha mestre + produção)

| Item | Achado | Conclusão |
|---|---|---|
| `boleto id=284` | PAGO por boleto Inter, baixa automática 29/08 09:00 (`forma_pagamento` BOLETO_INTER, `codigo_solicitacao` ok). Não foi baixa manual do cliente. `banco_id` NULL. | ajuste de banco — `banco_id=2` |
| QUISI R$ 826,97 | Extrato: 11/08 −826,97 → 11/08 +826,97 devolução → 12/08 −826,97 Pix. Despesa já lançada: `fin_movimentacoes id=1251`. Atila: cliente pagou a contabilidade, banco estornou, refez. | **não é entrada** — tirado da lista |
| Fortezza R$ 590,46 | Cond. 742. **Nota+boleto de agosto existem** mas EMABERTO. **2 notas:** 7895 (boleto 1152, criado 04/08) e 7883 (boleto 1465, criado 18/08), ambas R$ 590,46. Provável duplicata. Não está na planilha mestre (Fortezza não aparece lá em 2026). Os 2 créditos de R$ 590,45 de 10/08 no extrato são Cube Vila Ipojuca / Green Gold (boletos 1116/1117), não Fortezza. | dar baixa (1 boleto) + cancelar duplicata — cliente confirma qual nota |
| `recibo id=61` (R$ 70) | `banco_id`=2, PAGO. **Na planilha** aba "Entradas e SAIDAS" r425, seção Assistências Agosto (TEC), marcado `*`. Extrato Inter TEC 04/08 bate. | ajuste de banco — `banco_id=4` |
| `recibo id=62` (R$ 50) | `banco_id`=2, PAGO. **Na planilha** r426, mesma seção, marcado `*`. Extrato Inter TEC 06/08 bate. | ajuste de banco — `banco_id=4` |

**Resumo:** 4 ajustes reais (2 de banco + 1 baixa + 2 de banco = 4, sendo os 2 recibos juntos).
QUISI não conta. Todas as pendências continuam abertas.

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

## Pedidos de melhoria do Atila (03/09)

- **Rendimento fácil:** criar no fluxo financeiro um jeito rápido de lançar "Rendimento"
  (categoria já existe) — botão/atalho, sem virar transferência. Hoje os rendimentos do Itaú
  entraram como `mov` ENTRADA com `banco_origem_id` preenchido (5 movs, R$ 0,09 em agosto:
  2015/2016/2162 Itaú + 2076/2077 Bradesco). Limpeza: `SET banco_origem_id = NULL` nessas 5.
- **Parser Passo 1:** classificar "Pix recebido CMPORT/C&M PORT/CEM PORT" como transferência
  interna (pré-requisito do card "Entradas por banco").

## Fora de escopo (sem extrato)

- **Bradesco (3):** 6 movs · R$ 2.417,42 — "Pagar Acordo" + rendimentos.
- **BTG (5):** 8 movs · R$ 6.056,71 — 13º / férias / impostos de funcionário lançados como
  ENTRADA. Atila confirmou: BTG sem entrada real em agosto. Revisar na Fase D2 da folha.

## Ainda não feito neste passo

- **Conferência de saldo** (saldo inicial + Σ entradas − Σ saídas do sistema == saldo
  final do extrato): falta carregar as SAÍDAS do sistema. O extrato já fecha 100% contra
  o próprio saldo corrido (Passo 1). Fazer junto com o cruzamento de saídas.
