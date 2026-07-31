# Mapeamento das Planilhas de Fluxo Financeiro (Fase 1 — sem comparação com o sistema)

> **Escopo desta fase:** só mapear o conteúdo das duas planilhas (estrutura, seções, totais mensais, uso de parcela).
> **Comparação com o sistema CMPort fica pra Fase 2** (próxima etapa, depois de revisar este mapeamento).

Arquivos analisados:
- `FLUXO FINANCEIRO - 2026.xlsx` — CMPORT principal (CNPJ 22.761.557/0001-88)
- `FLUXO FINANCEIRO CMPORT TEC - 2026.xlsx` — CMPORT TEC (CNPJ 65.756.913/0001-88)

Aba usada em ambos: **`Entradas e SAIDAS - 2026`** (as outras abas — `RELAT_FLUXO_2`, `FLUXO`, `Reajustes`, `NF`, `MM`, `Cobranças`, `NCM`, `Distribuição Lucro`, `Entradas e SAIDAS (2016)` — não foram analisadas nesta fase).

⚠️ **Nota técnica:** o arquivo tem acentuação corrompida nos cabeçalhos de texto quando lido via script (ex: "MANUTENÇÕES" aparece como "MANUTEN��ES"). Os valores numéricos não são afetados — só a exibição de texto. Os nomes de seção abaixo estão normalizados manualmente.

---

## 1. Estrutura padrão (se repete todo mês, nas duas planilhas)

Cada mês tem até 5 seções, sempre na mesma ordem:

1. **MANUTENÇÕES MÊS X** — contratos de manutenção mensal recorrente (um lançamento por condomínio/contrato, valor fixo mensal)
2. **ASSISTÊNCIAS MÊS X** — serviços avulsos de assistência técnica (podem ser parcelados em vários meses)
3. **ENTRADA/BANCOS MÊS X** — recebimentos bancários consolidados (transferências, rendimentos, reembolsos, estornos)
4. **DESPESAS ESCRITÓRIO MÊS X** — despesas fixas/recorrentes do escritório (tarifas bancárias, seguros, etc. — valores negativos)
5. **FORNECEDORES MÊS X** — pagamentos a fornecedores/prestadores (valores negativos)

Colunas de cada seção: `CONDOMÍNIO` (col C) · `Categoria` (col D) · `NF` (col E) · `PARCELA` (col F, formato `NN/TT` = parcela N de T) · `PAGTO` (col G) · `VENCTO` (col H) · `PAGOS`/`VALOR` (col I) · uma linha em branco no final de cada seção traz o **subtotal pronto** na coluna I.

---

## 2. FLUXO FINANCEIRO - 2026.xlsx (CMPORT principal)

Cobre **Janeiro a Agosto/2026** (Agosto é mês em andamento/futuro — provavelmente só os contratos recorrentes já lançados, sem fechamento completo).

| Mês | Manutenção | Assistência | Entrada/Bancos | Despesas Escritório | Fornecedores |
|---|---:|---:|---:|---:|---:|
| Jan | 22.332,66 | 50.598,13 | 9.650,29 | -60.320,92 | -19.557,73 |
| Fev | 22.498,03 | 41.252,38 | 9.016,03 | -56.993,03 | -17.627,35 |
| Mar | 23.463,11 | 59.812,71 | 13.915,23 | -66.666,54 | -30.789,53 |
| Abr | 23.556,07 | 58.634,87 | 10.481,42 | -78.289,12 | -15.293,81 |
| Mai | 23.620,26 | 42.875,86 | 11.235,96 | -59.411,52 | -18.238,28 |
| Jun | 18.778,39 | 29.970,11 | 12.908,73 | -46.734,01 | -14.458,02 |
| Jul | 18.778,40 | 30.435,16 | 8.357,94 ⚠️ | -43.778,80 | -6.269,67 |
| Ago* | 18.778,40 | 13.077,56 | 7.146,76 | -35.298,27 | -5.113,83** |

\* Agosto é mês parcial/em andamento.
\*\* Fornecedores de Agosto não tem linha de subtotal pronta na planilha (é a última seção do arquivo) — valor calculado somando manualmente as 9 linhas de dados (2135-2143).

⚠️ **Achado:** o subtotal de "Entrada/Bancos Julho" (linha 1904, R$ 8.357,94) **não inclui a última linha lançada** (linha 1903 — "Recebimento de transferência conta Inter TEC CMPORT", 20/07, R$ 2.378,28). A soma real dos 18 lançamentos daquela seção é **R$ 10.736,22**. Parece que essa linha foi inserida depois que a fórmula de soma já tinha sido fixada num intervalo menor — vale avisar quem mantém a planilha.

---

## 3. FLUXO FINANCEIRO CMPORT TEC - 2026.xlsx

Cobre **Abril a Setembro/2026** — não tem dados de Janeiro a Março (a operação da TEC como entidade separada parece ter começado a ser lançada em Abril). Não tem seção de Manutenção em Abril (só começa a partir de Maio).

