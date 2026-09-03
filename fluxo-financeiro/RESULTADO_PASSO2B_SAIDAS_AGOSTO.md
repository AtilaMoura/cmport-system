# Passo 2b — Cruzamento sistema × extrato (SAÍDAS), Agosto/2026

_Rodado 03/09/2026 via `comparar_saidas_agosto.py`._

## ✅ APLICADO EM PRODUÇÃO 03/09 — `limpar_duplicadas_saidas_agosto.py --aplicar`

Backup: `backup_producao_pre_limpeza_duplicadas_saidas_agosto_20260903_1332.sql` (9,9 MB).
**42 saídas duplicadas soft-deletadas** (mov + despesa + `registros_exclusoes`) + 1 correção de data:
- Lote 1 (26) — transferência lançada 2× como SAÍDA
- Lote 2 (10) — fornecedor do batch 31/08 repetindo a migração de 25/08
- Lote 3 (1)  — folha: mov 2097 (cópia de 2092)
- Lote 4 (5)  — dups do cruzamento fino: `2041` (Armarinhos), `2027` (Zona Azul/Café), `2030` (Café), `1708` (Posto Gasolina valor errado), `2091` (Pix André)
- Data: mov `1934` "Convênio Médico" 20/08 → 26/08 (= linha "Assoc. Beneficência" do extrato)

### Estado final — saídas sistema × extrato (todas as categorias: fornecedor + folha + despesa)

| Conta | Sistema (antes) | Sistema (agora) | Extrato bruto | Extrato real¹ | Δ real |
|---|---|---|---|---|---|
| **Itaú CMPORT** | 10.162,95 | **6.793,61** | 6.793,61 | 6.793,61 | **0,00** ✅ |
| **Inter CMPORT** | 49.048,05 | **26.565,99** | 27.592,10 | 26.126,76 | **+439,23** ⚠️ |
| **Inter TEC** | 70.667,80 | **51.980,71** | 47.178,92 | 47.178,92 | **+4.801,79** 🔴 |

¹ Extrato real Inter CMPORT = 27.592,10 − 826,97 (QUISI 11/08: −826,97 estornado no mesmo dia por
  +826,97 "Devolução", refeito 12/08 = mov 1251) − 638,37 (CM PORT 31/08: é a transferência
  CMPORT→Bradesco, mov ENTRADA 2078 — o parser do extrato classificou como SAÍDA).

### Lote 5 (03/09, com os 5 extratos — BTG + Bradesco chegaram)

- **Bradesco: saídas 100% conciliadas** (R$ 2.444,09): tarifas 26,67+57,53, "Capital de Giro" 1.559,89, "Moya Consultor" 800,00.
- **BTG: saídas 100% conciliadas** (R$ 3.502,48): GPS 1.816,59, presentes 69,99+40,90, Jusmarina 225,00, transf p/ Inter CMPORT 1.350,00.
- **mov `1265` "Conta de Luz" R$ 439,23 → soft-delete.** Era leftover da RECORRENTE "Conta de Luz"
  (despesa 10, abandonada/deletada 27/08). Não está em NENHUM dos 5 extratos. A conta de luz real de
  agosto é a **ENEL R$ 476,95** (mov 2044, no extrato Inter CMPORT).
- **mov `2109` salário André R$ 4.542,55 → soft-delete.** É duplicata da mov `2147` (R$ 4.543,55, que
  bate exato com o extrato Inter TEC de 13/08). mov 2147 renomeada "Salário André Moreira Rosa - Agosto/2026".
- **mov `2075`**: `banco_origem_id` 1→2 — a transf de R$ 600 pro Bradesco (26/08) saiu da **Inter CMPORT**
  (extrato Inter CM), não do Itaú. → **Itaú passa a fechar 100% também no SALDO** (calc −92,32 = extrato −92,32).

### mov 1744 "DAS Simples 07/2026" R$ 259,24 — também é fantasma, EXCLUÍDA

