# Refatoracao.md — Tarefa Ativa de Implementação

> **Propósito:** Plano técnico da tarefa em andamento.
> Substituído integralmente a cada nova tarefa iniciada.
> Índice geral e histórico de conclusões em `PLANO_IMPLEMENTACAO.md`.

---

## Tarefa Atual

**Vinculação Automática + Orçamento em PRODUTO + Termo de Garantia via Corpo da Nota**

**Data:** 2026-06-17 | **Prioridade:** Alta | **Status:** 🚧 A implementar

---

## Princípios Arquiteturais (não negociáveis)

1. **Sem redundância de dados** — o corpo da nota referencia o serviço via FK (`servico_id`), nunca copia campos do serviço. Cada dado tem uma única fonte de verdade.

2. **Sem duplicidade na base** — `TermoGarantia` continua pertencendo a `ManutencaoAssistencia` (FK `servico_id` obrigatório no model). O corpo da nota guarda apenas `termo_garantia_id` como referência de conveniência.

3. **Serviço mantém autonomia total** — a página `/servicos/[id]` não muda. O usuário pode criar, editar, desvincular e recriar o Termo de Garantia, vincular/desvincular notas fiscais e realizar qualquer operação no serviço de forma completamente independente do corpo da nota.

4. **Não quebrar o que funciona** — os textos gerados por corpos SERVIÇO e SERVIÇO+produto vinculado são saída crítica e não podem mudar.

---

## O Que Não Pode Mudar (Regressão Obrigatória)

Antes de tocar qualquer arquivo, coletar snapshots via `POST /api/v1/corpos-nota/preview`:

| Cenário | Campo a salvar |
|---------|---------------|
| Corpo SERVIÇO simples | `conteudo_gerado` |
| Corpo SERVIÇO + `valor_nota_produto` + `parcelas_json` | `conteudo_gerado` |
| Corpo PRODUTO standalone | `conteudo_gerado` |
| `npx tsc --noEmit` no frontend | deve passar zero erros |

Após cada fase, conferir que os textos permanecem idênticos.

---

## Fase 0 — Snapshot (antes de qualquer código)

- [ ] Gerar preview de corpo SERVIÇO simples → copiar `conteudo_gerado`
- [ ] Gerar preview de corpo SERVIÇO + nota de produto → copiar `conteudo_gerado`
- [ ] Gerar preview de corpo PRODUTO standalone → copiar `conteudo_gerado`
- [ ] Confirmar `npx tsc --noEmit` zerado antes de começar

---

## Fase 1 — Fix: Orçamentos no Wizard de Corpo PRODUTO

### Problema

A tab OS / ORCAMENTO / MANUAL no Step 3 do wizard só renderiza quando `tipoNota === 'SERVICO'` (linha ~891 de `novo/page.tsx`). Para tipo PRODUTO as tabs ficam invisíveis — o usuário não consegue selecionar Orçamento nem OS ao criar um corpo de nota de produto.

### Arquivo

`cmport-front/app/corpos-nota/novo/page.tsx`

### Mudança — 1 linha

```typescript
// ANTES (linha ~891)
{tipoNota === 'SERVICO' && (
  <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
    {(['OS', 'ORCAMENTO', 'MANUAL'] as const).map(aba => (

// DEPOIS
{tipoNota !== 'MANUTENCAO' && (
  <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
    {(['OS', 'ORCAMENTO', 'MANUAL'] as const).map(aba => (
```

Toda a lógica das tabs (buscar OS, selecionar orçamento, preencher campos derivados) já funciona para SERVIÇO e reaproveita 100% para PRODUTO.

### Checklist Fase 1

- [ ] Wizard tipo PRODUTO → Step 3 exibe tabs OS / ORCAMENTO / MANUAL
- [ ] Selecionar Orçamento → `produtos_json` pré-preenchido + `orcamento_id` salvo no payload
- [ ] Selecionar OS → `servico_id` + `numero_os` + `data_servico_texto` preenchidos
- [ ] Tipo SERVIÇO e MANUTENÇÃO → comportamento idêntico ao de antes
- [ ] `npx tsc --noEmit` zerado

---

## Fase 2 — Fix: Vínculo Automático de Nota PRODUTO Standalone

### Problema

Ao importar um XML de NF-e de produto, o método `tentar_vincular_por_nota_fiscal` detecta CNPJ de conta PRODUTO e chama `_tentar_vincular_nota_produto` — que só procura corpos `tipo_nota=SERVICO`. Corpos `tipo_nota=PRODUTO` standalone nunca recebem vínculo automático. A nota entra no sistema solta, sem conexão com o corpo que a originou.

