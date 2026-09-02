# Folha de Pagamento — Pendências para conferir com a cliente

_Gerado 02/09/2026 · base: planilha `Controle de Funcionarios - 2026.xlsx` + `despesas_funcionario.json` (planilha FLUXO) + estado de produção._

Antes de migrar a folha histórica (jan–jul/2026) pro sistema, precisamos que a cliente confirme os pontos abaixo. Cada um afeta números que vão aparecer no fluxo financeiro.

---

## 1. A folha entra no fluxo pelo valor BRUTO (cada pagamento) ou pelo LÍQUIDO (contracheque)?

As duas planilhas divergem de forma **sistemática**:

| | O que mostra | Exemplo — Luis, janeiro |
|---|---|---|
| **Controle de Funcionários** (contracheque) | o **líquido** do acerto (já desconta o adiantamento que foi pago antes) | R$ 3.591,70 |
| **FLUXO / caixa** | **cada saída da conta**: salário no dia 12 **+** adiantamento no dia 21, separados | R$ 5.271,80 |

A diferença (R$ 1.680,10) é **exatamente o adiantamento do Luis**. O mesmo padrão vale pra todo mundo:

| Funcionário | Diferença mensal recorrente | = |
|---|---|---|
| Luis | ~R$ 1.680,50 | adiantamento fixo |
| Welligton | ~R$ 1.739,38 (jan–abr) → ~R$ 2.028 (mai–jun) | adiantamento fixo (mudou em maio?) |
| Pedro | R$ 872 – 1.654 | adiantamento + vale-transporte |
| André | ~R$ 700/mês | adiantamento |
| Fabiana | R$ 830 – 1.075 | adiantamento |
| Gabriel | R$ 650 – 1.210 | adiantamento |

**➡️ Pergunta:** o sistema deve registrar **cada pagamento que saiu da conta** (bruto — recomendado, é o que o extrato mostra) ou o **líquido do contracheque**? _Recomendação: bruto/caixa — bate com o extrato bancário e com o que já está lançado de jan a abril._

**Casos pra investigar** (não seguem o padrão do adiantamento):
- **Welligton — adiantamento subiu de R$ 1.739,38 para R$ 2.028 em maio.** Foi reajuste ou erro?
- **Luis — junho:** diferença R$ 1.605,50 em vez de R$ 1.680,50 (R$ 75 a menos).
- **Gabriel — março:** R$ 50 a mais no salário sem explicação.

---

## 2. Julho está incompleto na planilha Controle

A aba de julho só tem lançamento pra **Luis, Pedro e Almira**. **André, Welligton, Fabiana e Gabriel estão zerados** em julho.

O FLUXO/caixa tem os valores de julho pra todos (André R$ 5.071,10, Welligton R$ 6.158,09, Fabiana R$ 2.895,61, Gabriel R$ 2.046,10).

**➡️ Pergunta:** confirmar os valores de julho desses 4, batendo com o extrato bancário de julho.

---

## 3. Salário do André — pró-labore

- Cadastro do sistema: **R$ 2.900** (pró-labore).
- Planilha: "SÓCIO", com pagamentos mensais de **R$ 4.166 a R$ 4.763**.
- A cliente já disse: "Gestor Sócio tem tudo incluído (refeição etc) nesse valor, mas o do André é pró-labore."

**➡️ Pergunta:** o pró-labore do André é R$ 2.900 fixo + o resto (VR, plantão, bônus) é lançado à parte a cada mês? Ou o pró-labore real é ~R$ 4.500 e a planilha detalha a composição?

---

## 4. Reajustes de salário no meio do ano

A planilha mostra salários que **mudaram durante 2026** — o cadastro do sistema só guarda o valor atual:

| Funcionário | Base início do ano | Mudou para | Quando |
|---|---|---|---|
| Luis | 3.701,25 | **4.201,25** | maio |
| Almira | 1.805 | **2.055** | julho |
| Gabriel | 533,33 (proporcional) | 1.600 (cheio) | maio |

**➡️ Pergunta:** confirmar os valores e as datas dos reajustes. _(A migração histórica usa o valor real de cada mês, então não trava — mas o cadastro precisa refletir o valor corrente certo.)_