A **despesa 452** (DAS 07/2026) já tinha sido soft-deletada em 31/08 (mesma coisa da mov 1265 e 2109:
despesa apagada, mov solta). Não está em nenhum dos 5 extratos. Há outros DAS de R$ 259,24 (mov 1741
ref 05/2026 pago 15/06; mov 1745). → **mov 1744 soft-deletada** (só a mov, despesa já estava).

### ✅ ESTADO FINAL — SAÍDAS sistema × extrato: 5 de 5 contas fecham 100%

| Conta | Saídas sistema | Saídas extrato | Δ |
|---|---|---|---|
| **Itaú CMPORT** | 6.793,61 | 6.793,61 | **0,00 ✅** |
| **Inter CMPORT** | 26.126,76 | 26.126,76¹ | **0,00 ✅** |
| **Bradesco CMPORT** | 2.444,09 | 2.444,09 | **0,00 ✅** |
| **Inter TEC** | 47.178,92 | 47.178,92 | **0,00 ✅** |
| **BTG TEC** | 3.502,48 | 3.502,48 | **0,00 ✅** |

**45 saídas duplicadas/fantasma removidas** de agosto (Lotes 1–5) + 3 correções de metadado
(mov 1934 data, mov 2147 descrição, mov 2075 origem). Itaú, Bradesco e BTG também fecham no **saldo**.

### Ainda aberto (fora do escopo de saídas)

- **Conciliação de SALDO das contas Inter** — Inter CMPORT e Inter TEC ainda não fecham no saldo
  (diferença nas TRANSFERÊNCIAS, Passo 3: origens/destinos, transferências lançadas só de um lado).
  Itaú, Bradesco e BTG: saídas ok; saldo do Itaú fecha; Bradesco/BTG sem saldo inicial informado.

---


Saídas do sistema = `fin_movimentacoes` tipo SAIDA (despesa geral + fornecedor + folha
espelham todas aqui), ago/2026. Saídas do extrato = SAIDA + TARIFA + DÉBITO CARTÃO
(valor negativo). Casa por valor (±R$0,02) e data (±5 dias).

## Resumo por conta

| Conta | Extrato saídas | Sistema saídas | Δ bruto | Transf. lançada 2× como saída | Δ após limpar transf |
|---|---|---|---|---|---|
| **Itaú CMPORT** (1) | 6.793,61 | 10.162,95 | +3.369,34 | **3.369,34** (6 movs) | **0,00** ✅ |
| **Inter CMPORT** (2) | 27.592,10 | 49.048,05 | +21.455,95 | **19.951,11** (10 movs) | **~1.505** ⚠️ |
| **Inter TEC** (4) | 47.178,92 | 70.667,80 | +23.488,88 | **7.409,36** (9 movs) | **~16.079** 🔴 |

**A maior causa da divergência das saídas é transferência interna lançada 2×:**
uma vez (certo) como `fin_movimentacoes` ENTRADA com `banco_origem_id` no lado que
recebeu, e outra vez (errado) como uma **Despesa UNICO → DespesaParcela PAGO →
mov SAIDA** com descrição "Pix Cmport Inter para Cmport Tec" / "Pix Itau para..." /
"Pagar Contas", categoria **Diversos**, origem MANUAL.

---

## A. Transferências duplicadas como SAÍDA — CONFIRMADAS 1:1, propor soft-delete

Cada uma bate exato (valor + data) com uma transferência ENTRADA já lançada.
Estrutura: `despesas` (UNICO, 1 parcela) → `despesa_parcelas` (PAGO) → `fin_movimentacoes` SAIDA.
Soft-delete tem que pegar os 3 (padrão do Passo 2 da Fase D2).

### Itaú CMPORT (banco 1) — 6 movs, R$ 3.369,34

| mov SAIDA | despesa | data | valor | espelho ENTRADA |
|---|---|---|---|---|
| 2047 | 900 | 05/08 | 200,00 | 2005 |
| 2048 | — | 06/08 | 50,00 | 2006 |
| 2050 | — | 07/08 | 1.882,24 | 2060 |
| 2051 | — | 12/08 | 199,73 | 2062 |
| 2053 | — | 21/08 | 487,20 | 2067 |
| 2054 | — | 24/08 | 550,17 | 2011 |

