# Plano de Implementação — Boletos & Impostos CMPort

**Data:** 2026-03-19
**Status:** Em andamento — Backend Fases 1-4 concluídas

---

## Contexto

Refatoração do sistema de boletos e impostos para:
- Não salvar valores de impostos fixos por nota — calcular dinamicamente via tabela de configuração
- Criar tabela `configuracao_impostos_servico` centralizada por tipo de serviço
- Validar impostos do XML contra a configuração (alerta não-bloqueante)
- Modal de pré-visualização antes de gerar boleto (valores editáveis)
- Checkbox de juros (default ON para serviço/manutenção, OFF para produto)
- Tela de detalhe de serviço completa
- Geração em massa de boletos
- Suporte a notas canceladas

---

## Fase 0 — SQL de Migração

```sql
-- Nova tabela de configuração de impostos
CREATE TABLE configuracao_impostos_servico (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tipo_servico ENUM('MANUTENCAO', 'ASSISTENCIA', 'OUTROS') NOT NULL UNIQUE,
    pct_iss     DECIMAL(5,2) NOT NULL DEFAULT 0,
    pct_pis     DECIMAL(5,2) NOT NULL DEFAULT 0,
    pct_cofins  DECIMAL(5,2) NOT NULL DEFAULT 0,
    pct_inss    DECIMAL(5,2) NOT NULL DEFAULT 0,
    pct_csll    DECIMAL(5,2) NOT NULL DEFAULT 0,
    ativo       BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed inicial
INSERT INTO configuracao_impostos_servico (tipo_servico, pct_iss, pct_pis, pct_cofins, pct_inss, pct_csll) VALUES
    ('MANUTENCAO', 5.00, 0.65, 3.00, 11.00, 1.00),
    ('ASSISTENCIA', 5.00, 0.65, 3.00, 11.00, 1.00),
    ('OUTROS',      0.00, 0.00, 0.00,  0.00, 0.00);

-- Adicionar numero_os em manutencoes_assistencias
ALTER TABLE manutencoes_assistencias ADD COLUMN numero_os VARCHAR(50) NULL;

-- Adicionar campos de alerta em notas_fiscais
ALTER TABLE notas_fiscais
    ADD COLUMN alerta_impostos      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN divergencia_impostos JSON NULL;
```

---

## Fase 1 — Backend: Modelos SQLAlchemy

### [ ] 1.1 — Criar `backend/app/models/configuracao_impostos_model.py`
- Model `ConfiguracaoImpostosServico`
- Campos: `id, tipo_servico, pct_iss, pct_pis, pct_cofins, pct_inss, pct_csll, ativo, criado_em`

### [ ] 1.2 — Adicionar `numero_os` em `ManutencaoAssistencia`
- Arquivo: `backend/app/models/servico_model.py` (ou equivalente)
- Campo: `numero_os = Column(String(50), nullable=True)`

### [ ] 1.3 — Adicionar colunas em `NotaFiscal`
- Arquivo: `backend/app/models/nota_fiscal_model.py`
- Campos: `alerta_impostos = Column(Boolean, default=False)`, `divergencia_impostos = Column(JSON, nullable=True)`
- **Manter** colunas `iss, pis, cofins, inss, csll` por enquanto

### [ ] 1.4 — Registrar modelo em `main.py`
- Import do modelo novo para `create_all` incluir a tabela
- Seed automático: checar se tabela vazia → inserir os 3 registros padrão

---

## Fase 2 — Backend: Importação (Fixes + Validação)

### [ ] 2.1 — Fix regex OS para NFe
- Arquivo: `backend/app/services/nota_fiscal_service.py`
- De: `r'[Nn]umero\s+ordem\s+servi[cç]o[:\s]+(\d+)'`
- Para: `r'[Nn]umero\s+(?:da\s+)?ordem\s+servi[cç]o[:\s]+(\d+)'`

### [ ] 2.2 — Salvar `numero_os` em `ManutencaoAssistencia`
- Ao criar/atualizar registro de serviço após importação de XML
- Extrair OS do XML e persistir em `servico.numero_os`

### [ ] 2.3 — Validação de impostos ao importar
- Após salvar nota, consultar `ConfiguracaoImpostosServico` pelo `tipo`
- Comparar `nota.valor * pct/100` vs `nota.iss/pis/cofins/inss/csll` (valores do XML)
- Se `abs(calculado - xml) > 0.10`: setar `nota.alerta_impostos = True` e preencher `nota.divergencia_impostos` com JSON das divergências
- **Não bloquear o fluxo** — apenas registrar alerta

