# Validação: Entrada de Serviços (Sistema x Planilha) — 2026-07-30

> **O que foi comparado:** o total "Entrada de Serviços" do sistema (`GET /financeiro/fluxo-mensal`, soma de Manutenção + Assistência + Recibos, por CNPJ e mês) contra a soma das seções **Manutenção + Assistência** de cada planilha (essas duas seções, juntas, equivalem ao mesmo conceito — Assistência já inclui tanto notas quanto os lançamentos "Recibo").
>
> Feito **depois** da correção dos 81 serviços duplicados (que não deveria afetar esses totais — eles somam por boleto/recibo, não por serviço — e de fato não afetou, conferido abaixo).

---

## 1. CMPORT Principal (CNPJ 22.761.557/0001-88)

| Mês | Planilha (Manut.+Assist.) | Sistema (Entrada Serviços) | Diferença | Situação |
|---|---:|---:|---:|---|
| Jan | 72.930,79 | 74.680,79 → **72.930,79 (corrigido)** | 0,00 | ✅ Corrigida — nota fake `REC-2026-006` (id 730) duplicava o recibo do Edgar (`REC-2026-055`), excluída em 2026-07-31 |
| Fev | 63.750,41 | 63.750,41 | 0,00 | ✅ Exato |
| Mar | 83.275,82 (planilha tem duplicata própria) | 83.205,82 | -70,00 (esperado) | ✅ Fechado — ver seção 5 |
| Abr | 82.190,94 | 81.910,94 | -280,00 | ⚠️ Não explicada isoladamente — **mas ver seção 3, some quando junta com a TEC** |
| Mai | 66.496,12 | 68.296,12 → **66.496,12 (corrigido)** | 0,00 | ✅ Corrigida — nota placeholder `000.000.101 A` (id 1297), duplicava a nota nativa `101-2` do Ibirapuera Park sob o condomínio errado (Macunaíma), excluída em 2026-07-31 (ver seção 4) |
| Jun | 48.748,50 | 46.130,43 | -2.618,07 | ⚠️ Não explicada |
| Jul | 49.213,56 | 54.963,70 | +5.750,14 | ⚠️ Não explicada |
| Ago | 31.855,96 | 0,00 | -31.855,96 | Mês não fechado no sistema (boletos de agosto ainda não lançados/pagos) |
| **Total Jan-Jul** | **466.606,14** | **472.938,20** | **+6.332,06** | |

## 2. CMPORT TEC (CNPJ 65.756.913/0001-88)

| Mês | Planilha (Manut.+Assist.) | Sistema (Entrada Serviços) | Diferença | Situação |
|---|---:|---:|---:|---|
| Abr | 3.471,25 | 3.751,25 | +280,00 | Ver seção 3 |
| Mai | 18.384,55 | 0,00 | -18.384,55 | Boletos em aberto, não pagos no sistema |
| Jun | 16.822,33 | 0,00 | -16.822,33 | Boletos em aberto |
| Jul | 23.520,79 | 600,00 | -22.920,79 | Boletos em aberto |
| Ago | 9.087,94 | 0,00 | -9.087,94 | Boletos em aberto |
| Set | 8.337,94 | 0,00 | -8.337,94 | Boletos em aberto (mês também parece template/cópia de agosto, ver análise anterior) |
| **Total Abr-Set** | **79.624,80** | **4.351,25** | **-75.273,55** | Confirmado por você como esperado — TEC tem **68 de 77 boletos ainda "Em Aberto"** no sistema (só 9 marcados como pagos). Não é duplicação nem erro de valor — é falta de marcação de pagamento. |

## 3. Total combinado (Principal + TEC) — achado importante

| Mês | Planilha combinada | Sistema combinado | Diferença |
|---|---:|---:|---:|
| **Abr** | **85.662,19** | **85.662,19** | **0,00 — exato!** |
| Mai | 84.880,67 | 68.296,12 | -16.584,55 |
| Jun | 65.570,83 | 46.130,43 | -19.440,40 |
| Jul | 72.734,35 | 55.563,70 | -17.170,65 |

**Abril bate exato quando as duas empresas são somadas juntas**, mesmo cada uma isoladamente tendo uma diferença (-280 na Principal, +280 na TEC — os valores se cancelam exatamente). Isso é uma pista forte de que existe **contaminação cruzada de CNPJ** em abril — um valor de R$280 que é da TEC ficou registrado sob o CNPJ da Principal no sistema (ou vice-versa). Bate com o que já tínhamos encontrado antes nesta sessão: linhas na planilha mencionando *"Recebimento de transferência conta Inter TEC CMPORT"* dentro da seção da Principal, e vice-versa — as duas empresas historicamente compartilharam lançamentos bancários.

