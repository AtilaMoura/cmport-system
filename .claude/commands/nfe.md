Você é especialista no módulo de notas fiscais do CMPort.

## Arquivos principais
- `backend/app/services/nota_fiscal_service.py`
- `backend/app/routers/nota_fiscal_router.py`
- `backend/app/models/nota_fiscal.py`

---

## Import Flow

`POST /api/v1/notas-fiscais/importar` — aceita `.xml` ou `.zip`

**Auto-detecta:**
- Tipo XML: `NFSe` (municipal) | `NFe` (federal) | `EventoCancelamentoNFe`
- Tipo nota: `MANUTENCAO` | `ASSISTENCIA` | `OUTROS` — pelo prefixo da descrição
- Status: `AUTORIZADA` | `CANCELADA` — notas canceladas são ignoradas no import

**Ao importar MANUTENCAO/ASSISTENCIA vinculada a condomínio:**
→ cria `ManutencaoAssistencia` automaticamente

**Dados extraídos e salvos:**
- `parcelas_json`: `[{parcela, valor, data}]` — extraído do texto da descrição
- `xml_original`: XML completo para re-parse/revalidação futura

---

## Campos do Model NotaFiscal (`notas_fiscais`)

```
id, condominio_id (FK nullable), numero_nota (unique)
tipo: MANUTENCAO | ASSISTENCIA | OUTROS
status: AUTORIZADA | CANCELADA | DESCONHECIDO
parcelas (int), valor (float)
data_vencimento, data_pagamento
cliente_nome, observacao, descricao_servico
valor_boleto_parcela (float nullable)   — override por parcela
parcelas_json (JSON nullable)           — [{parcela, valor, data}]
xml_original (Text)                     — XML completo
Tax NFSe: iss, pis, cofins, inss, csll (float nullable)
Tax NFe:  icms, prev (float nullable)   — prev = INSS retenção
alerta_impostos (int default 0)         — 0=ok, 1=divergência
divergencia_impostos (JSON nullable)    — {field: {pct, config, xml}}
criado_em
```

---

## Impostos e Divergência

**Alíquotas padrão (ConfiguracaoImpostosServico):**
```
MANUTENCAO:  PIS 0.65%, COFINS 3.00%, INSS 11.00%, CSLL 1.00%
ASSISTENCIA: PIS 0.65%, COFINS 3.00%, INSS 11.00%, CSLL 1.00%
OUTROS:      todos 0.00%
```

**Divergência detectada no import:**
- Compara alíquotas do XML vs `ConfiguracaoImpostosServico`
- Se diferente: `alerta_impostos=1`, `divergencia_impostos={field: {pct, config, xml}}`

**Revalidação:** endpoint re-processa o `xml_original` salvo (sem precisar re-importar).

---

## Cálculo valor líquido (chamado pelo boleto_service)

```
MANUTENCAO/ASSISTENCIA: liquido = valor * (1 - (pis+cofins+inss+csll)/100)
OUTROS: liquido = valor
```

Alíquotas podem ser sobrescritas por request via `pct_pis`, `pct_cofins`, `pct_inss`, `pct_csll`.
