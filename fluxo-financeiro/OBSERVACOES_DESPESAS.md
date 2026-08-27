# Observações — Reestruturação de Despesas (planilha → sistema)

_Gerado em 2026-08-21 17:14_


## Resumo

- Lançamentos com pagamento único (NN/01): **687**
- Lançamentos recorrentes mensais (NN/12 — tarifa, aluguel, salário etc., **não são parcelas de uma mesma compra**): **404**
- Séries de parcela identificadas e agrupadas com sucesso (1..N sequencial, sem furos): **2**
- Séries de parcela com pendência (precisam de revisão manual): **24**
- Lançamentos com campo 'parcela' em formato inesperado: **1**

## ⚠️ Convenção NN/12 identificada
A maioria dos lançamentos com denominador `12` (ex.: `01/12`, `02/12`...) **não é uma parcela de uma compra única** — é uma marcação de mês do ano para itens recorrentes (tarifa bancária, aluguel, salário, etc.), com valores diferentes a cada mês. Por isso eles **não foram somados/agrupados** — cada mês continua como um lançamento de despesa independente. Se algum desses `NN/12` for na verdade uma parcela real de compra única, me avise qual para eu corrigir o agrupamento.

## Formato de parcela inesperado
- linha 1740 (CMPORT, DESPESAS ESCRITORIO MÊS JUNHO - 2026): parcela=`01//05` | descrição: Pix Moya Acordo 1/10

## Séries de parcela COM pendência (revisar antes de importar)

### Cartão Clebinho (CMPORT) — 4x
- Motivo: encontradas 1 de 4 parcelas esperadas; numeros de parcela nao batem com 1..4: [1]
- Valor total encontrado: R$ -1392.17
- Período: 2026-01-21 até 2026-01-21
  - linha 234: parcela `01/04` | 2026-01-21 | R$ -1392.17 | "Cartão Clebinho"

### Cartão Armarinhos Fernades (CMPORT) — 2x
- Motivo: numeros de parcela nao batem com 1..2: [1, 1]; numero de parcela duplicado: [1, 1]
- Valor total encontrado: R$ -337.59
- Período: 2026-01-23 até 2026-02-24
  - linha 235: parcela `01/02` | 2026-01-23 | R$ -202 | "Cartão Armarinhos Fernades"
  - linha 565: parcela `01/02` | 2026-02-24 | R$ -135.59 | "Cartão Armarinhos Fernades"

### Multa Fieste OWQ 4033 - 20474399 - (Dia 02/09/2025 10:42) - ( Avenida Ricardo Jafet) - (Celular na Mão) (CMPORT) — 5x
- Motivo: encontradas 1 de 5 parcelas esperadas; numeros de parcela nao batem com 1..5: [1]
- Valor total encontrado: R$ -234.77
- Período: 2026-01-12 até 2026-01-12
  - linha 237: parcela `01/05` | 2026-01-12 | R$ -234.77 | "Multa Fieste OWQ 4033 - 20474399 - (Dia 02/09/2025 10:42) - ( Avenida Ricardo Jafet) - (Celular na Mão)"

### IPVA Carro Palio MVZ9I72 01/05 (CMPORT) — 5x
- Motivo: encontradas 3 de 5 parcelas esperadas; numeros de parcela nao batem com 1..5: [1, 3, 4]
- Valor total encontrado: R$ -501.14
- Período: 2026-01-13 até 2026-04-14
  - linha 238: parcela `01/05` | 2026-01-13 | R$ -124.46 | "IPVA Carro Palio MVZ9I72 01/05"
  - linha 891: parcela `03/05` | 2026-03-13 | R$ -124.46 | "IPVA Carro Palio MVZ9I72 03/05"
  - linha 1206: parcela `04/05` | 2026-04-14 | R$ -252.22 | "IPVA Carro Palio MVZ9I72 04 e 05"

