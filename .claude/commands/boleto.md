Você é especialista no módulo de boletos do CMPort + integração Banco Inter.

## Arquivos principais
- `backend/app/services/boleto_service.py`
- `backend/app/routers/boleto_router.py`
- `backend/app/services/inter_client.py`
- `backend/app/services/email_service.py`

---

## Fluxo 2-Step de Geração (UI)

### Step 1 — Configuração
```
GET /boletos/config-impostos/{nota_id}
→ ConfigImpostosResponse: {
    pct_pis, pct_cofins, pct_inss, pct_csll,
    valor_bruto, valor_liquido, numero_os,
    aplicar_juros_default, alerta_impostos, divergencia_impostos
  }
```
Usuário edita: alíquotas, valores por parcela, datas, número da nota, descrição.
Validação: `|soma_parcelas - valor_liquido| < 0.005` (threshold, nunca `=== 0`).
"Aprovar Boletos" só habilita quando validação passa.

### Step 2 — Emissão
```
POST /boletos/gerar-parcelas-faltantes/{nota_id}
{
  parcelas_selecionadas: [N],
  valor_total_override: V * total_parcelas,     // para valor V na parcela N
  data_vencimento_override: D - 30*(N-1) dias,  // backend soma os offsets
  pct_pis, pct_cofins, pct_inss, pct_csll,
  aplicar_juros: false,                          // sempre false
  mensagem?: string
}
```
Usuário ainda edita data e descrição no Step 2; valores ficam bloqueados.
"Reabrir Config" volta ao Step 1.

---

## Regras críticas de geração (gerar_parcelas_faltantes)

- Gera apenas parcelas **sem boleto ativo** existente
- `parcelas_selecionadas: [int]` — filtra quais parcelas gerar
- `valor_total_override`: backend divide por `nota.parcelas` → valor por parcela
- `data_vencimento_override` = base; backend soma `+30*(parcel_num-1)` dias

**Cálculo valor líquido:**
- `MANUTENCAO/ASSISTENCIA`: `liquido = valor * (1 - (pis+cofins+inss+csll)/100)`
- `OUTROS`: `liquido = valor` (sem deduções)

**Arredondamento seguro:**
- Parcelas 1..N-1: `Math.floor(liquido/n * 100)/100`
- Última parcela: `liquido - base*(n-1)`

**Status locks:**
- `EMABERTO/VENCIDO` → valor bloqueado (não edita no Step 1)
- `PAGO/BAIXADO` → bloqueio total (não pode regenerar)
- `CANCELADO/EXPIRADO` → pode regenerar

`numero_nota` pode ser atualizado via `PUT /notas-fiscais/{id}` antes de emitir.

---

## Banco Inter (`inter_client.py`)

OAuth2 client_credentials + mTLS (certificados referenciados em `ConfiguracaoInter.cert_path`)
`INTER_ENV=production` | `sandbox` — controla URL base
Token cacheado com buffer de 5 min antes de expirar, por instância.

**`InterClient` é uma classe** — instanciada por conta Inter:
```python
client = InterClient(client_id, client_secret, conta_corrente, cert_path, env)
client.emitir_boleto(payload)               # → codigo_solicitacao
client.consultar_boleto(codigo)             # → status atual
client.cancelar_boleto(codigo, motivo)
client.listar_cobrancas(data_inicio, data_fim)  # bulk sync
client.baixar_pdf(codigo)                   # → bytes
```

**Seleção de conta:** `boleto_service._get_inter_client(nota, db)` busca `ConfiguracaoInter`
pelo `nota.cnpj_emitente`; fallback para cliente padrão (`.env` legado) se não encontrar.

**Sync em lote** itera sobre todas as `ConfiguracaoInter` ativas (suporta múltiplos CNPJs).

**`seuNumero` formato** (máx 15 chars):
- ASSISTENCIA: `{base}-A-{parcela}/{total}` ex: `"109-A-1/2"`
- MANUTENCAO:  `{base}-M-{parcela}/{total}` ex: `"109-M-1/2"`
- OUTROS:      `{numero_nota}-{parcela}/{total}`
- Base truncada para caber no limite de 15 chars com o sufixo

---

## Email de Boleto (`email_service.py`)

`EmailService.enviar_boleto(...)` — envia HTML + PDF + XML da nota como anexos.
SMTP: `smtp.office365.com:587` (STARTTLS)
Credenciais: conta ativa em `ConfiguracaoEmail` (DB), fallback `.env`

Campos editáveis do HTML: `saudacao`, `corpo`, `rodape`
Assinatura: `backend/app/assets/assinatura.jpg` em base64
Pré-visualização: `gerar_html_boleto()` (usado no frontend antes de enviar)

`assunto_override` opcional; padrão: `"Boleto #{numero_nota} — {condominio} — Venc. {data}"`
`anexos_extras: List[(filename, bytes, content_type)]`

---

## Sincronização Automática (APScheduler)

Executa `_sincronizar_boletos_auto()` **a cada hora das 8h às 19h (horário Brasília)**

**Passo 1:** polling individual dos boletos `EMABERTO/VENCIDO` locais via `consultar_boleto()`
**Passo 2:** bulk sync dos últimos 7 dias via `listar_cobrancas()` do Inter