| Mês | Manutenção | Assistência | Entrada/Bancos | Despesas Escritório | Fornecedores |
|---|---:|---:|---:|---:|---:|
| Abr | — (sem seção) | 3.471,25 | 11.851,52 | -9.046,75 | -1.504,20 |
| Mai | 0,00 | 18.384,55 | 31.508,32 | -38.174,47 | -8.235,43 |
| Jun | 5.782,94 | 11.039,39 | 20.915,81 | -39.515,20 | -2.742,73 |
| Jul | 7.132,94 | 16.387,85 | 31.203,61 | -44.993,30 | -4.932,07 |
| Ago | 7.632,94 | 1.455,00 | 17.637,10 | -30.396,11 | -1.734,24 |
| Set* | 7.632,94 | 705,00 | 17.637,10 | -30.347,71 | -1.734,24 |

\* **Setembro parece ser placeholder/template**, não dado real: Manutenção, Entrada/Bancos e Fornecedores de Setembro são **idênticos** aos de Agosto (mesmos valores exatos) — típico de uma aba copiada como esqueleto pro mês seguinte antes de ser preenchida de verdade.

---

## 4. Uso de PARCELA por seção (pergunta original do usuário)

Levantamento de todos os valores da coluna PARCELA no arquivo principal (1.421 lançamentos são `01/01` — maioria esmagadora):

| Seção | Tem parcelamento real? | Observação |
|---|---|---|
| **Manutenção** | Não | Contrato mensal recorrente — cada mês é um lançamento novo e completo (`01/01`). Não representa parcelas de uma venda única. |
| **Assistência** | **Sim** | Serviço avulso pago em várias parcelas ao longo de vários meses (ex: `07/10` = parcela 7 de 10, `04/05` = parcela 4 de 5). Uma "NF" (`Assistencia46036`, `1185 A`) se repete em meses diferentes com números de parcela crescentes. |
| **Entrada/Bancos** | Não | Sempre `01/01` — são recebimentos bancários pontuais (transferência, rendimento, estorno), não parcelas de uma cobrança. |
| **Despesas Escritório** | Não (é outra coisa) | O campo PARCELA aqui é usado como "mês X de 12" pra despesas anuais recorrentes (ex: `01/12`, `06/12` — tarifa/seguro cobrado todo mês do ano) — não é parcelamento de uma compra única. |
| **Fornecedores** | Parcialmente | Maioria `01/01` (pagamento à vista), mas existem **acordos de pagamento parcelado real** (ex: linha 2142 do arquivo principal: `Pix ZN Acordo 26/30` — parcela 26 de 30, uma dívida negociada em 30 parcelas). |

**Conclusão da questão levantada:** o único lugar onde existe parcelamento real de um mesmo serviço/venda ao longo de vários meses é a seção **Assistência** (e, em menor escala, alguns "acordos" na seção Fornecedores). Isso bate com o modelo do sistema (`NotaFiscal` 1:N `Boleto`, cada boleto é uma parcela com sua própria `data_pagamento`) — cada parcela de Assistência na planilha deveria corresponder a um `Boleto` marcado como pago no sistema, no mês em que a coluna PAGTO indica, **sem gerar um novo serviço/NotaFiscal por parcela** (o serviço é um só; as parcelas são só os boletos dele).

---

## 5. Outros achados cruzados entre as duas planilhas

- **Contas bancárias compartilhadas entre as duas entidades:** várias linhas de "Entrada/Bancos" mencionam explicitamente `"conta Inter CMPORT/ CMPORT TEC"` (arquivo TEC) ou `"conta Inter TEC CMPORT"` (arquivo principal) — indicando que o dinheiro das duas empresas às vezes transita pela mesma conta bancária, ou que o lançamento foi feito na planilha "errada". Isso é relevante pra qualquer comparação por CNPJ: pode haver contaminação cruzada entre os dois arquivos.
- **Períodos cobertos são diferentes:** principal = Jan-Ago; TEC = Abr-Set. Não dá pra comparar os dois arquivos mês a mês em todo o intervalo — só a interseção (Abr-Ago).

---

## 6. Próxima fase (NÃO feita ainda)

Comparar os totais acima com o sistema (`GET /financeiro/fluxo-mensal`), por CNPJ e por mês, considerando que:
- O sistema só contabiliza um boleto/recibo quando ele está de fato **pago** (`data_pagamento` preenchida).
- Cada parcela conta no mês em que **ela** foi paga — não duplica o serviço, só o boleto/registro financeiro daquela parcela.
- Já foi feita uma verificação pontual antes desta pausa: **Manutenção bateu exato** com o CNPJ principal pra Jan-Mai (ex: Jan R$22.332,66 = R$22.332,66) e **Entrada/Bancos bateu exato** de Jan a Jun. Falta:
  - Verificar Assistência mês a mês (é onde o parcelamento real acontece — mais provável de ter divergência)
  - Verificar Despesas Escritório e Fornecedores (que hoje vivem em `fin_movimentacoes`, não em boletos/notas)
  - Investigar por que Abril mudou de R$85.662,19 (validado numa sessão anterior) pra R$81.910,94 (valor atual, pós-sync do banco local com produção) — pode ser só reflexo de dados reais mais recentes de produção, mas vale confirmar
  - Repetir tudo pro CNPJ da TEC usando a segunda planilha