### Fluxo corrigido

```
XML PRODUTO importado
  → tentar_vincular_por_nota_fiscal()
      → _cnpj_e_produto() = True
          → _tentar_vincular_nota_produto()       [busca corpo SERVICO — existente]
              → achou → vincula ✅ fim
              → não achou → fallback (NOVO):
                  → _tentar_vincular_nota_produto_standalone()  [busca corpo PRODUTO]
                      → 1 candidato → vincula nota_fiscal_id ✅
                      → 2+ candidatos → retorna lista (vínculo manual)
                      → 0 candidatos → None (nota fica solta, sem erro)
```

### Arquivo 1: `backend/app/repositories/corpo_nota_repository.py`

Adicionar dois métodos estáticos ao final da classe `CorpoNotaRepository`:

```python
@staticmethod
def list_candidatos_produto_standalone_por_numero_nf(
    db: Session,
    condominio_id: int,
    numero_nf: int,
) -> List[CorpoNota]:
    """Corpos tipo=PRODUTO sem nota vinculada com numero_nf exato."""
    return (
        db.query(CorpoNota)
        .filter(
            CorpoNota.condominio_id == condominio_id,
            CorpoNota.tipo_nota == TipoNotaCorpo.PRODUTO,
            CorpoNota.numero_nf == numero_nf,
            CorpoNota.nota_fiscal_id.is_(None),
            CorpoNota.deletado_em.is_(None),
        )
        .all()
    )

@staticmethod
def list_candidatos_produto_standalone_por_mes(
    db: Session,
    condominio_id: int,
    ano: int,
    mes: int,
) -> List[CorpoNota]:
    """Corpos tipo=PRODUTO sem nota vinculada no mês/ano informado."""
    from app.models.ciclo_nota_model import CicloNota
    return (
        db.query(CorpoNota)
        .join(CicloNota, CorpoNota.ciclo_id == CicloNota.id)
        .filter(
            CorpoNota.condominio_id == condominio_id,
            CorpoNota.tipo_nota == TipoNotaCorpo.PRODUTO,
            CicloNota.ano == ano,
            CicloNota.mes == mes,
            CorpoNota.nota_fiscal_id.is_(None),
            CorpoNota.deletado_em.is_(None),
        )
        .all()
    )
```

### Arquivo 2: `backend/app/services/corpo_nota_service.py`

**A — Novo método** (inserir logo após `_tentar_vincular_nota_produto`):

```python
@staticmethod
def _tentar_vincular_nota_produto_standalone(
    db: Session, nota
) -> Optional[list]:
    """
    Fallback: vincula nota PRODUTO a CorpoNota tipo=PRODUTO standalone.
    Chamado quando _tentar_vincular_nota_produto não encontra candidato SERVICO.
    """
    numero_nf_int = None
    if nota.numero_nota:
        try:
            numero_nf_int = int(nota.numero_nota.split('-')[0].strip())
        except (ValueError, IndexError):
            pass

    candidatos = []
    if numero_nf_int:
        candidatos = CorpoNotaRepository.list_candidatos_produto_standalone_por_numero_nf(
            db, nota.condominio_id, numero_nf_int
        )
    if not candidatos and nota.data_vencimento:
        candidatos = CorpoNotaRepository.list_candidatos_produto_standalone_por_mes(
            db, nota.condominio_id,
            nota.data_vencimento.year,
            nota.data_vencimento.month,
        )

    if len(candidatos) == 1:
        corpo = candidatos[0]
        corpo.nota_fiscal_id = nota.id
        corpo.status = StatusCorpoNota.XML_VINCULADO
        nota.corpo_nota_id = corpo.id
        corpo.conteudo_gerado = CorpoNotaService._gerar_conteudo(db, corpo)
        CorpoNotaRepository.save(db, corpo)
        logger.info(f"[PRODUTO-standalone] CorpoNota {corpo.id} vinculado à nota {nota.id}")
        return []
    elif len(candidatos) > 1:
        return candidatos  # múltiplos → vínculo manual
    return None            # sem candidatos → nota fica solta
```

**B — Modificar `tentar_vincular_por_nota_fiscal`** (trecho ~linhas 1323–1336):

