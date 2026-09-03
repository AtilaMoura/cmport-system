# Plano — Dashboard completo do Fluxo Financeiro

_Pedido do Atila (03/09): dashboard em `/fluxo-financeiro` com **somas e subtrações no detalhe**,
mostrando **o saldo do extrato**, **o que ficou em cada banco**, e **as saídas (inclusive
funcionário) no detalhe**. É o Passo 5 do `PLANO_RECONCILIACAO_EXTRATOS_AGOSTO.md`, ampliado._

**NADA IMPLEMENTADO. Aguardando aprovação do Atila (fases + ordem).**

---

## O que existe hoje

- `/fluxo-financeiro` (`app/fluxo-financeiro/page.tsx`) — cards + `GET /financeiro/dashboard`
  (`saldo_inicial`, `entradas`, `fornecedores`, `despesas`, `saidas`, `saldo_mes`,
  `saldo_acumulado`) — **tudo consolidado, sem quebra por banco**.
- `fin_saldo_inicial` — 1 valor por `ano/mes` (global, **sem `banco_id`**).
- Bancos: 1 Itaú / 2 Inter / 3 Bradesco (CMPORT) · 4 Inter / 5 BTG (TEC).
- Entradas: boletos PAGO + recibos ENTRADA PAGO + `fin_movimentacoes` ENTRADA (com `banco_id`).
- Saídas: `despesas` + `fin_movimentacoes` SAIDA + fornecedores + funcionário (`despesas.funcionario_id`).
- Transferência interna = `fin_movimentacoes` ENTRADA com `banco_origem_id`.
- Extrato bancário: **só existe nos scripts de reconciliação**, não é dado do sistema.

## Dependência crítica

**A "saída de funcionário no detalhe" só fica correta depois da Fase D2 da folha**
(`PLANO_FASE_D2_FOLHA.md` — migração de ~R$176k de lançamentos históricos, Mai–Jul faltando
~R$27k/mês). Sem isso o dashboard mostra a folha incompleta. → **Fase D2 primeiro, ou aceitar
que os meses Mai–Jul do dashboard ficam provisórios.**

---

## Demonstrativo alvo (por conta bancária + consolidado)

```
Saldo inicial do mês (por banco)                          R$ X
  (+) Entradas de clientes         boletos ___ recibos ___ avulsos ___
  (+) Transferências recebidas     de outra conta nossa
  (−) Transferências enviadas      para outra conta nossa
  (−) Saídas — Fornecedores
  (−) Saídas — Despesas gerais
  (−) Saídas — Funcionário (folha) salário ___ encargos ___ férias/13º ___
  (−) Tarifas / juros
  (+) Rendimento
  ─────────────────────────────────────────────
  = Saldo final calculado (sistema)                       R$ Y
  Saldo final do extrato bancário                         R$ Z
  Diferença (Y − Z)                                       R$ (deve ser 0)
```

---

## Fases (validar ordem com o Atila)

### Fase 0 — Folha D2 (pré-requisito, track separado)
`PLANO_FASE_D2_FOLHA.md`. Sem isso, "saída de funcionário" fica incompleta Mai–Jul.

### Fase 1 — Backend: dashboard por banco
- Novo `GET /financeiro/dashboard/por-banco?ano&mes` → por `banco_id`:
  `saldo_inicial`, `entradas` (quebrado: boleto/recibo/avulso), `transf_recebidas`,
  `transf_enviadas`, `saidas` (quebrado: fornecedor/despesa/funcionario/tarifa),
  `rendimento`, `saldo_calculado`. + linha consolidada.
- Schema `DashboardPorBancoResponse`. Reusa a lógica de `FinMovimentacaoService.dashboard`,
  agrupando por `banco_id`.
- Camadas: schema → service → router (sem repo novo, query direta no service como o dashboard atual).

### Fase 2 — Saldo inicial por banco
- `ALTER TABLE fin_saldo_inicial ADD COLUMN banco_id INT NULL` (NULL = global legado).
- `POST/GET /financeiro/saldo-inicial` aceitam `banco_id`.
- Tela: campo de saldo inicial por conta (quando entra num mês novo).
- Migração: distribuir o saldo global de agosto pelos bancos (a partir do Passo 1 da
  reconciliação: Inter CMPORT 551,96 · Inter TEC 6.740,19 · Itaú −342,35).

### Fase 3 — Saldo do extrato no sistema
- **Mínimo:** tabela `fin_extrato_saldo` (`banco_id`, `ano`, `mes`, `saldo_final`,
  `conferido_em`, `observacao`) + form manual "informar saldo do extrato".
- Dashboard passa a mostrar `saldo_calculado × saldo_extrato × diferença` por conta.
- **Depois (opcional):** importar o arquivo do extrato / ler via API Inter
  (`GET /banking/v2/saldo`).

### Fase 4 — Frontend: a tela
- Nova aba/seção em `/fluxo-financeiro` — "Por banco" ou "Conciliação".
- Tabela por conta com o demonstrativo em cascata (waterfall), a diferença
  extrato×sistema destacada (verde = bate, vermelho = não bate).
- Drill-down: clicar numa linha (ex. "Funcionário") abre os lançamentos.
- Reusa `FiltrosFluxo`, `fmtValor`, padrões das telas existentes.

### Fase 5 — "Entradas por banco" (card original do Passo 5)
- Card no topo: total de entradas por banco no mês, **incluindo transferência recebida**
  (transferência interna conta como entrada do banco que recebeu), com o quanto veio de
  transferência destacado.
- Requer: parser/classificação de transferência que sai do Itaú (ver
  `RESULTADO_PASSO2_EXTRATOS_AGOSTO.md` — "Pix recebido CMPORT").

---

## Fora deste plano (mas relacionado)

- Export .xlsx do fluxo pro cliente — `ANALISE_EXPORT_PLANILHA_FLUXO.md` (A4).
- Página unificada de pendências — `project_pagina_unificada_pendencias`.
- Reconciliação de SAÍDAS × extrato (Passo 2b) e conferência de saldo mês a mês.