### [ ] 2.4 — Endpoint para dispensar alerta
- `PATCH /api/v1/notas-fiscais/{id}/dispensar-alerta`
- Seta `alerta_impostos = False`, `divergencia_impostos = None`

### [ ] 2.5 — Atualizar schema `NotaFiscalResponse`
- Incluir `alerta_impostos: bool`, `divergencia_impostos: Optional[dict]`
- Incluir `numero_os: Optional[str]` (via join ou campo direto)

---

## Fase 3 — Backend: Cálculo de Valor Líquido

### [ ] 3.1 — Helper `_calcular_valor_liquido(db, nota, pcts_override=None)`
- Arquivo: `backend/app/services/boleto_service.py`
- Consulta `ConfiguracaoImpostosServico` pelo `nota.tipo`
- Se `pcts_override` fornecido, usa os overrides em vez da config
- Retorna `max(round(valor * (1 - total_pct/100), 2), 0.01)`
- Substitui `_calcular_valor_base` atual

### [ ] 3.2 — Novo endpoint `GET /boletos/config-impostos/{nota_id}`
- Retorna: `{ pct_iss, pct_pis, pct_cofins, pct_inss, pct_csll, valor_bruto, valor_liquido, numero_os, aplicar_juros_default }`
- `aplicar_juros_default = True` para MANUTENCAO/ASSISTENCIA, `False` para OUTROS
- Frontend usa esse endpoint para popular o modal de pré-visualização

---

## Fase 4 — Backend: Schemas de Boleto Ampliados

### [ ] 4.1 — Ampliar `GerarBoletosRequest`
```python
class GerarBoletosRequest(BaseModel):
    nota_ids: List[int]
    data_vencimento_override: Optional[date] = None
    valor_total_override: Optional[float] = None
    mensagem: Optional[str] = None
    pct_iss:    Optional[float] = None
    pct_pis:    Optional[float] = None
    pct_cofins: Optional[float] = None
    pct_inss:   Optional[float] = None
    pct_csll:   Optional[float] = None
    aplicar_juros: Optional[bool] = None   # None → default por tipo
    taxa_juros:    Optional[float] = 1.0   # % ao mês
```

### [ ] 4.2 — Ampliar `GerarParcelasFaltantesRequest`
- Mesmos campos opcionais de porcentagem + juros

### [ ] 4.3 — Atualizar `BoletoService.gerar_boletos` e `gerar_parcelas_faltantes`
- Receber os novos campos
- Passar `pcts_override` para `_calcular_valor_liquido`
- Se `aplicar_juros=True`: incluir `mora` e `multa` no payload Inter
- Se `aplicar_juros=False` (ou OUTROS por padrão): omitir `mora`/`multa`

### [ ] 4.4 — Schema `ConfigImpostosResponse`
```python
class ConfigImpostosResponse(BaseModel):
    pct_iss: float
    pct_pis: float
    pct_cofins: float
    pct_inss: float
    pct_csll: float
    valor_bruto: float
    valor_liquido: float
    numero_os: Optional[str]
    aplicar_juros_default: bool
```

---

## Fase 5 — Frontend: Modal de Pré-visualização

### [ ] 5.1 — Serviço de API `getConfigImpostos(notaId)`
- `GET /boletos/config-impostos/{nota_id}`

### [ ] 5.2 — Modal em `app/servicos/[id]/page.tsx`
- Ao clicar "Gerar boleto Inter": chamar `getConfigImpostos`, abrir modal
- Modal exibe:
  - Valor bruto
  - Tabela: ISS / PIS / COFINS / INSS / CSLL com % editável e R$ calculado em tempo real
  - Valor líquido (destaque, recalculado conforme % mudam)
  - Checkbox "Aplicar juros" (default por tipo)
  - Campo "Taxa de juros % a.m." (visível só se checkbox marcado, default 1%)
  - Campo "Data de vencimento" (editável)
  - Campo "Mensagem" (placeholder "OS: {num} | NF: {numero}")
  - Botões: Cancelar | Confirmar e Gerar

### [ ] 5.3 — Modal em `app/notas/[id]/page.tsx`
- Mesma estrutura do 5.2 com tema laranja

### [ ] 5.4 — Exibir alerta de impostos na UI
- Se `nota.alerta_impostos = true`: exibir banner amarelo com divergências
- Botão "Dispensar" → `PATCH /notas-fiscais/{id}/dispensar-alerta`

---

## Fase 6 — Frontend: Tela de Detalhe do Serviço

### [ ] 6.1 — Redesign de `app/servicos/[id]/page.tsx`

