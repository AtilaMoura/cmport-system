# Análise — Exportar planilha completa do Fluxo para o cliente

## ✅ IMPLEMENTADO 03/09/2026 (sessão `session_01Ln9cjBN2m6XSPS9D14BqGZ`)

`GET /financeiro/exportar-fluxo?ano_inicio&mes_inicio[&ano_fim&mes_fim][&cnpj][&incluir_pendentes]`
→ `backend/app/services/fin_export_service.py` (`FinExportService.gerar_xlsx`).

Abas: **Resumo** (mês × empresa + linha TOTAL) · **Entradas** (boleto/recibo linha a linha) ·
**Saídas** (`fin_movimentacoes` SAIDA — grupo Fornecedor/Despesa/Funcionário/Tarifa-IR) ·
**Transferências** · **Categoria x Mês** · **Pendências** (opcional).
Regime de caixa (data de pagamento). Autofilter + freeze na 1ª linha.

Filtros: mês único **ou** intervalo · um CNPJ **ou** os dois · com/sem pendências —
as 4 decisões do Atila (ver `anotação para IA.md` l.177-184) já contempladas.
Frontend: botão "⬇ Exportar Excel" com popover de filtros na Visão Geral (`ExportarFluxoBtn.tsx`).

**Limitação atual:** a folha de agosto já sai (fin_movimentacoes tem os pagamentos), mas
jan–jul depende da **Fase D2** pra ficar completa. A coluna "Saídas — Funcionário" do Resumo
fica R$ 0,00 até a D2 recategorizar a folha do grupo DESPESA pro grupo FUNCIONARIO.

---

_Análise original abaixo. Criado 28/08/2026. Pedido do Atila: analisar (1) como o cliente monta a planilha
que manda pra gente e (2) como o sistema pode gerar uma planilha completa do fluxo
pra devolver pro cliente — incluindo a parte de funcionário. **É análise/plano,
ainda não implementação.**_

---

## 1. Como o cliente emite a planilha HOJE (o que recebemos)

**Arquivos** (em `docs-e-planilhas/`, atualizados manualmente pela cliente):
- `FLUXO FINANCEIRO - 2026.xlsx` — CMPORT (1,5 MB)
- `FLUXO FINANCEIRO CMPORT TEC - 2026.xlsx` — TEC (900 KB)

Cada arquivo tem várias abas; as que importam:

### Aba `Entradas e SAIDAS - 2026` — o razão de lançamentos
É a fonte que os scripts de reconciliação leem (`validar_fluxo_todos_meses.py`).

- **~1.515 linhas**, dimensão inflada (~16 mil colunas fantasma — sempre ler com
  `iter_rows(min_col=1, max_col=13, values_only=True)`, nunca `.cell()` nem `max_row`).
- **Estrutura por mês**: 4 linhas de saldo inicial (Itaú/Inter/Bradesco×2) + 5 seções
  na ordem fixa:
  1. `MANUTENÇÕES / CONTRATOS DE MANUTENÇÃO` (categoria `Contrato`)
  2. `ASSISTÊNCIAS` (categoria `Assistencia`)
  3. `ENTRADA / BANCOS` (transferências internas, categoria minúscula `assistencia`, etc.)
  4. `DESPESAS ESCRITÓRIO`
  5. `FORNECEDORES`
  Cada seção termina numa linha de **subtotal** (coluna I somada pelo Excel).
- **Colunas** (linha de header repete em cada seção, ex. linha 6):

  | col | conteúdo | nota |
  |---|---|---|
  | A | tag `<Categoria><Mes><Ano>` | ex. `Contrato12026`, `Assistencia52026` — usado pra achar a seção sem mapear linha na mão |
  | B | tag `<Categoria><serial>` | o serial é a data PAGTO em número de série do Excel |
  | C | CONDOMÍNIO / descrição | nome livre, precisa mapear pra `condominios.id` |
  | D | Categoria | `Contrato` \| `Assistencia` \| `saldo` \| ... (casing importa: `Assistencia` = receita real, `assistencia` = transferência) |
  | E | NF | número da nota, **ou o texto literal `Recibo`**, ou padrão `NNNN.NNNN` (nota dupla assistência+produto), ou sufixo ` A`/` M` |
  | F | PARCELA | `01/01`, `10/10` |
  | G | **PAGTO** | data de pagamento — **é esta que filtra o mês** (não a VENCTO) |
  | H | VENCTO | data de vencimento |
  | I | PAGOS | valor efetivamente pago |
  | K | VALOR | valor cheio da parcela |
  | L | descrição do serviço / "Destino" | texto livre |
  | M | vínculo | tag de outra linha (ex. `Assistencia45968`) |