Maio, Junho e Julho não fecham nem somados, porque a maior parte da diferença ali é o problema já confirmado da TEC (boletos em aberto) — não dá pra "cancelar" com a Principal porque a TEC simplesmente não tem os pagamentos lançados nesses meses.

## Resumo do que está confirmado vs em aberto

✅ **Confirmado que a correção dos 81 serviços duplicados não afetou nenhum total** — os valores de boleto/recibo não mudam quando um serviço é removido (são tabelas independentes).

✅ **Explicado:** Jan (+1.750, Edgar) e Mar (-70, Cristina) — resultado direto das correções feitas nesta sessão.

✅ **Explicado (parcialmente):** Abril bate exato quando as duas empresas somam juntas — sinal de dado trocado entre CNPJs, não de dado errado/faltando.

⚠️ **TEC com boletos em aberto:** confirmado por você como situação conhecida/esperada, não é bug.

---

## 4. Investigação Jun/Jul — causa raiz encontrada (2ª rodada)

Reconciliação linha a linha (script comparando cada lançamento da planilha com o boleto/recibo correspondente no sistema, por nota normalizada + valor + mês) achou **duas causas concretas**, nenhuma delas do dado que veio do cliente:

### Causa 1 — Nota duplicada de verdade (não é só o serviço, é a nota inteira)

5 casos confirmados onde o **mesmo pagamento real** está lançado em **duas notas fiscais diferentes** — uma "nativa" (numeração `NNN-2`, do Auvo) e uma "placeholder" (`000.000.NNN A`, criada por script de reconciliação) — com boleto de mesmo valor e mesma data em ambas:

| Condomínio | Nota nativa | Nota placeholder (duplicada) | Valor duplicado | Mês |
|---|---|---|---:|---|
| Ibirapuera Park (nota nativa) | 101-2 (id 537) | 000.000.101 A (id 1297) | 1.800,00 | **Maio** |
| Olivais | 131-2 | 000.000.131 A | 2.290,00 | Junho |
| Olivais | 131-2 | 000.000.131 A | 572,50 | Julho |
| Vermont | 126-2 | 000.000.126 A | 1.560,00 | Junho |
| Vermont | 126-2 | 000.000.126 A | 520,00 | Julho |
| Jussara | 140-2 | 000.000.0140 A | 1.100,00 | Julho |
| Helbor Loft Evolution | 139-2 | 000.000.0139 A | 8.940,60 | Julho |

**Total duplicado: Maio R$1.800,00 / Junho R$3.850,00 / Julho R$11.133,10** — essas notas placeholder são as mesmas que já apareciam no relatório de serviços duplicados (`Analise_Servicos_Duplicados_Nota_Fiscal.md`, notas 1331 e 1326) — só que lá só identificamos e corrigimos o **serviço** duplicado, sem perceber que a **nota inteira** também duplicava uma nota nativa já existente. As notas 1348 (Jussara) e 1347 (Helbor) são casos novos, não estavam naquele relatório (só tinham 1 serviço cada, por isso não apareceram no filtro de "mais de 1 serviço por nota").

**Caso de Maio (nota 1297, `000.000.101 A`) tem um agravante extra:** além de duplicar o pagamento da nota nativa `101-2`, foi criada sob o **condomínio errado** — `condominio_id=125` (Edifício Macunaíma) — quando a nota nativa `101-2` (id 537) pertence a `condominio_id=684` (Edifício Ibirapuera Park). O serviço vinculado (id 1257) também herdou o condomínio errado, duplicando o serviço real (id 465) do Ibirapuera Park. Ou seja: a correção aqui não é só excluir a nota duplicada — o Macunaíma nunca deveria ter esse lançamento de R$1.800 na sua conta.

### Causa 2 — Parcelas que pararam de ser lançadas em maio

4 notas de parcelamento longo (6 a 10 parcelas, já identificadas no relatório de serviços duplicados) têm boletos só até **maio** — a planilha mostra a série continuando até agosto/setembro, mas ninguém completou o lançamento dos meses seguintes no sistema:

| Nota | Condomínio | Parcelas lançadas | Parcelas faltando (planilha mostra) |
|---|---|---|---|
| 1317 A | Fortezza Di Ferrara | 5 (Jan-Mai) | 6 a 10 (Jun-Out) |
| 1375 A | Cezario Motta | 5 (Jan-Mai) | 6 a 10 (Jun-Out) |
| 7643.0059 A | Estilo Higienópolis | 3 (Mar-Mai) | 4 a 6 (Jun-Ago) |
| 7651.0071 A | J.R.I | 2 (Abr-Mai) | 3 a 9 (Jun-Fev/27) |