**Seção A — Nota Fiscal**
- Número, tipo (badge), status (badge colorido), data emissão
- Valor bruto
- Breakdown impostos: ISS / PIS / COFINS / INSS / CSLL (% e R$)
- Alerta divergência (badge amarelo se `alerta_impostos`)
- Número OS
- Observação

**Seção B — Cliente / Condomínio**
- Nome do condomínio
- Endereço completo
- Contato principal (telefone/email)

**Seção C — Boletos**
- Tabela: Parcela | Valor | Vencimento | Status | Forma | Ações
- Ações por boleto: [PDF] [Download] [Cancelar] [Reg. Pagamento]
- Status badge: PAGO (verde) / A_VENCER (azul) / VENCIDO (vermelho) / CANCELADO (cinza)
- Se sem boleto: botões "Gerar no Inter" e "Registrar pagamento manual"

### [ ] 6.2 — Ações de boleto
- Visualizar PDF: abrir em nova aba (`/boletos/{codigo}/pdf` + `Content-Disposition: inline`)
- Download PDF: link direto download
- Cancelar: confirmar → `POST /boletos/{codigo}/cancelar`
- Registrar pagamento: modal com forma, data, valor

---

## Fase 7 — Frontend: Geração em Massa

### [ ] 7.1 — Checkbox de seleção em `app/notas/page.tsx`
- Checkbox por linha na tabela de notas
- "Selecionar todos" no header

### [ ] 7.2 — Barra de ação flutuante
- Aparece quando ≥1 nota selecionada
- Exibe: "X notas selecionadas" + botão "Gerar boletos"

### [ ] 7.3 — Modal de geração em massa
- Etapa 1: Lista das notas selecionadas, valor líquido por linha (editável)
- Etapa 2: Configuração global (juros default, mensagem padrão)
- Etapa 3: Progresso (chamadas sequenciais, ✓/✗ por nota)

---

## Fase 8 — Notas Canceladas

### [ ] 8.1 — UI para notas canceladas em `app/notas/[id]/page.tsx`
- Badge "Cancelada" em vermelho
- Seção boletos: mostrar boletos existentes (leitura)
- Botões mesmo com status cancelada:
  - "Gerar boleto mesmo assim" → aviso de confirmação extra → fluxo normal
  - "Registrar pagamento manual" → modal já existente

### [ ] 8.2 — Backend: remover bloqueio para notas canceladas
- Verificar se `BoletoService.gerar_boletos` bloqueia notas canceladas
- Se sim, tornar opcional via parâmetro `forcar=True`

---

## Ordem de Implementação

| # | Tarefa | Arquivo(s) Principal(is) |
|---|--------|--------------------------|
| 1 | Modelo `ConfiguracaoImpostosServico` + seed | `models/configuracao_impostos_model.py`, `main.py` |
| 2 | `numero_os` em `ManutencaoAssistencia` | `models/servico_model.py` |
| 3 | `alerta_impostos` + `divergencia_impostos` em `NotaFiscal` | `models/nota_fiscal_model.py` |
| 4 | Fix regex OS NFe | `services/nota_fiscal_service.py` |
| 5 | Validação impostos + salvar `numero_os` no import | `services/nota_fiscal_service.py` |
| 6 | Helper `_calcular_valor_liquido` via config | `services/boleto_service.py` |
| 7 | Endpoint `GET /boletos/config-impostos/{nota_id}` | `routers/boleto_router.py` |
| 8 | Schemas Request ampliados + juros | `schemas/boleto_schema.py` |
| 9 | `gerar_boletos` + `gerar_parcelas_faltantes` com juros | `services/boleto_service.py` |
| 10 | Endpoint dispensar alerta | `routers/nota_fiscal_router.py` |
| 11 | Modal pré-visualização (servicos + notas) | `app/servicos/[id]/page.tsx`, `app/notas/[id]/page.tsx` |
| 12 | Tela detalhe serviço completa | `app/servicos/[id]/page.tsx` |
| 13 | Geração em massa | `app/notas/page.tsx` |
| 14 | Notas canceladas UI + backend | ambos |

---

## Colunas Mantidas (não remover ainda)

As colunas `iss, pis, cofins, inss, csll` em `notas_fiscais` são mantidas.
Remover somente após validar que nenhuma lógica existente depende dos valores absolutos.

---

## Notas de Compatibilidade

- Todos os endpoints existentes continuam funcionando
- Novas funcionalidades são aditivas (novos campos opcionais nos requests)
- Seed da tabela de configuração é idempotente (só insere se vazia)