### Aba `FLUXO` — painel de caixa diário
Saldo acumulado, saldo diário, Receita, Investimentos, Fornecedores, Despesas —
**dia a dia**. Receita quebrada em: `saldo`, `ajustes`, `juros`, `contrato`,
`Rendimento`, `assistencia`. Cada bloco (Receitas / Investimentos / Despesas /
Fornecedores) tem Total e "% sobre Receita".

### Aba `RELAT_FLUXO_2` — matriz categoria × mês
Linhas = `contrato`, `assistencia`, `escritorio`, + nomes de fornecedor
(Aquários, Telman, Interseg, Linear…). Colunas = 12 meses + Total.

### Outras abas (contexto, fora do fluxo)
`Reajustes`, `NF`, `MM`, `Cobranças`, `NCM`, `Distribuição Lucro`, `Entradas e SAIDAS (2016)`.

**Resumo:** a planilha da cliente é **manual, orientada a caixa** (regime de caixa:
tudo por data de pagamento), com dois níveis — o razão (`Entradas e SAIDAS`) e dois
resumos derivados (`FLUXO` diário, `RELAT_FLUXO_2` mensal por categoria).

---

## 2. O que o sistema já tem pra alimentar um export

| Fonte no sistema | Cobre | Estado |
|---|---|---|
| `GET /financeiro/fluxo-mensal` | **Entradas** — boletos PAGO/PARCIAL + recibos ENTRADA, por CNPJ, por mês, com condomínio/nota/serviço/banco | ✅ pronto (esta sessão adicionou `nota_id`/`servico_id`) |
| `fin_movimentacoes` (módulo Financeiro Fase 1) | **Saídas** — despesas gerais, fornecedores, transferências. Dado real Jan–Set/2026 (2.017 lançamentos, 152 ENTRADA + 1.865 SAIDA) | ✅ dado migrado; ⚠️ rótulo de banco em correção (Fase 1 B1) e encoding já corrigido (B2) |
| `despesas` + `despesa_parcelas` | Despesa Geral + Fornecedor (parcelas, vencimento, status, banco, forma pgto) | ✅ pronto |
| `fin_saldo_inicial` (`GET /financeiro/saldo-inicial/{ano}/{mes}`) | Saldo inicial por conta/mês | ✅ existe |
| `bancos` (5 contas) | Itaú/Inter/Bradesco/... | ✅ |
| `GET /financeiro/dashboard` | Saldo inicial, entradas, fornecedores, despesas, saídas, saldo do mês, saldo acumulado | ✅ pronto — **é o equivalente da aba `FLUXO` da cliente** |
| **Despesa Funcionário** | folha (salário, encargos, VT/VR, convênio…) | ❌ **não existe ainda** — ver `PLANO_DESPESA_FUNCIONARIO.md` |
| Export Excel (padrão técnico) | `dashboard_router.py::exportar_servicos_excel` usa `openpyxl.Workbook` + `Response(media_type="…spreadsheetml.sheet")` | ✅ padrão a reusar |

**Buraco principal:** a folha de funcionário. Sem ela o export "completo" não fecha
com a planilha da cliente (é o mesmo gap do "mês não bate" — R$ 258.755,94).

---

## 3. Proposta — export "Fluxo Completo" do sistema pro cliente

### Formato: um `.xlsx` que espelha a lógica da planilha dela (não a estrutura exata)

Gerar via `openpyxl`, endpoint novo tipo
`GET /financeiro/exportar-fluxo?ano=YYYY&mes=MM&cnpj=...&formato=xlsx`
(pode ser range de meses: `mes_inicio`/`mes_fim` pra exportar o ano todo).

**Abas propostas:**