```python
# ANTES
if not tipo_corpo and nota.tipo == TipoNota.PRODUTO:
    from app.services.nota_fiscal_service import _cnpj_e_produto
    if _cnpj_e_produto(db, nota.cnpj_emitente):
        return CorpoNotaService._tentar_vincular_nota_produto(db, nota)

# DEPOIS
if not tipo_corpo and nota.tipo == TipoNota.PRODUTO:
    from app.services.nota_fiscal_service import _cnpj_e_produto
    if _cnpj_e_produto(db, nota.cnpj_emitente):
        resultado = CorpoNotaService._tentar_vincular_nota_produto(db, nota)
        if resultado is not None:
            return resultado
        # Fallback: tenta corpo PRODUTO standalone
        return CorpoNotaService._tentar_vincular_nota_produto_standalone(db, nota)
```

### Checklist Fase 2

- [ ] Criar corpo PRODUTO standalone com emitente configurado (`numero_nf_produto=234`) → corpo recebe `numero_nf=234`
- [ ] Importar XML nota PRODUTO número `234-1` mesmo condomínio → `corpo.nota_fiscal_id` preenchido, `nota.corpo_nota_id` preenchido, `corpo.status=XML_VINCULADO`
- [ ] `conteudo_gerado` regenerado após vínculo (NF aparece no cabeçalho do texto)
- [ ] XML nota PRODUTO para condomínio sem corpo PRODUTO → nota fica solta, sem erro
- [ ] Dois corpos PRODUTO no mesmo mês → retorna lista de candidatos, não vincula automaticamente
- [ ] Fluxo SERVIÇO com nota de produto vinculada → não regride

---

## Fase 3 — Termo de Garantia via Corpo da Nota

### Contexto

O `TermoGarantia` é de propriedade do `ManutencaoAssistencia` (FK `servico_id` obrigatório). O corpo da nota guarda apenas `termo_garantia_id` como referência — **nenhum dado é duplicado**.

O serviço em `/servicos/[id]` mantém autonomia total: pode criar, editar, desvincular e recriar o Termo a qualquer momento sem qualquer dependência do corpo da nota.

O corpo da nota oferece um **atalho**: quando já tem OS + produtos + garantia preenchidos, o usuário pode iniciar a geração do Termo diretamente no detalhe do corpo.

### Problema da Data de Início

O corpo pode ser criado antes da execução do serviço. Nesse caso, `data_servico` pode ser null no momento de gerar o Termo. Solução: não auto-gerar silenciosamente. Um botão abre formulário de confirmação pré-preenchido — o usuário ajusta a data se necessário.

### Mapeamento Corpo → Termo (sem duplicar dados)

| Campo do Termo | Origem | Observação |
|----------------|--------|-----------|
| `servico_id` | `corpo.servico_id` | Obrigatório — sem OS vinculada não gera |
| `produto_descricao` | `corpo.produtos_json` serializado | `"3x Motor MKN · 2x Manta"` |
| `prazo_meses` | parse de `corpo.descricao_garantia` | `"06 meses"` → 6, default 12 |
| `data_inicio` | `corpo.data_servico` | Pode ser null — usuário confirma |
| `data_fim` | calculado frontend: `data_inicio + prazo_meses` | |
| `orcamento_id` | `corpo.orcamento_id` | |

### Arquivo 1: `backend/app/services/corpo_nota_service.py`

Dois helpers estáticos (sem efeito colateral, apenas transformação de dados):

```python
@staticmethod
def _serializar_produtos_para_termo(produtos_json: Optional[list]) -> Optional[str]:
    """[{"nome":"Motor","quantidade":3}] → "3x Motor · 2x Manta" """
    if not produtos_json:
        return None
    partes = [
        f"{p.get('quantidade', 1)}x {p.get('nome', '')}"
        for p in produtos_json if p.get('nome')
    ]
    return " · ".join(partes) if partes else None

@staticmethod
def _extrair_prazo_meses(descricao_garantia: Optional[str]) -> int:
    """"06 meses" → 6 | "Motor: 3m / Placa: 1 ano" → 3 | None → 12"""
    if not descricao_garantia:
        return 12
    import re
    m = re.search(r'(\d+)\s*(?:meses?|m\.?)', descricao_garantia, re.IGNORECASE)
    return int(m.group(1)) if m else 12
```

Novo método de serviço (chamado pelo router):

