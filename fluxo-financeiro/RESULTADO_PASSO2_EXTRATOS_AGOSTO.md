# Passo 2 — Cruzamento sistema × extrato (entradas), Agosto/2026

_Rodado 02/09/2026 via `comparar_extratos_agosto.py` (SSH read-only na produção). **Nada aplicado.**_
_Versão cliente (HTML): `RECONCILIACAO_AGOSTO_CLIENTE.html` → https://claude.ai/code/artifact/d0556b20-a66a-4fc4-82d2-dc4e4684f9be_

Entradas do sistema = boletos PAGO/BAIXADO/PARCIAL + recibos ENTRADA PAGO +
`fin_movimentacoes` ENTRADA, `banco_id` da conta, mês 8/2026.
Casa por valor (±R$0,02) e data (±7 dias). Transferências internas (`mov` com
`banco_origem_id`, e linhas de extrato "Pix recebido CMPORT" que casam com elas)
são separadas e vão pro Passo 3.

## Resultado — 3 CNPJs conciliados 100% (entradas). 4 ajustes APLICADOS 03/09.

_Revisado 03/09 após conferir na planilha mestre (`FLUXO FINANCEIRO CMPORT TEC - 2026.xlsx`,
aba "Entradas e SAIDAS - 2026") e reconsultar produção._

| Conta | banco_id | Extrato¹ | Sistema | Δ | Status |
|---|---|---|---|---|---|
| **Itaú CMPORT** | 1 | 9.668,76 | 9.668,76 | **0,00** | ✅ conciliado |
| **Inter CMPORT** | 2 | 37.938,85 | 37.938,85 | **0,00** | ✅ conciliado (61 bate 1:1) |
| **Inter TEC** | 4 | 25.825,87 | 25.825,87 | **0,00** | ✅ conciliado (44 bate 1:1) |
| **TOTAL (3 contas)** | — | **73.433,48** | **73.433,48** | **0,00 ✅** | — |

**03/09 — APLICADO em produção (via SSH, com backup):**
- `recibo 61` + `recibo 62` → `banco_id` 2→4 (Inter TEC). Script `aplicar_ajuste_banco_passo2.py`.
- `boleto 284` (Olivais) → `banco_id` 2 (mesmo script, `--com-boleto-284`).
- `boleto 1152` (Fortezza NF 7895) → baixa: PAGO / 31-08 / banco 2 / forma PIX + `boleto_pagamentos`
  + `notas_fiscais.data_pagamento` + `corpos_nota 262` PAGO + `ciclos_nota 191` CONCLUIDO.
  Script `aplicar_baixa_fortezza_passo2.py`. Backups `backup_producao_pre_ajuste_banco_passo2_*`
  e `backup_producao_pre_baixa_fortezza_20260903_1113.sql`.

**Pendências operacionais (não afetam o fechamento):**
- Boleto do Fortezza (cobrança `a9c2aeb2` no Inter) segue "em aberto" no app do Inter —
  **Atila decidiu deixar como está**. Cuidado: rodar `sincronizar_do_inter` (sync por intervalo
  de datas) para agosto poderia rebaixar o `boleto 1152` para VENCIDO/CANCELADO. O sync
  automático (`sincronizar_status` → `get_pendentes`) NÃO pega, pois já está PAGO.
- `boleto 1465` (NF 7883 cancelada) segue solto — [[project_bug_delete_corpo_nota_orfao_20260902]].
- QUISI R$ 826,97 (11/08): devolução de pagamento, não é entrada. Único item que ainda
  aparece "sem par" no extrato Inter CMPORT (par −826,97/+826,97 que se anula).

¹ Extrato Inter CMPORT **exclui** o crédito de R$ 826,97 (11/08) — é devolução de pagamento,
não recebimento (ver QUISI abaixo). Bruto seria 38.765,82.

**Por CNPJ:** CMPORT (Itaú+Inter CMPORT) 47.607,61 · TEC 25.825,87 — ambos batendo ext × sis.

### QUISI R$ 826,97 (11/08) — NÃO é entrada. Já esclarecido.

