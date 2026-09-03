# Passo 2b — Cruzamento sistema × extrato (SAÍDAS), Agosto/2026

_Rodado 03/09/2026 via `comparar_saidas_agosto.py` (SSH read-only na produção). **Nada aplicado.**_

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

## B. Saídas do sistema SEM par no extrato (não são transferência) — precisa da planilha

### Inter TEC (banco 4) — 14 itens, R$ 16.079,52 🔴

Salário/folha + fornecedores lançados na Inter TEC mas **não aparecem no extrato
Inter TEC**. Provável: pagos de outra conta (Inter CMPORT / BTG) ou duplicados.
**São exatamente o escopo da Fase D2 da folha + B1.**

| mov | data | valor | categoria | descrição |
|---|---|---|---|---|
| 2097 | 07/08 | 5.152,32 | Salários | Pix Rescisão Pedro Silva |
| 2109 | 13/08 | 4.542,55 | Salários | Andre Moreira Rosa |
| 2137/2138/2142 | 07–11/08 | 1.579,60 | FORN DIPROSSEG | DIPROSSEG VILA PRUDENTE |
| 2139/2140 | 14–17/08 | 2.270,36 | FORN TELMAN MOOCA | TELMAN MOOCA |
| 2143/2145 | 14–26/08 | 1.075,55 | FORN DISFER | DISFER |
| 2113 | 14/08 | 1.000,00 | Desenv. Sistema | Atila da Silva Gonçalves Moura |
| 2141 | 18/08 | 110,00 | FORN JT Thenório | JT Thenório |
| 2116 | 17/08 | 39,90 | Quero Faturar | Quero Faturar |
| 1744 | 20/08 | 259,24 | Impostos | DAS Simples Nacional ref. 07 |
| 2096 | 04/08 | 50,00 | Adiantamento | Pix Andre Moreira Rosa |

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

1. **Lote 1 (seguro, alto grau de certeza)** — soft-delete das 24–25 transferências
   duplicadas como SAÍDA (seção A): Itaú 6 + Inter CMPORT 10 + Inter TEC 8.
   Script novo `limpar_transf_duplicada_saida_agosto.py` no padrão do Passo 2 da D2
   (soft-delete `despesas` + `despesa_parcelas` + `fin_movimentacoes`, `registrar_exclusao`,
   backup, dry-run → `--aplicar` com ok do Atila). Depois: Itaú fecha 100%, Inter CMPORT ~R$1,5k, Inter TEC ~R$16k.
2. **Lote 2** — ajuste dos pares que casam com data/descrição diferente (Convênio Médico
   ↔ ABF; QUISI; multas moto ↔ CAF) — só marcar como conciliado / ajustar data, sem apagar.
3. **Lote 3 (depende da planilha + Fase D2)** — os R$ 16k da Inter TEC (folha + fornecedores):
   decidir conta certa / duplicata caso a caso com a cliente. Coordenar com o agente da D2.