### Advogado Renatinho Acordo 02/10 (CMPORT) — 10x
- Motivo: encontradas 8 de 10 parcelas esperadas; numeros de parcela nao batem com 1..10: [2, 3, 4, 4, 6, 7, 8, 9]; numero de parcela duplicado: [2, 3, 4, 4, 6, 7, 8, 9]
- Valor total encontrado: R$ -2450.0
- Período: 2026-01-22 até 2026-07-03
  - linha 240: parcela `02/10` | 2026-01-22 | R$ -300 | "Advogado Renatinho Acordo 02/10"
  - linha 570: parcela `03/10` | 2026-02-24 | R$ -300 | "Advogado Renatinho Acordo 03/10"
  - linha 893: parcela `04/10` | 2026-03-26 | R$ -300 | "Advogado Renatinho Acordo 04/10"
  - linha 1209: parcela `04/10` | 2026-04-27 | R$ -300 | "Advogado Renatinho Acordo 05/10"
  - linha 1478: parcela `06/10` | 2026-05-29 | R$ -300 | "Advogado Renatinho Acordo 06/10"
  - linha 1961: parcela `07/10` | 2026-07-03 | R$ -300 | "Advogado Renatinho Acordo 07/10"
  - linha 2183: parcela `08/10` | None | R$ -300 | "Advogado Renatinho Acordo 08/10"
  - linha 2184: parcela `09/10` | None | R$ -350 | "Advogado Renatinho Acordo 09/10"

### Bem Mais Familiar (CMPORT) — 2x
- Motivo: encontradas 1 de 2 parcelas esperadas; numeros de parcela nao batem com 1..2: [2]
- Valor total encontrado: R$ -172.48
- Período: 2026-02-09 até 2026-02-09
  - linha 537: parcela `02/02` | 2026-02-09 | R$ -172.48 | "Bem Mais Familiar"

### Berazil Medicina (CMPORT) — 2x
- Motivo: encontradas 1 de 2 parcelas esperadas; numeros de parcela nao batem com 1..2: [2]
- Valor total encontrado: R$ -175.12
- Período: 2026-02-10 até 2026-02-10
  - linha 538: parcela `02/02` | 2026-02-10 | R$ -175.12 | "Berazil Medicina"

### Cartão Clebinho (CMPORT) — 8x
- Motivo: encontradas 4 de 8 parcelas esperadas; numeros de parcela nao batem com 1..8: [1, 2, 4, 5]
- Valor total encontrado: R$ -5848.18
- Período: 2026-02-23 até 2026-05-21
  - linha 564: parcela `01/08` | 2026-02-23 | R$ -1929.67 | "Cartão Clebinho"
  - linha 887: parcela `02/08` | 2026-03-23 | R$ -1929.67 | "Cartão Clebinho"
  - linha 1204: parcela `04/08` | 2026-04-22 | R$ -1451.34 | "Cartão Clebinho"
  - linha 1476: parcela `05/08` | 2026-05-21 | R$ -537.5 | "Cartão Clebinho"

### IPVA Carro Palio MVZ9I72 02''/05 (CMPORT) — 5x
- Motivo: encontradas 1 de 5 parcelas esperadas; numeros de parcela nao batem com 1..5: [2]
- Valor total encontrado: R$ -124.46
- Período: 2026-02-13 até 2026-02-13
  - linha 567: parcela `02/05` | 2026-02-13 | R$ -124.46 | "IPVA Carro Palio MVZ9I72 02''/05"

### IPVA Carro Fiesta OWQ 4033 02/05 (CMPORT) — 5x
- Motivo: encontradas 1 de 5 parcelas esperadas; numeros de parcela nao batem com 1..5: [2]
- Valor total encontrado: R$ -250.64
- Período: 2026-02-18 até 2026-02-18
  - linha 568: parcela `02/05` | 2026-02-18 | R$ -250.64 | "IPVA Carro Fiesta OWQ 4033 02/05"

### Cartão Armarinhos Fernandes (CMPORT) — 2x
- Motivo: encontradas 3 de 2 parcelas esperadas; numeros de parcela nao batem com 1..2: [1, 1, 2]; numero de parcela duplicado: [1, 1, 2]
- Valor total encontrado: R$ -957.28
- Período: 2026-03-26 até 2026-08-22
  - linha 889: parcela `01/02` | 2026-03-26 | R$ -135 | "Cartão Armarinhos Fernandes"
  - linha 2182: parcela `01/02` | 2026-08-01 | R$ -543 | "Cartão Armarinhos Fernandes"
  - linha 2181: parcela `02/02` | 2026-08-22 | R$ -279.28 | "Cartão Armarinhos Fernandes"

