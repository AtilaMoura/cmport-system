# Análise: Recibos/Serviços duplicados por falta de parcela — RESOLVIDO (2026-07-29)

> **Contexto:** até esta sessão, o campo de parcela não existia em `recibos` — todo recibo criado manualmente nascia com `total_parcelas=1`, mesmo quando representava, na prática, um pagamento recorrente/parcelado de um mesmo cliente ao longo de vários meses. Isso gerou **serviços duplicados** (um `ManutencaoAssistencia` por mês, quando deveria existir só um).
>
> Levantamento inicial varreu os 39 recibos do sistema por recorrência de cliente. Depois, cruzando com a coluna PARCELA da planilha `FLUXO FINANCEIRO - 2026.xlsx` (que já rotula alguns lançamentos "Recibo" com parcela real, tipo `02/04`), consegui confirmar com precisão **quais casos eram parcela de verdade e quais não eram** — inclusive descobrindo um valor de entrada diferente (Edgar, parcela 1, R$1.750 — bem maior que as demais de R$587,51) que não estava em nenhum recibo do sistema.
>
> **Todas as correções abaixo já foram executadas** no banco local (soft delete + criação, com auditoria completa em `registros_exclusoes`). Nada foi tocado em produção.

---

## 1. Edgar (condomínio id 148) — RESOLVIDO ✅

Planilha confirmou 4 parcelas reais: Jan `01/04` R$1.750 (nunca lançada no sistema!), Fev `02/04` R$587,51, Mar `~03/04` R$587,51, Abr `04/04` R$587,51. Maio (REC-2026-039, "passagem de cabo do interfone") **não** faz parte do parcelamento — a planilha não tem entrada de Edgar em maio, e a descrição é de um trabalho específico e diferente. Confirma a suspeita original.

**Ação executada:**
- Excluídos (soft delete): REC-2026-022 (Fev), REC-2026-026 (Mar), REC-2026-034 (Abr) — serviços #938, #1070, #1182 removidos junto (cascade).
- Criado REC-2026-055 (parcela 1/4, mãe): R$1.750, `data_emissao`/`data_pagamento` 15/01/2026, status PAGO, gera o serviço novo (#1336).
- Parcelas filhas criadas automaticamente (2/4, 3/4, 4/4, R$587,51 cada) e marcadas PAGO nas datas históricas reais: 24/02, 24/03, 16/04.
- REC-2026-039 (maio) **mantido intacto**, sem nenhuma alteração.
- **Resultado:** de 4 serviços pra 2 (1 do arranjo parcelado + 1 do trabalho de maio, que é real).

## 2. Juliana Via Del Corso (condomínio id 657) — RESOLVIDO ✅

Planilha confirmou 2 parcelas reais: Mai `01/02` R$500, Jun `02/02` R$500 — batendo exatamente com os dois recibos existentes (REC-2026-037 e REC-2026-044). Evidência que antes era "incerta" virou confirmação direta.

**Ação executada:**
- Excluídos: REC-2026-037 (Mai), REC-2026-044 (Jun) — serviços #1278, #1319 removidos junto (cascade).
- Criado REC-2026-059 (parcela 1/2, mãe): R$500, 07/05/2026, PAGO, gera serviço novo (#1337).
- Parcela filha (2/2, R$500) marcada PAGO em 29/06/2026 (data histórica real).
- **Resultado:** de 2 serviços pra 1.

## 3. Cristina Maria Coelho (Ap. 604) — RESOLVIDO ✅

Duplicata direta (não é parcela): mesmo dia (27/03/2026), mesmo valor (R$70), nome quase idêntico — um tinha "Helbor" grudado por engano de copiar/colar.

**Ação executada:** excluído REC-2026-028 ("Helbor Cristina Maria Coelho..."), mantido REC-2026-029 (nome correto, serviço #1073).

## 4. Eraseg — CONFIRMADO como falso-positivo, nada mexido ✅

Reverifiquei **todos** os 8 lançamentos de "Eraseg" na planilha inteira (não só os suspeitos): 7 são `01/01` com valores todos diferentes, e só 1 (março, R$250) está rotulado `02/04` — isolado, sem `01/04`/`03/04`/`04/04` correspondentes em nenhum outro mês. Tem cara de erro de digitação da própria planilha (copiou o formato de uma célula vizinha), não um parcelamento real. **Nenhum recibo do Eraseg foi alterado.**

---

## Resumo da correção

| Cliente | Antes | Depois | Serviços removidos |
|---|---|---|---|
| Edgar | 4 recibos independentes, 4 serviços | 1 recibo parcelado (4x, valores reais da planilha) + 1 recibo avulso (maio, intacto) = 2 serviços | 3 |
| Juliana Via Del Corso | 2 recibos independentes, 2 serviços | 1 recibo parcelado (2x) = 1 serviço | 1 |
| Cristina Maria Coelho | 2 recibos duplicados, 2 serviços | 1 recibo = 1 serviço | 1 |
| Eraseg | 6 recibos, 6 serviços | Sem alteração — todos legítimos | 0 |

**Total: 5 serviços duplicados/indevidos removidos**, com auditoria completa (nada foi hard-deletado — tudo em `registros_exclusoes` com o motivo registrado). Nenhum órfão novo gerado (verificado via query cruzando `manutencoes_assistencias.recibo_id` com `recibos` ativos).

## Daqui pra frente

Esse problema não vai mais acontecer — a feature de parcelas em recibos (construída nesta sessão) resolve isso na raiz: ao criar um recibo pra um cliente recorrente, dá pra marcar quantas parcelas forem necessárias desde o início, com valores diferentes por parcela se for o caso (ex: entrada maior), e o sistema só gera 1 serviço (na parcela 1) — as demais só contam como entrada financeira no mês em que forem pagas.

## Não incluído nesta análise

- Não foi feita a mesma varredura pra **notas fiscais/boletos** (Manutenção/Assistência via nota fiscal) — só recibos manuais. Notas fiscais já usam o modelo correto (`NotaFiscal` 1:N `Boleto`), risco bem menor lá, mas não verificado a fundo.
- Não comparado com a planilha TEC (CNPJ separado) — essa análise é só sobre o CNPJ principal.
- O órfão pré-existente `servico_id=824`/`recibo_id=11` (de 14/07, anterior a esta sessão) continua **intocado** — fora de escopo, não relacionado a este levantamento.