→ **Itaú fecha 100%** depois disso (as 6 "Multa Moto" de 11/08, R$ 805,25, = a linha
agregada `PAGAMENTOS — COORD ADM FINANCEIRA CAF` do extrato).

### Inter CMPORT (banco 2) — 10 movs, R$ 19.951,11

| mov SAIDA | despesa | data | valor | espelho ENTRADA |
|---|---|---|---|---|
| 2018 | 871 | 11/08 | 10.000,00 | 2061 |
| 2020 | — | 13/08 | 1.400,00 | 2064 |
| 2024 | — | 14/08 | 1.200,00 | 2065 |
| 2042 | — | 20/08 | 439,23 | 2066 |
| 2028 | — | 21/08 | 2.641,88 | 2068 |
| 2029 | — | 21/08 | 700,00 | 2069 |
| 2032 | — | 25/08 | 300,00 | 2070 |
| 2033 | — | 25/08 | 870,00 | 2071 |
| 2019 | — | 27/08 | 900,00 | 2063 |
| 2080 | — | 28/08 | 1.500,00 | 2072 |

### Inter TEC (banco 4) — 9 movs, R$ 7.409,36 (8 confirmados + 1 a checar)

| mov SAIDA | despesa | data | valor | espelho ENTRADA (banco_origem_id=4) |
|---|---|---|---|---|
| 2095 | — | 03/08 | 50,00 | 2003 |
| 2090 **ou** 2094 | — | 03/08 | 245,00 | 2004 |
| 2094 **ou** 2090 | 950? | 03/08 | 245,00 | **sem par** — checar na planilha (há um `-245 Pix enviado LSC ASSISTENCIA` no extrato Inter CMPORT — pode ser pagamento real a fornecedor) |
| 2103 | — | 11/08 | 1.304,44 | 2007 |
| 2093 | 950 | 11/08 | 2.014,92 | 2008 |
| 2115 | — | 17/08 | 1.000,00 | 2009 |
| 2117 | — | 18/08 | 950,00 | 2010 |
| 2129 | — | 26/08 | 400,00 | 2014 |
| 2131 | — | 26/08 | 1.200,00 | 2013 |

---

## B. Inter TEC — o overage é uma RE-ENTRADA da folha+fornecedores em 31/08 🔴

**Achado (investigação item a item, 03/09):** em **2026-08-31, entre 18:43 e 20:14**,
alguém lançou **58 saídas na Inter TEC (movs 2090–2147, R$ 63.919,67)** — praticamente
o mês inteiro de folha + fornecedores + transferências, de novo. (+ 9 movs no mesmo
batch na Inter CMPORT, movs 2080–2088.)

O que já existia antes desse batch:
- **Batch A — 25/08 (migração Fornecedor, `project_despesa_fornecedor_parcelamento`):**
  movs 1240–1282 + 1744 + 1994–2001 (12 movs banco 4, `fornecedor_id` preenchido).
- Transferências internas corretas (movs 2003–2014 ENTRADA c/ `banco_origem_id`).

Sobreposição medida: **11 das 58 têm valor+data idênticos a uma mov do Batch A**
(DIPROSSEG, TELMAN, DISFER, JT Thenório, Quero Faturar, Atila, Rescisão Pedro).

### Decomposição do overage da Inter TEC (~R$ 23.489)

| Grupo | Movs | R$ aprox. | Ação |
|---|---|---|---|
| Transferências duplicadas (seção A) | 8 | 7.409 | soft-delete (Lote 1) |
| Fornecedor: 31/08 repete o Batch A de 25/08 | 11–12 | 11.578 | **Lote 2** — soft-delete o par de 31/08, manter o de 25/08 (`fornecedor_id`) |
| `2090`+`2094` "Pix Cmport Inter" R$ 245 ×2 | 2 | 490 | só há 1 transf −245 no extrato; há `−245 Pix enviado LSC` no extrato Inter CMPORT — ver |
| **Folha (salários) do batch 31/08** — Almira, Welligton, Gabriel, Luis, Fabiana, André, Pedro rescisão, impostos, sindicatos, convênios | ~30 | ~35–40k | **NÃO é duplicata de mov** — é o registro da folha de agosto. Colide com as 23 parcelas RECORRENTE PENDENTE → **escopo da Fase D2, coordenar com o agente da folha** |
| Órfãos reais: `2109` André R$ 4.542,55 · `1744` DAS R$ 259,24 | 2 | 4.802 | precisa da planilha / cliente |

