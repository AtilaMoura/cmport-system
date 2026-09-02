# Folha de Pagamento — o que dá pra fazer agora × o que precisa da cliente

_Gerado 02/09/2026 · base: `Controle de Funcionarios - 2026.xlsx` + `despesas_funcionario.json` (planilha FLUXO da própria cliente) + estado de produção._

**Resumo:** a migração da folha de **jan–jul/2026 dá pra fazer inteira agora**, sem travar em nada.
O `despesas_funcionario.json` é a planilha FLUXO da cliente — está completa e consistente pros 7
funcionários, mês a mês, e já responde as dúvidas que pareciam bloqueio. Só **3 pontos** precisam
de um "confirma" da cliente, e nenhum deles impede começar.

---

## ✅ Resolvido com o que temos (sem precisar perguntar)

### 1. A folha entra pelo BRUTO (cada pagamento) — confirmado pelos dados
A planilha FLUXO lança **cada saída da conta separada**: salário no dia 12 **+** cada adiantamento
no seu dia. Ex. André, janeiro: salário R$ 4.763,30 + 9 adiantamentos = R$ 6.853,30.
E **jan–abr já está exatamente assim em produção** (as movimentações soltas que vamos organizar).
→ A migração usa os valores do `despesas_funcionario.json` direto.

### 2. Datas de admissão — a planilha diz
Luis **14/02/2025** · Welligton **08/07/2024** · Pedro **02/06/2025** · Almira **23/03/2026**.
→ Corrige no cadastro (Passo 1).

### 3. Adiantamento fixo — a planilha mostra valor idêntico todo mês
Luis **R$ 1.680,50** · Welligton **R$ 1.739,38** (idêntico jan→set, sem exceção).
→ Marca os dois como adiantamento FIXO no cadastro. (Pedro R$ 722 já está certo.)

### 4. Reajustes no meio do ano — não travam
A migração histórica usa o **valor real de cada mês** (do JSON). O cadastro já tem o valor
corrente certo (Luis 4.201,25 · Almira 2.055). Nada a fazer.

### 5. Julho — o JSON tem tudo
A aba julho da planilha Controle está incompleta (falta André/Welligton/Fabiana/Gabriel), mas
o `despesas_funcionario.json` tem julho completo pros 7 (inclusive Férias do Welligton R$ 3.516,81
e PRL). → Usa o JSON.

### 6. PRL, Férias, Vale-refeição avulso — já vêm categorizados
O JSON separa cada tipo; o mapa converte pras categorias novas (95–109). 144 lançamentos,
**100% categorizados**, nenhum "sem categoria".

---

## ⚠️ Precisa de um "confirma" da cliente (mas NÃO trava jan–jul)

### A. Empréstimo de salário da Fabiana — R$ 9.000, lançado 2× em produção, **não existe na planilha FLUXO dela**
Produção tem `id 536` (despesa) + `id 637` (movimentação), os dois de R$ 9.000 em abril.
A planilha FLUXO da cliente **não tem esse lançamento**.
→ **Default: a migração remove os dois e não recria** (segue a planilha da cliente).
→ **Confirmar:** foi erro de digitação? Ou é um empréstimo real que ela controla por fora da folha?

### B. "Pix QUISI (Imposto de Renda - André)" — R$ 220 (id 296, maio), **não está na planilha FLUXO**
Provável IRRF do André pago ao contador, que na planilha já está embutido no salário.
→ **Default: remove, não recria.** Confirmar.

### C. Agosto/2026 fica de fora desta rodada
Agosto está lançado 2× em produção (19 avulsos R$ 28.427 **+** 23 parcelas automáticas R$ 17.731).
→ **Não mexemos em agosto agora.** Vira tarefa separada. A decisão lá vai ser: manter os avulsos
(valores reais) e cancelar as parcelas automáticas de agosto? (setembro+ = folha automática normal).

---

## 📋 Informativo — pra cliente saber, sem ação

- **Pró-labore do André (cadastro = R$ 2.900):** a migração histórica usa os valores reais que
  saíram (R$ 4.166–4.763/mês). O valor do cadastro só afeta a folha automática **de setembro em
  diante** — se estiver errado, é só ajustar lá, não impacta o histórico.
- **Banco de cada pagamento:** os 144 lançamentos entram **sem banco**; aparecem na tela de
  "Conferência de Bancos" pra cliente marcar a conta, igual ela já faz com o resto (fila do B1).
- **Rescisão do Pedro** (R$ 5.152,32 + FGTS R$ 1.079,38) e o "Pagamento ref. Julho R$ 4.543,55"
  são de agosto → ficam pra tarefa de agosto.

---

## O que a migração faz (jan–jul, depois do "pode ir")

| Ação | Volume |
|---|---|
| Corrigir cadastro (4 admissões + adiantamento FIXO Luis/Welligton) | 4 funcionários |
| Soft-delete da folha solta jan–jul (movimentações sem vínculo + abril duplicado) | 78 registros · R$ 106.680 |
| Recriar a folha jan–jul do `despesas_funcionario.json`, vinculada a funcionário + categoria | 144 lançamentos · R$ 176.430 |
| Recategorizar encargos/convênio (GPS/FGTS/Amil) pras categorias novas | 26 lançamentos |
| **Não toca:** agosto, folha automática, transferências internas, reembolsos (Pix zelador etc), empréstimo Fabiana (A) e IR André (B) — removidos, não recriados | — |

**Distribuição por funcionário (jan–jul, valor de caixa):**

| Funcionário | Lançamentos | Total |
|---|--:|--:|
| Luis | 14 | R$ 37.992,05 |
| André | 26 | R$ 36.708,65 |
| Welligton | 16 | R$ 34.726,27 |
| Pedro | 25 | R$ 21.743,56 |
| Fabiana | 23 | R$ 20.997,04 |
| Gabriel | 31 | R$ 13.409,03 |
| Almira | 9 | R$ 10.853,25 |