Isso **reduz** o total do sistema em Junho/Julho (dinheiro que devia estar lá mas não está lançado) — parcialmente cancelando o efeito das notas duplicadas (causa 1, que **aumenta** o total).

### Reconciliação final

- **Junho:** +3.850,00 (duplicatas) − ~7.195,32 (parcelas faltando dessas 4 notas) ≈ explica a maior parte do -2.618,07 observado.
- **Julho:** +11.133,10 (duplicatas) − ~6.258,66 (parcelas faltando) ≈ explica a maior parte do +5.750,14 observado.

Não bate 100% ao centavo — sobra um resíduo pequeno que pode ser ruído do script de comparação (nomes de condomínio com grafia levemente diferente) ou mais 1-2 casos menores não encontrados. Mas a causa raiz principal está confirmada e é dado nosso (script de reconciliação/importação), não dado do cliente.

**Nada foi corrigido ainda nesta rodada — isto é só o diagnóstico.** Correção sugerida (pendente de aprovação, mesmo protocolo de sempre — local primeiro):
1. Excluir as 5 notas placeholder duplicadas (`000.000.101 A`, `000.000.131 A`, `000.000.126 A`, `000.000.0140 A`, `000.000.0139 A`) — soft delete da nota + boletos + serviço restante, mantendo a nota nativa. A `000.000.101 A` (Maio) também corrige a atribuição errada de condomínio (o R$1.800 sai da conta do Macunaíma, que nunca deveria tê-lo).
2. Completar os boletos faltantes das 4 notas de parcelamento longo (1317 A, 1375 A, 7643.0059 A, 7651.0071 A) pra Jun/Jul/Ago, usando os valores da planilha.

### Verificação: Maio fecha 100% com essa única causa

Diferente de Jun/Jul (que têm resíduo por causa das parcelas faltantes), em Maio **não há notas de parcelamento longo faltando** — a reconciliação linha a linha achou só esse 1 resíduo real (os outros 2 "furos" no cruzamento eram ruído do script de comparação: Juliana Via Del Corso e Sbios bateram em valor e data, só não casaram automaticamente por causa do nome do condomínio grafado diferente na planilha). **+R$1.800,00 = exatamente o valor da nota duplicada.** Confirmado: excluindo a nota 1297 (`000.000.101 A`), Maio bate 100% com a planilha.

## 5. Março — fechado (2026-07-31)

Março tinha um resíduo de **-70,01** mesmo após a correção da Cristina feita antes nesta sessão (ver seção 3 do `Analise_Recibos_Parcelas_Duplicadas.md`). Investigado a fundo:

**R$ 70,00 — não é bug nosso, é duplicata na própria planilha do cliente.** A planilha (aba Assistência de Março) tem **duas linhas** para o mesmo pagamento de 27/03/2026: `"Helbor Cristina Maria Coelho (Ap. 604)"` e `"Cristina Maria Coelho (Ap. 604)"`, ambas R$70,00, mesmo dia — o nome "Helbor" ficou grudado por um erro de copiar/colar de quem preencheu a planilha (provavelmente copiou de uma linha do "Helbor Loft Evolution", visto em outro condomínio). O sistema replicou fielmente essa duplicata (2 recibos, `REC-2026-028` e `REC-2026-029`) porque foi transcrito diretamente da planilha. A correção feita antes nesta sessão (cancelar `REC-2026-028`, manter `REC-2026-029`) estava **certa** — o sistema ficou mais correto que a planilha, que ainda conta os R$70 duas vezes. Por isso o total do sistema fica R$70,00 abaixo do total bruto da planilha — **isso é esperado, não é erro**.

**R$ 0,01 — centavo faltando na nota `7643.0059 A` (Estilo Higienópolis).** Reconciliação linha a linha com tolerância apertada (1 centavo) achou: planilha mostra R$23.625,**01** pra parcela de março dessa nota (mesma nota do parcelamento longo incompleto da seção 4), mas o sistema tinha R$23.625,**00** — faltava exatamente 1 centavo, provavelmente arredondamento perdido na importação/lançamento original. **Corrigido no banco local** (boleto id 836 e `notas_fiscais.valor` da nota id 1090, em 2026-07-31): agora R$23.625,01, batendo com a planilha.

**Resultado:** com os R$70 da duplicata da planilha descontados, março agora bate **exato, ao centavo** (R$83.205,82 = R$83.205,82). Nada de produção foi alterado — correção só no banco local, mesmo protocolo de sempre.
