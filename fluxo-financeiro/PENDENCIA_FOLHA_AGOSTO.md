# PENDÊNCIA — Folha de AGOSTO/2026 (pendência C da Fase D2)

_Análise feita 03/09/2026 (`session_01CaTGrQicK8wsyA4XNJ5Tj3`). **NADA APLICADO.** Atila pediu deixar
tudo anotado pra resolver depois._

A Fase D2 fechou **jan–jul** (aplicada 03/09). **Agosto ficou de fora** — está aqui.

---

## Situação atual de agosto (produção)

A folha de agosto **JÁ ESTÁ paga e lançada** no sistema — o problema é organização:

| O que existe | Estado |
|---|---|
| ~17 lançamentos de salário/adiantamento/férias/VT | despesas UNICO **PAGO**, com banco certo (Inter TEC), **mas `funcionario_id` NULL** e categoria velha ("Salários"/"Adiantamento de Salário") → **não aparecem na aba Funcionários** |
| ~15 guias de encargo/convênio (FGTS/GPS/AMIL/Sindicato/SanMedi/Brasil Medicina/Associação) | despesas UNICO PAGO, `funcionario_id` NULL (correto — é guia da folha inteira), **categoria velha** → recategorizar pras novas (100/101/102) |
| **23 parcelas RECORRENTE PENDENTE** (despesas 912–934, R$ 17.731,47) | **fantasma** — projeção do motor automático (Fase B). Confirmado: **NÃO saíram do banco** (nenhuma no extrato). A folha real foi paga pelos avulsos. É o que a aba mostra hoje como "Pendente R$ 17.731,47". |
| **Rescisão Pedro R$ 5.152,32** | mov `2092` **ATIVA** mas **órfã** (despesa 949 soft-deletada 31/08; a duplicata 954/mov 2097 foi removida pelo Passo 2b). Precisa de despesa + vínculo ao Pedro (id 4) + categoria 107. |

## Reconciliação 3 fontes (planilha FLUXO × extrato bancário × sistema)

Planilha FLUXO agosto: **25 lançamentos, R$ 33.466,25**. Cruzando com o extrato inteiro:

- **19/25 batem** com uma saída no extrato (Inter TEC/CMPORT/Itaú) — salários, adiantamentos, VT,
  SanMedi, Sindicato, Bem Mais Familiar, FGTS Pedro, Rescisão Pedro.
- **6 não achei saída direta:**

| Item planilha | Motivo |
|---|---|
| Welligton salário R$ 2.084,57 | Pago **junto com o PRL** num Pix só de **R$ 2.661,81** (= 2.084,57 + 577,24). Está no sistema como d957. A planilha separou, o banco não. |
| Welligton PRL R$ 577,24 | idem — dentro do R$ 2.661,81 |
| FGTS 05/2026 R$ 1.174,33 | O banco pagou **R$ 1.110,23** (d978) + R$ 505,98 (d641). Valor de competência na planilha ≠ valor real pago. |
| GPS 05/2026 R$ 1.463,62 | Pago em guias com valor diferente (d1020 R$ 550,72 + d1021 R$ 1.816,59 "GPS Julho") |
| Brasil Medicina R$ 218,90 | O banco pagou **R$ 241,21** (d985, mov 2127). Diferença R$ 22,31. |
| **PRL Luis R$ 236,14 (30/08)** | **Não achei saída no extrato** — pode não ter sido paga (fim do mês) ou caiu em setembro. **Confirmar com a cliente.** |

## Itens do SISTEMA que a planilha FLUXO não itemiza (mas estão no extrato — reais)

- Adiantamentos de 27–31/08: André R$ 300 (d990), Almira R$ 300 (d991), Fabiana R$ 100 (d993),
  Gabriel VT R$ 200 (d994). **Confirmar com a cliente:** são adiantamento de agosto ou já de setembro?
- Luis Férias R$ 2.741,20 (d992, 28/08) — está no extrato, planilha não lista férias do Luis em agosto.

---

## PLANO quando for resolver ("D2 agosto")

Abordagem **B** (decidida por descarte): vincular os lançamentos reais, **não recriar** (senão perde a
conciliação de banco que o Passo 2b fez).

| Passo | Ação | Volume aprox. |
|---|---|---|
| **A1** | `UPDATE despesas SET funcionario_id, categoria_id` nos ~17 avulsos de salário/adiant/férias/VT que casam funcionário. Mantém valor/data/banco/status. Atualizar tb `categoria_id` da mov ligada. | ~17 |
| **A1b** | Rescisão Pedro: criar `Despesa` UNICO PAGO pra mov órfã `2092` (R$ 5.152,32), `funcionario_id=4`, categoria 107, `movimentacao_id=2092`, `banco_id` = o da mov. | 1 |
| **A2** | Recategorizar ~15 guias encargo/convênio pras categorias novas (100/101/102). `funcionario_id` fica NULL. | ~15 |
| **A3** | Remover as 23 parcelas RECORRENTE PENDENTE de agosto (despesas 912–934). Hard-delete das **parcelas de agosto** + `registrar_exclusao` snapshot. **NÃO tocar** na despesa RECORRENTE nem nas parcelas de set/2026+ (276 delas). | 23 |
| **A4** | Revalidar: aba Funcionários agosto = folha paga; conferir totais com extrato. | — |

**Ferramentas já prontas:** `preparar_folha_agosto.py` (gera `folha_agosto_input.json`, gitignored),
`conferir_folha_agosto.py` (reconciliação 3 fontes). O matcher automático precisa de ajuste fino
(alguns itens combinados / instituições) — curar a lista à mão antes de aplicar.

## Perguntas pra cliente antes de aplicar

1. **PRL Luis R$ 236,14 (30/08)** — foi paga? Por qual conta? (não achei no extrato de agosto)
2. **Adiantamentos de 27–31/08** (André 300, Almira 300, Fabiana 100, Gabriel 200) — são de agosto ou setembro?
3. **FGTS/GPS/Brasil Medicina** — os valores da planilha ("05/2026") não batem com o pago. Quais guias
   de competência foram pagas em agosto e por qual valor?
4. **Luis Férias R$ 2.741,20 (28/08)** — confirma que é férias do Luis paga em agosto?

## Cuidados

- Coordena com a linha de trabalho do **Passo 2b/3** (`RESULTADO_PASSO2B_SAIDAS_AGOSTO.md`) — os movs de
  agosto (2090–2152) foram conciliados com o extrato por essa sessão. O A3 só remove **parcelas PENDENTE
  sem mov**, então risco de conflito é baixo, mas confirmar antes.
- Depois de A1/A1b, re-salvar Luis(2)/Welligton(3) na tela `/funcionarios` (pendência da D2: ativar
  adiantamento FIXO recorrente de setembro+).