---

## 5. Datas de admissão erradas no cadastro

| Funcionário | No sistema | Na planilha (correto) |
|---|---|---|
| Luis | 01/04/2025 | **14/02/2025** |
| Welligton | (em branco) | **08/07/2024** |
| Pedro | (em branco) | **02/06/2025** |
| Almira | 02/05/2026 | **23/03/2026** (1º pagamento em abril, ref. março) |

**➡️ Ação:** já vamos corrigir. Só confirmar as datas.

---

## 6. Adiantamento — marcar como FIXO

No cadastro, o adiantamento do Luis e do Welligton está como "varia". A planilha mostra valor fixo todo mês:
- Luis: **R$ 1.680,50**
- Welligton: **R$ 1.739,38** (ver item 1 — mudou em maio?)
- Pedro: R$ 722 (já está certo)

A cliente já orientou: "deixar um valor padrão que ela colocou, com opção de alterar na hora de marcar como pago".

**➡️ Ação:** marcar Luis e Welligton como adiantamento FIXO com esses valores.

---

## 7. Empréstimo de salário da Fabiana — R$ 9.000 lançado DUAS vezes

Em abril tem **dois** lançamentos de "Empréstimo de Salário Fabiana (ref. abril)" de R$ 9.000 — um como despesa (id 536) e um como movimentação (id 637). O extrato deve mostrar só um.

**➡️ Pergunta:** confirmar o valor real do empréstimo e que foi pago 1 vez só. _(A migração remove os dois e recria a partir da planilha — se a planilha também tiver duplicado, precisamos saber.)_

---

## 8. "Pagamento Referente ao Mês Julho/2026" — R$ 4.543,55 sem nome

Lançamento id 1005 (agosto), categoria "Salários", sem dizer de qual funcionário.

**➡️ Pergunta:** de quem é esse pagamento?

---

## 9. Rescisão do Pedro (desligado 07/08/2026)

- id 954 "Pix Rescisão Pedro Silva" — R$ 5.152,32
- id 902 "FGTS (Rescisão Pedro)" — R$ 1.079,38

**➡️ Pergunta:** confirmar o valor total da rescisão e se tem mais alguma verba (férias proporcional, 13º proporcional, aviso).

---

## 10. Agosto/2026 está lançado DUAS vezes

- **Como pagamentos avulsos** (19 lançamentos, R$ 28.427) — foi a cliente que lançou, com os valores reais.
- **Como parcelas da folha automática** (23 parcelas em aberto, R$ 17.731) — geradas pelo sistema quando cadastramos os funcionários.

**➡️ Decisão:** manter os **avulsos** (são os valores reais pagos) e **cancelar as parcelas automáticas de agosto**? _Recomendação: sim. As parcelas automáticas passam a valer de setembro em diante._

---

## 11. Setembro em diante = folha automática

O `despesas_funcionario.json` tem 13 lançamentos de setembro (R$ 23.035). A partir de setembro, a folha automática (recorrente) já cobre isso.

**➡️ Decisão:** a migração histórica vai **só até julho/2026**. Agosto = itens 10. Setembro+ = folha automática. Confirmar.

---

## 12. Banco de cada pagamento

Todos os lançamentos de folha que vamos criar entram **sem banco definido** — vão pra tela de "Conferência de Bancos" que a cliente já preenche mês a mês (mesma pilha do B1).

**➡️ Sem ação agora** — só saber que a folha de jan–jul vai aparecer lá pra conferir o banco.

---

## Resumo do que a migração vai fazer (depois do "ok")

| Ação | Volume |
|---|---|
| Corrigir cadastro (admissão + adiantamento FIXO) | 4 funcionários |
| Apagar a folha "solta" de jan–jul (movimentações sem vínculo) | 78 registros · R$ 106.680 |
| Recriar a folha jan–jul a partir da planilha FLUXO, vinculada a cada funcionário + categoria | 144 lançamentos · R$ 176.430 |
| Recategorizar encargos/convênio (GPS, FGTS, Amil) pras categorias novas | 26 lançamentos |
| **Não toca:** agosto, folha automática, transferências internas, reembolsos (Pix zelador etc) | — |