```python
@staticmethod
def pre_gerar_termo(db: Session, corpo_id: int) -> dict:
    corpo = CorpoNotaService.get_by_id(db, corpo_id)

    if not corpo.servico_id:
        return {"pode_gerar": False, "motivo_bloqueio": "Corpo sem OS vinculada (servico_id ausente)"}

    produto_desc = CorpoNotaService._serializar_produtos_para_termo(corpo.produtos_json)
    if not produto_desc:
        return {"pode_gerar": False, "motivo_bloqueio": "Sem produtos listados no corpo (produtos_json vazio)"}

    prazo = CorpoNotaService._extrair_prazo_meses(corpo.descricao_garantia)

    data_inicio = corpo.data_servico  # pode ser None
    data_fim = None
    if data_inicio:
        from dateutil.relativedelta import relativedelta
        data_fim = data_inicio + relativedelta(months=prazo)

    return {
        "pode_gerar": True,
        "motivo_bloqueio": None,
        "servico_id": corpo.servico_id,
        "produto_descricao": produto_desc,
        "prazo_meses": prazo,
        "data_inicio": data_inicio.isoformat() if data_inicio else None,
        "data_fim": data_fim.isoformat() if data_fim else None,
        "orcamento_id": corpo.orcamento_id,
    }
```

### Arquivo 2: `backend/app/schemas/corpo_nota_schema.py`

```python
class PreGerarTermoResponse(BaseModel):
    pode_gerar: bool
    motivo_bloqueio: Optional[str] = None
    servico_id: Optional[int] = None
    produto_descricao: Optional[str] = None
    prazo_meses: int = 12
    data_inicio: Optional[date] = None
    data_fim: Optional[date] = None
    orcamento_id: Optional[int] = None
```

### Arquivo 3: `backend/app/routers/corpo_nota_router.py`

```python
@router.get("/{corpo_id}/pre-gerar-termo", response_model=PreGerarTermoResponse)
def pre_gerar_termo(
    corpo_id: int,
    db: Session = Depends(get_db),
    usuario=Depends(get_current_user),
):
    return CorpoNotaService.pre_gerar_termo(db, corpo_id)
```

### Arquivo 4: `cmport-front/app/corpos-nota/[id]/page.tsx`

Adicionar seção "Termo de Garantia" no detalhe do corpo. A seção só aparece se `corpo.tem_garantia === true`.

**Estado A — sem termo gerado (`termo_garantia_id === null`), com `servico_id`:**

```
┌─────────────────────────────────────────────┐
│ Termo de Garantia                            │
│  [Gerar Termo]  ← botão violet               │
└─────────────────────────────────────────────┘
```

Clicar → chama `GET /corpos-nota/{id}/pre-gerar-termo`:
- `pode_gerar: false` → exibe mensagem do `motivo_bloqueio` inline
- `pode_gerar: true` → abre modal de confirmação:

```
┌─────────────────────────────────────────────┐
│ Confirmar Termo de Garantia                  │
│                                              │
│ Produtos/Serviços:                           │
│ [3x Motor MKN · 2x Manta             ]  ← textarea editável
│                                              │
│ Prazo (meses): [ 6 ]                        │  ← number input
│                                              │
│ Data de início: [ 2026-05-15 ]              │  ← date input (editável)
│ (pode ficar vazio se serviço ainda não foi executado)
│                                              │
│            [Cancelar]  [Confirmar e Salvar]  │
└─────────────────────────────────────────────┘
```

Ao confirmar:
```typescript
// 1. Cria Termo usando endpoint já existente
const dFim = calcularDataFim(dataInicio, prazoMeses); // frontend calcula
const { data: novoTermo } = await api.post('/termos-garantia/', {
  servico_id: preGerar.servico_id,
  produto_descricao: produtoDescricao,  // valor editado pelo usuário
  prazo_meses: prazoMeses,
  data_inicio: dataInicio || null,
  data_fim: dFim || null,
  orcamento_id: preGerar.orcamento_id,
});

// 2. Atualiza referência no corpo (não duplica dado — só guarda o ID)
await api.patch(`/corpos-nota/${corpoId}`, { termo_garantia_id: novoTermo.id });

// 3. Atualiza estado local
setCorpo(prev => ({ ...prev, termo_garantia_id: novoTermo.id }));
```

**Estado B — termo já gerado (`termo_garantia_id !== null`):**

```
┌─────────────────────────────────────────────┐
│ Termo de Garantia  ✓                         │
│  [Ver PDF]  [Preview]  [Ver no Serviço →]   │
└─────────────────────────────────────────────┘
```

"Ver no Serviço →" abre `/servicos/{servico_id}` onde o usuário tem autonomia total para recriar, editar ou desvincular o Termo.

### Estrutura de Vínculos (sem duplicidade)