Sequência no extrato Inter CMPORT: **11/08 −826,97** (pagamento boleto QUISI) → **11/08 +826,97**
(`Devolucao: Banco 509 - QUISI CONTABILIDADE`, banco estornou) → **12/08 −826,97**
(`Pix enviado Cp :60701190-QUISI CONTABILIDADE`, refeito). A cliente pagou a contabilidade, o
banco devolveu, ela refez por Pix.
- Despesa **já lançada:** `fin_movimentacoes id=1251` SAIDA 12/08 R$ 826,97 banco 2 "Quisi Contabilidade"
  (+ `id=1255` SAIDA 11/08 R$ 413,48 banco 4 "Quisi Contabilidade TEC" — parte da TEC).
- Par −826,97/+826,97 do dia 11 se anula. Lançar só se quiser o extrato 100% linha a linha.
- **Sai da lista de pendências de entrada.**

### Inter CMPORT (banco 2) — 2 ajustes ✅ APLICADOS
| # | Data | Valor | Tipo | Item | Ação (feita) |
|---|---|---|---|---|---|
| 1 | 28/08 | R$ 1.346,39 | ajuste banco | `boleto id=284` — Cond. Ed. Olivais, NF 117-2, parcela **4/10**. Situação PAGO, `valor_total_recebido` 1.346,39, `forma_pagamento` BOLETO_INTER, `codigo_solicitacao` preenchido, `atualizado_em` 29/08 09:00 = **baixa automática via API Inter** (não foi o cliente). `banco_id` era NULL; parcelas 1–3 (281–283) têm `banco_id=2`. Extrato: 28/08 +1.346,39 `Boleto de cobranca recebido 112/90716547560`. | ✅ `UPDATE boletos SET banco_id=2 WHERE id=284` |
| 2 | 31/08 | R$ 590,46 | baixa | Cond. **742** (Assoc. Moradores Conj Res Fortezza Di Ferrara). Extrato: 31/08 +590,46 **`Pix recebido`** (não "Boleto de cobrança recebido") — pago por Pix na chave da empresa, **não pelo boleto**. Manutenção mensal **JULHO/2026** (corpo 262 `mes_referencia=07/2026`), vencida 20/08. **NF 7895** (id 1413) — `boleto id=1152`. **NF 7883** (id 1387) CANCELADA, `boleto id=1465` sem `codigo_solicitacao` (nunca foi ao Inter). | ✅ `aplicar_baixa_fortezza_passo2.py`: `boleto 1152` PAGO/31-08/banco 2/PIX + `boleto_pagamentos id=20` + `notas_fiscais 1413.data_pagamento` + `corpos_nota 262` PAGO + `ciclos_nota 191` CONCLUIDO. Boleto no Inter (`a9c2aeb2`) **deixado em aberto** (decisão do Atila). `boleto 1465` limpar à parte. |

**Por que o Inter não deu baixa sozinho:** `boleto_service.sincronizar_status/_do_inter` só marca PAGO quando a **cobrança** no Inter volta `RECEBIDO`/`MARCADO_RECEBIDO`. O cliente mandou Pix avulso pra chave da empresa (CNPJ), não pagou o boleto → a cobrança `a9c2aeb2` fica `A_RECEBER`. O sync **automático** (`sincronizar_status` → `get_pendentes`) não pega `boleto 1152` (já PAGO). O sync **manual por intervalo** (`sincronizar_do_inter`) NÃO tem guarda pra PAGO — rodar pra agosto poderia rebaixar. `inter_client.py` só tem endpoints de cobrança, **não lê Pix recebidos** (`GET /banking/v2/pix`) — melhoria possível pro card "Entradas por banco".

Depois: `36.002,00 + 1.346,39 + 590,46 = 37.938,85` = extrato ✅ (61 bate 1:1)

### Inter TEC (banco 4) — FECHADO 100% (03/09)
| # | Data | Valor | Tipo | Item | Status |
|---|---|---|---|---|---|
| 3 | 04/08 | R$ 70,00 | ajuste banco | `recibo id=61` REC-2026-077 — "Jose Erivaldo - Cond. Jussara". Planilha r425 (seção Assistências Agosto = TEC), `*`. Extrato Inter TEC 04/08. | ✅ `banco_id` 2→4 aplicado |
| 4 | 04/08 | R$ 50,00 | ajuste banco | `recibo id=62` REC-2026-078 — "João Garcia - Cond. Jussara". Planilha r426. Extrato Inter TEC 06/08. | ✅ `banco_id` 2→4 aplicado |