### Acordo André Porto (CMPORT) — 10x
- Motivo: encontradas 1 de 10 parcelas esperadas; numeros de parcela nao batem com 1..10: [4]
- Valor total encontrado: R$ -347.13
- Período: 2026-03-19 até 2026-03-19
  - linha 894: parcela `04/10` | 2026-03-19 | R$ -347.13 | "Acordo André Porto"

### Seguro Moto (CMPORT) — 7x
- Motivo: encontradas 5 de 7 parcelas esperadas; numeros de parcela nao batem com 1..7: [1, 2, 3, 4, 5]
- Valor total encontrado: R$ -1334.08
- Período: 2026-04-13 até 2026-08-17
  - linha 1197: parcela `01/07` | 2026-04-13 | R$ -266.81 | "Seguro Moto"
  - linha 1471: parcela `02/07` | 2026-05-13 | R$ -266.81 | "Seguro Moto"
  - linha 1722: parcela `03/07` | 2026-06-12 | R$ -266.82 | "Seguro Moto - 03/07"
  - linha 1951: parcela `04/07` | 2026-07-15 | R$ -266.82 | "Seguro Moto"
  - linha 2172: parcela `05/07` | 2026-08-17 | R$ -266.82 | "Seguro Moto - 05/07"

### Pix Atila (Sistemas + Manutenção) (CMPORT) — 5x
- Motivo: encontradas 1 de 5 parcelas esperadas; numeros de parcela nao batem com 1..5: [1]
- Valor total encontrado: R$ -800.0
- Período: 2026-05-13 até 2026-05-13
  - linha 1486: parcela `01/05` | 2026-05-13 | R$ -800 | "Pix Atila (Sistemas + Manutenção)"

### JLA Serviços Prestados (Email e Servidor) (CMPORT) — 4x
- Motivo: encontradas 2 de 4 parcelas esperadas; numeros de parcela nao batem com 1..4: [4, 4]; numero de parcela duplicado: [4, 4]
- Valor total encontrado: R$ -695.0
- Período: 2026-07-27 até 2026-07-29
  - linha 1964: parcela `04/04` | 2026-07-27 | R$ -575 | "JLA Serviços Prestados (Email e Servidor)"
  - linha 1965: parcela `04/04` | 2026-07-29 | R$ -120 | "JLA Serviços Prestados (Email e Servidor)"

### Pix Moya Acordo 02/05 (CMPORT) — 10x
- Motivo: encontradas 1 de 10 parcelas esperadas; numeros de parcela nao batem com 1..10: [2]
- Valor total encontrado: R$ -800.0
- Período: 2026-07-29 até 2026-07-29
  - linha 1969: parcela `02/10` | 2026-07-29 | R$ -800 | "Pix Moya Acordo 02/05"

### Pix Centro Automotivo Dinamite (Gasolina Luis) (CMPORT) — 10x
- Motivo: encontradas 1 de 10 parcelas esperadas; numeros de parcela nao batem com 1..10: [2]
- Valor total encontrado: R$ -50.0
- Período: 2026-07-23 até 2026-07-23
  - linha 1970: parcela `02/10` | 2026-07-23 | R$ -50 | "Pix Centro Automotivo Dinamite (Gasolina Luis)"

### Pix Gabriel Vale refeição (CMPORT) — 10x
- Motivo: encontradas 1 de 10 parcelas esperadas; numeros de parcela nao batem com 1..10: [1]
- Valor total encontrado: R$ -30.0
- Período: 2026-07-23 até 2026-07-23
  - linha 1971: parcela `01/10` | 2026-07-23 | R$ -30 | "Pix Gabriel Vale refeição"

### Cartão Clebinho (CMPORT) — 3x
- Motivo: encontradas 1 de 3 parcelas esperadas; numeros de parcela nao batem com 1..3: [1]
- Valor total encontrado: R$ -1102.99
- Período: 2026-08-20 até 2026-08-20
  - linha 2180: parcela `01/03` | 2026-08-20 | R$ -1102.99 | "Cartão Clebinho"