```
ManutencaoAssistencia (id=42)   ← fonte de verdade do serviço
    ↑ servico_id FK (obrigatório)
TermoGarantia (id=7)            ← Termo é do serviço, não do corpo
    ↑ termo_garantia_id FK (nullable, apenas referência)
CorpoNota (id=15)
```

### Checklist Fase 3

- [ ] Corpo SERVIÇO com OS + `produtos_json` + `descricao_garantia="06 meses"` → botão "Gerar Termo" aparece
- [ ] `GET /pre-gerar-termo` retorna `produto_descricao="3x Motor"`, `prazo_meses=6`, `data_inicio` correto
- [ ] `data_inicio=null` quando `corpo.data_servico` é null → campo vazio no modal, usuário preenche
- [ ] Confirmar modal → `POST /termos-garantia/` cria Termo, `PATCH /corpos-nota/{id}` seta `termo_garantia_id`
- [ ] Estado B exibido após geração: "Ver PDF" e "Ver no Serviço →" funcionais
- [ ] PDF do Termo via `/termos-garantia/{id}/pdf` correto
- [ ] Corpo sem `servico_id` → seção não exibe botão "Gerar Termo"
- [ ] Corpo tipo PRODUTO com OS vinculada → também pode gerar Termo
- [ ] Navegar para `/servicos/{id}` → criar/editar/excluir Termo funciona independentemente (sem regressão)
- [ ] `npx tsc --noEmit` zerado

---

## Mapa de Arquivos

| Arquivo | Fase | O que muda |
|---------|------|-----------|
| `cmport-front/app/corpos-nota/novo/page.tsx` | F1 | 1 linha: `=== 'SERVICO'` → `!== 'MANUTENCAO'` |
| `backend/app/repositories/corpo_nota_repository.py` | F2 | +2 métodos estáticos |
| `backend/app/services/corpo_nota_service.py` | F2, F3 | +1 método fallback, +1 método pre_gerar_termo, +2 helpers |
| `backend/app/schemas/corpo_nota_schema.py` | F3 | +1 schema `PreGerarTermoResponse` |
| `backend/app/routers/corpo_nota_router.py` | F3 | +1 endpoint `GET /{corpo_id}/pre-gerar-termo` |
| `cmport-front/app/corpos-nota/[id]/page.tsx` | F3 | +seção Termo de Garantia + modal de confirmação |

**Não mudam:**
- `corpo_nota_model.py` — `termo_garantia_id` já existe no model
- `termo_garantia_model.py` / `_service.py` / `_router.py` — usados, não alterados
- `_montar_texto_servico` / `_montar_texto_produto` — texto intocado
- `app/servicos/[id]/page.tsx` — autonomia total mantida, zero mudanças

---

## Ordem de Implementação

```
Fase 0 (snapshot)
    ↓
Fase 1 (frontend — 1 linha) ─┐
                              ├── independentes, podem ser em paralelo
Fase 2 (backend — vínculo) ──┘
    ↓
Fase 3 (backend + frontend — Termo)
    ↓
Testes de regressão + deploy
```

---

## Checklist Final

- [ ] Fase 0: snapshots coletados, `npx tsc --noEmit` verde antes de começar
- [ ] Fase 1: tab ORCAMENTO visível no wizard PRODUTO
- [ ] Fase 2: XML PRODUTO standalone vincula automaticamente ao corpo PRODUTO
- [ ] Fase 3: botão "Gerar Termo" funcional, PDF correto, vínculos preenchidos
- [ ] Regressão SERVIÇO simples: `conteudo_gerado` idêntico ao snapshot
- [ ] Regressão SERVIÇO + produto: `conteudo_gerado` idêntico ao snapshot
- [ ] Vínculo automático MANUTENCAO/SERVIÇO existente não regride
- [ ] Serviço em `/servicos/[id]`: Termo pode ser criado/editado/excluído de forma independente
- [ ] `npx tsc --noEmit` zerado no frontend
- [ ] Deploy VPS: `git push vps master`
- [ ] Smoke test produção: corpo PRODUTO → selecionar orçamento → gerar → importar XML → verificar vínculo → gerar Termo

---

## Histórico — Última Tarefa Concluída

**Módulo Corpo da Nota — Fase 1 (Manutenção + Serviço + Produto)**
Commits: `1167252` (backend +3016 linhas) · `6754c46` (frontend +1744 linhas) · `1da01ed` (fix vínculo manual)
Todas as fases A–G concluídas e em produção. Detalhes técnicos arquivados no git.