| Aba | Conteúdo | Fonte |
|---|---|---|
| `Resumo` | Saldo inicial · Entradas (Contrato/Assistência/Produto/Recibo) · Saídas (Despesa/Fornecedor/**Funcionário**/Transferência) · Saldo do mês · Saldo acumulado — por mês, lado a lado | `/financeiro/dashboard` + folha |
| `Entradas` | 1 linha por boleto/recibo pago: mês, CNPJ, condomínio, tipo, nº nota, parcela, vencimento, **pagamento**, valor, banco, serviço vinculado | `/financeiro/fluxo-mensal` |
| `Saídas — Despesas` | 1 linha por parcela paga: descrição, categoria, CNPJ, vencimento, pagamento, valor, banco, forma pgto | `despesas` origem GERAL |
| `Saídas — Fornecedores` | idem, com fornecedor e OS vinculada | `despesas` origem FORNECEDOR |
| `Saídas — Funcionário` | 1 linha por lançamento: funcionário, tipo (salário/adiantamento/encargo/VT…), CNPJ pagador, vencimento, pagamento, valor, banco | **módulo novo** (Fase D da folha) |
| `Transferências` | transferências internas entre contas | `fin_movimentacoes` origem transferência |
| `Por Categoria × Mês` | matriz igual `RELAT_FLUXO_2` da cliente | agregação das abas acima |

- **Regime de caixa** (tudo por data de pagamento) pra bater com a lógica dela.
- Marcar linha **PARCIAL** e linha ainda **EMABERTO/PENDENTE** (a planilha dela só
  tem pago; o nosso export pode ter uma coluna "situação" pra mostrar o que falta).
- Totais por seção batendo com o subtotal (mesma conferência do Passo 5 do runbook).
- Header/estilo: reusar o padrão de `exportar_servicos_excel` (Font bold, PatternFill).

### Frontend
Botão "Exportar fluxo (Excel)" na tela `/fluxo-financeiro` (com seletor de mês/ano
ou ano inteiro e CNPJ). Igual o botão de export que já existe em Serviços/Dashboard.

---

## 4. A parte de funcionário nesse export

- O export **depende do módulo Despesa Funcionário** (`PLANO_DESPESA_FUNCIONARIO.md`,
  Fases A–E) pra ter os dados. Antes disso, a aba `Saídas — Funcionário` fica vazia
  e o `Resumo` não fecha com a planilha da cliente.
- Ordem recomendada: **folha primeiro (Fases A–D), export depois** — ou o export
  nasce incompleto e some do total ~R$ 32k/mês.
- Quando a folha existir: a aba `Saídas — Funcionário` sai direto de
  `despesas WHERE funcionario_id IS NOT NULL` + join `funcionarios`, agrupada por
  tipo de custo (as categorias grupo FUNCIONARIO).

---

## 5. Plano de implementação (ordem sugerida)

| Passo | O quê | Depende de |
|---|---|---|
| 0 | **Este documento** — validar o formato das abas com o Atila | — |
| 1 | Módulo Despesa Funcionário (Fases A–D do outro plano) | — |
| 2 | `FluxoExportService.gerar_xlsx(ano, mes|range, cnpj)` — monta as abas `Resumo`, `Entradas`, `Saídas — *`, `Transferências`, `Por Categoria × Mês` | passo 1 pra aba Funcionário |
| 3 | Endpoint `GET /financeiro/exportar-fluxo` (Response xlsx, padrão `exportar_servicos_excel`) | passo 2 |
| 4 | Botão no frontend `/fluxo-financeiro` | passo 3 |
| 5 | Validação: rodar o export de Jan–Jul e comparar total a total com a planilha da cliente (reusar lógica do `validar_fluxo_todos_meses.py`, agora cobrindo saídas também) | passos 2–4 |

### Decisões pendentes pro Atila
- **Espelhar a estrutura exata** da planilha dela (mesmas seções/colunas, ela cola
  por cima) **ou** formato próprio mais limpo (recomendado — abas por tipo + resumo)?
- Export **mês a mês** ou **ano inteiro num arquivo** (uma aba de resumo + abas de
  detalhe cobrindo o range)?
- Incluir no export as pendências (boleto EMABERTO, parcela não paga) ou só o que
  já foi pago (como a planilha dela)?
- Um arquivo por CNPJ (como hoje) ou um arquivo com CMPORT e TEC em abas separadas?

---

## Referências
- Runbook de leitura da planilha da cliente: `PROCESSO_RECONCILIACAO_MENSAL.md`
- Scripts que já leem a planilha: `validar_fluxo_todos_meses.py`, `verificar_fechamento_mes.py`
- Módulo de folha: `PLANO_DESPESA_FUNCIONARIO.md`
- Padrão técnico de export xlsx: `backend/app/routers/dashboard_router.py::exportar_servicos_excel`