Depois: sistema 25.825,87 = extrato 25.825,87 · **Δ 0,00 · 44 bate 1:1**.

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
| Fortezza R$ 590,46 | Cond. 742. Manutenção **JULHO/2026** (corpo 262 `mes_referencia=07/2026`, venc 20/08). **NF 7895** (boleto 1152) AUTORIZADA = a certa. **NF 7883** (boleto 1465) CANCELADA (deleted corpo 236) = pendência solta. Pago por Pix avulso (não boleto). Não está na planilha mestre. Os 2 créditos de R$ 590,45 de 10/08 no extrato são Cube Vila Ipojuca / Green Gold (boletos 1116/1117), não Fortezza. | baixa manual do boleto 1152 (forma PIX) |
| `recibo id=61` (R$ 70) | `banco_id`=2, PAGO. **Na planilha** aba "Entradas e SAIDAS" r425, seção Assistências Agosto (TEC), marcado `*`. Extrato Inter TEC 04/08 bate. | ajuste de banco — `banco_id=4` |
| `recibo id=62` (R$ 50) | `banco_id`=2, PAGO. **Na planilha** r426, mesma seção, marcado `*`. Extrato Inter TEC 06/08 bate. | ajuste de banco — `banco_id=4` |

**Status 03/09 — TODOS OS 4 AJUSTES APLICADOS em produção via SSH (com backup).**
As 3 contas fecham 100% nos recebimentos de clientes. Pendências operacionais no topo do doc.

## Transferências entre contas (Passo 3 — não são entradas)

Todas conferidas nas 2 pontas + lançamento no sistema.

| Grupo | Qtd | Detalhe |
|---|---|---|
| Inter CMPORT ↔ Inter TEC | 18 | Espelhadas nos 2 extratos. Líquido: TEC→CMPORT R$ 7.164,36 (8×) · CMPORT→TEC R$ 19.951,11 (10×). movs 2003–2014 / 2060–2072. |
| Envolvendo Itaú | 7 | 6 saídas Itaú→Inter (R$ 3.369,34: 200 / 50 / 1.882,24 / 199,73 / 487,20 / 550,17) + 1 volta Inter CMPORT→Itaú R$ 744,18 (27/08, mov 2002). movs 2005/2006, 2011, 2060, 2062, 2067. |
| ~~Rendimentos com banco_origem_id~~ | 5 | ✅ CORRIGIDO 03/09: movs 2015/2016/2162 (Itaú) + 2076/2077 (Bradesco), R$ 0,09 total → `banco_origem_id = NULL`. Jan–Jul (43 rendimentos) já estavam OK. |

**Achado pro Passo 1 / dashboard (Passo 5):** as transferências que saem do Itaú chegam
na Inter como `Pix recebido: Cp :60701190-CMPORT SISTEMAS DE ELETRONICOS` (CNPJ CMPORT) —
o parser do Passo 1 só marca como `TRANSFERENCIA` os Pix entre as 2 contas Inter
(308310110 ↔ 524203806). O `comparar_extratos_agosto.py` já cruza essas linhas com os
`mov` de transferência e confirma que **estão lançadas**. Mas o `ler_extratos_agosto.py`
precisa reclassificá-las (casar contraparte = nosso CNPJ) antes do card "Entradas por
banco", senão a transferência do Itaú entra como faturamento.

## Pedidos de melhoria do Atila (03/09)

- **Rendimento fácil (feature):** hoje rendimento é lançado pelo modal "+ Nova Transferência"
  (`/fluxo-financeiro/transferencias`, `CATEGORIAS_TRANSFERENCIA` inclui 'Rendimento') — por
  isso ganha `banco_origem_id`. Correção: quando categoria = Rendimento, esconder/zerar o campo
  "conta de origem" (rendimento não vem de outra conta). Dados de agosto já corrigidos.
- **Dashboard completo do Fluxo** (`/fluxo-financeiro`): somas/subtrações no detalhe —
  extrato × saldo em cada banco × entradas × saídas (incl. funcionário). Ver
  `PLANO_DASHBOARD_FLUXO.md`. Depende da migração da folha (Fase D2) pra "saída de funcionário".
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
