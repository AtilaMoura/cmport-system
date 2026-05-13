Você é especialista no backend do CMPort (FastAPI + SQLAlchemy + MySQL).

## Estrutura obrigatória ao criar qualquer feature
1. Schema Pydantic em `schemas/`
2. Model SQLAlchemy em `models/` (se novo)
3. Repository em `repositories/` (apenas queries, sem lógica)
4. Service em `services/` (lógica de negócio, chama repository)
5. Router em `routers/` (apenas chama service, sem lógica)

Regras:
- Nunca pular camadas (router nunca chama repository diretamente)
- Sempre usar SessionLocal com try/finally
- Comentários em português
- Leia o arquivo relevante antes de agir

---

## Models — Campos Completos

### Condominio (`condominios`)
`nome`, `cnpj`, `razao_social`, `criado_em`

### Endereco (`enderecos`)
`condominio_id` (FK cascade), `rua`, `numero`, `bairro`, `cidade`, `estado`, `cep`

### Contato (`contatos`)
`condominio_id` (FK cascade), `nome`, `email`, `telefone`, `principal` (bool)

### ManutencaoAssistencia (`manutencoes_assistencias`)
`condominio_id` (FK cascade), `nota_fiscal_id` (FK nullable), `tipo` (MANUTENCAO/ASSISTENCIA),
`numero_os`, `data_servico`, `descricao`, `criado_em`

### NotaFiscal (`notas_fiscais`)
`id`, `condominio_id` (FK nullable), `numero_nota` (unique)
`tipo`: MANUTENCAO | ASSISTENCIA | OUTROS
`status`: AUTORIZADA | CANCELADA | DESCONHECIDO
`parcelas` (int), `valor` (float)
`data_vencimento`, `data_pagamento`
`cliente_nome`, `observacao`, `descricao_servico`
`cnpj_emitente` (String 18, nullable) — CNPJ da empresa emissora (salvo no import XML)
`valor_boleto_parcela` (float nullable) — override por parcela
`parcelas_json` (JSON nullable) — `[{parcela, valor, data}]` extraído do XML
`xml_original` (Text) — XML completo para re-parse/revalidação
Tax NFSe: `iss`, `pis`, `cofins`, `inss`, `csll` (float nullable)
Tax NFe: `icms`, `prev` (float nullable) — `prev` = INSS retenção
`alerta_impostos` (int default 0) — 0=ok, 1=divergência detectada
`divergencia_impostos` (JSON nullable) — `{field: {pct, config, xml}}`
`criado_em`

### Boleto (`boletos`)
`id`, `nota_fiscal_id` (FK not null)
`numero_parcela`, `total_parcelas`
`codigo_solicitacao` (nullable) — ID do Inter (null = boleto manual)
`nosso_numero`, `seu_numero` (nullable)
`valor_nominal`, `valor_juros`, `valor_multa`, `valor_total_recebido`
`data_emissao`, `data_vencimento`, `data_pagamento`
`situacao`: EMABERTO | PAGO | CANCELADO | EXPIRADO | VENCIDO | BAIXADO
`tipo_cobranca`: SIMPLES
`forma_pagamento`: BOLETO_INTER | BOLETO_ITAU | PIX | DINHEIRO | TRANSFERENCIA | CHEQUE
`banco_pagamento`, `observacao`, `criado_em`

### TermoGarantia (`termos_garantia`)
`servico_id` (FK ManutencaoAssistencia, UNIQUE), `orcamento_id` (FK nullable)
`produto_descricao`, `prazo_meses`, `data_inicio`, `data_fim`

### ConfiguracaoImpostosServico (`configuracao_impostos_servico`)
`tipo_servico`, `pct_pis`, `pct_cofins`, `pct_inss`, `pct_csll`, `ativo`

Seeds padrão (inseridos se tabela vazia no startup):
```
MANUTENCAO:  PIS 0.65%, COFINS 3.00%, INSS 11.00%, CSLL 1.00%
ASSISTENCIA: PIS 0.65%, COFINS 3.00%, INSS 11.00%, CSLL 1.00%
OUTROS:      todos 0.00%
```

### RegistroExclusao (`registros_exclusoes`)
`entidade`, `entidade_id`, `dados_json` (JSON snapshot completo), `excluido_em`
Sempre chamar `registrar_exclusao()` de `auditoria/router.py` antes de qualquer delete.

### Usuario (`usuarios`)
`nome`, `email` (unique), `senha_hash`, `role` (DEV/ADMIN/USUARIO), `ativo`
Seeds: `atila.dev@cmport.com` (DEV), `admin@cmport.com` (ADMIN), `usuario@cmport.com` (USUARIO)

### ConfiguracaoEmail (`configuracao_email`)
`nome`, `email`, `senha_enc` (criptografada), `ativo`
Apenas uma pode estar `ativo=True` por vez.
`POST /configuracoes/emails/{id}/ativar` — ativa e desativa as demais.

### ConfiguracaoEmpresa (`configuracao_empresa`)
`nome`, `email_from_name`, `telefone`, `site`
Usado como remetente nos emails. `GET/PUT /configuracoes/empresa`

### ConfiguracaoInter (`configuracao_inter`)
`cnpj` (unique), `razao_social`, `client_id`, `client_secret`, `conta_corrente`, `cert_path`, `ativo`
Credenciais do Banco Inter por CNPJ emitente. CRUD via `POST/GET/PUT/DELETE /configuracoes/inter`.
`boleto_service._get_inter_client(nota, db)` usa `nota.cnpj_emitente` para selecionar a conta.

---

## Padrões SQLAlchemy

```python
# Dependency injection no router
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Nunca commitar no router — deixar no service/repository
```

Seeds no startup (`main.py`):
```python
Base.metadata.create_all(bind=engine)
# verifica tabela vazia → insere seeds
```