Depois dos Lotes 1+2 a Inter TEC cai de R$ 70.667 para ~R$ 51.680, contra extrato
R$ 47.178 — o resto (~R$ 4,5k) é o `2109` + a folha (Fase D2).

### Inter CMPORT (banco 2) — 6 itens, R$ 3.635,58 ⚠️

Parte casa com o extrato por data/descrição diferente:
- `Convênio Médico` R$ 1.303,77 (mov 1934, 20/08) = extrato `ASSOCIACAO DE BENEFICENCIA E FILANTROPIA` 26/08 (>5 dias, não casou automático).
- `Conta de Luz` R$ 439,23 (mov 1265) — checar (há uma transf de mesmo valor no dia).
- Armarinhos Fernandes R$ 543 · Zona Azul R$ 13,90 · Posto Gasolina R$ 1.319,99 · Café R$ 15,69 — conferir conta/data.

### Falta lançar (no extrato, sem nada no sistema)

| Conta | data | valor | descrição extrato |
|---|---|---|---|
| Inter CMPORT | 12/08 | 826,97 | QUISI CONTABILIDADE — **já esclarecido no Passo 2** (devolução+refação; mov 1251 existe, data 12/08 — reconferir) |
| Inter CMPORT | 26/08 | 1.303,77 | ASSOCIAÇÃO DE BENEFICÊNCIA — = Convênio Médico mov 1934 (ver acima) |
| Itaú | 11/08 | 805,25 | PAGAMENTOS COORD ADM FINANCEIRA CAF = as 6 multas moto (movs 1711–1716) |

---

## Plano proposto

**Validação feita:** as 24 da seção A foram conferidas contra o extrato do banco (cada
transferência aparece 1× no extrato e casa com a mov ENTRADA correta) E contra a mov
ENTRADA no sistema. A SAÍDA é a sobra.

1. **Lote 1 — 24 transferências duplicadas como SAÍDA** (Itaú 6 + Inter CMPORT 10 + Inter TEC 8).
   Confirmadas sistema + extrato. Script `limpar_transf_duplicada_saida_agosto.py` no padrão
   do Passo 2 da D2 (soft-delete `despesas` + `despesa_parcelas` + `fin_movimentacoes`,
   `registrar_exclusao`, backup, dry-run → `--aplicar` com ok do Atila).
   Resultado: **Itaú fecha 100%**, Inter CMPORT vai a ~R$ 1,5k, Inter TEC a ~R$ 16k.
2. **Lote 2 — 11–12 pares fornecedor 31/08 × 25/08** — soft-delete a cópia de 31/08
   (movs 2137–2145 e afins), manter a de 25/08 (tem `fornecedor_id`). Conferir 1 a 1
   com a planilha antes. Coordenar com o agente da D2 (o batch 31/08 é meio-folha).
3. **Lote 3 — ajuste de pares com data/descrição diferente** (Convênio Médico ↔ ABF;
   multas moto ↔ CAF; QUISI) — só marcar como conciliado, sem apagar.
4. **Fase D2 (outro agente)** — a folha do batch 31/08 (~R$ 35–40k) + `2109` André +
   `1744` DAS + as 23 parcelas RECORRENTE PENDENTE de agosto. **Não mexer sem alinhar.**

## ⚠️ Fronteira com a Fase D2

O batch de 31/08 (58 movs, R$ 63.919,67 na Inter TEC) é ao mesmo tempo:
transferências duplicadas (Lote 1) + fornecedor duplicado (Lote 2) + **a folha de
agosto** (D2). Os Lotes 1 e 2 são separáveis e seguros, mas a folha dentro do mesmo
batch é da D2 — **combinar a ordem com o agente da folha antes de aplicar**.