### PRL 1ª parcela - Welligton Lucas (TEC) — 5x
- Motivo: encontradas 4 de 5 parcelas esperadas; numeros de parcela nao batem com 1..5: [1, 2, 4, 5]
- Valor total encontrado: R$ -1443.1
- Período: 2026-05-21 até 2026-09-30
  - linha 107: parcela `01/05` | 2026-05-21 | R$ -288.62 | "PRL 1ª parcela - Welligton Lucas"
  - linha 209: parcela `02/05` | 2026-06-23 | R$ -288.62 | "PRL 2ª parcela - Welligton Lucas"
  - linha 447: parcela `04/05` | 2026-08-11 | R$ -577.24 | "PRL 3ª e 4ª parcela - Welligton Lucas"
  - linha 534: parcela `05/05` | 2026-09-30 | R$ -288.62 | "PRL 5ª parcela - Welligton Lucas"

### PRL 1ª parcela - Luis Antonio (TEC) — 5x
- Motivo: numeros de parcela nao batem com 1..5: [1, 2, 2, 4, 5]; numero de parcela duplicado: [1, 2, 2, 4, 5]
- Valor total encontrado: R$ -1180.7
- Período: 2026-05-21 até 2026-09-30
  - linha 108: parcela `01/05` | 2026-05-21 | R$ -236.14 | "PRL 1ª parcela - Luis Antonio"
  - linha 210: parcela `02/05` | 2026-06-23 | R$ -236.14 | "PRL 2ª parcela - Luis Antonio"
  - linha 330: parcela `02/05` | 2026-07-22 | R$ -236.14 | "PRL 3ª parcela - Luis Antonio"
  - linha 448: parcela `04/05` | 2026-08-30 | R$ -236.14 | "PRL 4ª parcela - Luis Antonio"
  - linha 535: parcela `05/05` | 2026-09-30 | R$ -236.14 | "PRL 5ª parcela - Luis Antonio"

### PRL 1ª parcela - Pedro Henrique (TEC) — 5x
- Motivo: encontradas 2 de 5 parcelas esperadas; numeros de parcela nao batem com 1..5: [1, 2]
- Valor total encontrado: R$ -314.86
- Período: 2026-05-21 até 2026-06-23
  - linha 109: parcela `01/05` | 2026-05-21 | R$ -157.43 | "PRL 1ª parcela - Pedro Henrique"
  - linha 211: parcela `02/05` | 2026-06-23 | R$ -157.43 | "PRL 2ª parcela - Pedro Henrique"

### Atila (Sistemas + Manutenção) (TEC) — 5x
- Motivo: encontradas 3 de 5 parcelas esperadas; numeros de parcela nao batem com 1..5: [2, 3, 3]; numero de parcela duplicado: [2, 3, 3]
- Valor total encontrado: R$ -3000.0
- Período: 2026-06-16 até 2026-09-15
  - linha 224: parcela `02/05` | 2026-06-16 | R$ -1000 | "Atila (Sistemas + Manutenção)"
  - linha 471: parcela `03/05` | 2026-08-14 | R$ -1000 | "Atila (Sistemas + Manutenção)"
  - linha 539: parcela `03/05` | 2026-09-15 | R$ -1000 | "Atila (Sistemas + Manutenção)"

### Atila (Sistemas + Manutenção) (TEC) — 9x
- Motivo: encontradas 1 de 9 parcelas esperadas; numeros de parcela nao batem com 1..9: [3]
- Valor total encontrado: R$ -1000.0
- Período: 2026-07-15 até 2026-07-15
  - linha 351: parcela `03/09` | 2026-07-15 | R$ -1000 | "Atila (Sistemas + Manutenção)"

## Séries de parcela agrupadas com sucesso (conferir se o total bate)

- **Cartão Jusmarina** (CMPORT) — 2x — total R$ -703.6 — 2026-01-30 até 2026-03-02
- **IPVA Carro Uno EIH 0C76 01/05** (CMPORT) — 5x — total R$ -810.9 — 2026-01-19 até 2026-05-13
