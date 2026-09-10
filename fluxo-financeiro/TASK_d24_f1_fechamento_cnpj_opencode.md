# TASK opencode — D-24 / F1: Visão Geral do Fluxo separada por CNPJ

> **Você (opencode) implementa. Claude planeja e valida.** Não commitar, não deployar,
> não rodar migração. Só código. Ao terminar: `cd cmport-front && npm run lint && npx tsc --noEmit`
> tem que passar com **zero erro novo**.

Demanda D-24 do canal ("Fechamento Fluxo" / "Visualização geral"): a **Visão Geral**
do `/fluxo-financeiro` precisa mostrar **tudo que entrou e saiu, separado por CNPJ**
(CMPORT e CMPORT TEC), com **totais juntos e separados**, e uma **conferência rígida
com o extrato do banco** — se o valor final não bater com o extrato, tem que aparecer
a diferença em vermelho, destacada.

Esta é a **Fase 1**. F2 (CNPJ nas outras sub-páginas) e F3 (filtros avançados) são
outras tasks — **não faça agora**.

---

## Contexto do que já existe (NÃO reimplementar — reutilizar)

| Endpoint | Arquivo | O que dá |
|---|---|---|
| `GET /api/v1/financeiro/fluxo-mensal?ano&mes[&cnpj]` | `fluxo_financeiro_service.py::fluxo_mensal` | entradas de serviço **já separadas por CNPJ e por tipo** (`cnpjs[].total_manutencao / total_assistencia / total_produto / total_recibos`). A entrada é atribuída ao **CNPJ da conta que recebeu** (com fallback pro emitente da nota quando não há banco). |
| `GET /api/v1/financeiro/dashboard/por-banco?ano&mes` | `fin_dashboard_service.py::por_banco` | por **conta bancária**: `entradas`(boleto/recibo/avulso), `transf_recebidas`, `transf_enviadas`, `rendimento`, `saidas`(fornecedor/despesa/funcionario/tarifa), `saldo_inicial`, `saldo_calculado`, `saldo_extrato`, `diferenca`, `bate`. Cada linha já vem com **`empresa`** = `"CMPORT"` \| `"TEC"` \| `null` (derivado de `banco.cnpj_titular`). Tem a linha `"Sem banco identificado"` (empresa `null`) e o `consolidado`. |

`EMPRESA_POR_CNPJ` (mesmo mapa nos dois services):
```python
{"22761557000188": "CMPORT", "65756913000188": "TEC"}
```

---

## PARTE 1 — Backend: novo endpoint `GET /financeiro/dashboard/por-cnpj`

### 1a. Schema — `backend/app/schemas/fin_dashboard_schema.py` (adicionar no fim)

```python
class EntradasCnpjBreakdown(BaseModel):
    manutencao:       Decimal = Decimal(0)
    assistencia:      Decimal = Decimal(0)
    produto:          Decimal = Decimal(0)
    recibos:          Decimal = Decimal(0)
    transf_recebidas: Decimal = Decimal(0)   # transferência interna que caiu em conta desse CNPJ


class SaidasCnpjBreakdown(BaseModel):
    despesa:          Decimal = Decimal(0)
    fornecedor:       Decimal = Decimal(0)
    funcionario:      Decimal = Decimal(0)
    tarifa:           Decimal = Decimal(0)
    transf_enviadas:  Decimal = Decimal(0)   # transferência interna que saiu de conta desse CNPJ


class DashboardCnpjLinha(BaseModel):
    cnpj:            Optional[str] = None        # None = bloco "Sem CNPJ" / "Consolidado"
    razao_social:    str
    empresa:         Optional[str] = None        # "CMPORT" | "TEC" | None

    entradas:        EntradasCnpjBreakdown = EntradasCnpjBreakdown()
    entradas_total:  Decimal = Decimal(0)        # soma do breakdown de entradas
    saidas:          SaidasCnpjBreakdown = SaidasCnpjBreakdown()
    saidas_total:    Decimal = Decimal(0)        # soma do breakdown de saídas
    rendimento:      Decimal = Decimal(0)
    saldo_movimento: Decimal = Decimal(0)        # entradas_total + rendimento - saidas_total (fluxo do mês)

    # ── Conferência com o extrato (soma das contas desse CNPJ) ──
    # Vem do por-banco. Só é conclusiva quando TODAS as contas do CNPJ têm
    # saldo_inicial E saldo_extrato informados.
    saldo_inicial:          Optional[Decimal] = None
    saldo_calculado:        Optional[Decimal] = None
    saldo_extrato:          Optional[Decimal] = None
    diferenca:              Optional[Decimal] = None   # saldo_calculado - saldo_extrato
    bate:                   Optional[bool]    = None   # |diferenca| < 0,02
    conferencia_completa:   bool = False               # True só se deu pra fechar a conta
    contas_sem_saldo:       List[str] = []             # nomes das contas sem saldo inicial/extrato


class DashboardPorCnpjResponse(BaseModel):
    ano:          int
    mes:          int
    empresas:     List[DashboardCnpjLinha]     # uma por CNPJ configurado (ordem: CMPORT, TEC)
    sem_cnpj:     Optional[DashboardCnpjLinha] = None   # entradas/saídas sem banco → sem CNPJ
    consolidado:  DashboardCnpjLinha                    # soma de empresas + sem_cnpj
```

### 1b. Service — `backend/app/services/fin_dashboard_service.py`

Adicionar `FinDashboardService.por_cnpj(db, ano, mes) -> DashboardPorCnpjResponse`.

**NÃO fazer query nova.** Compor os dois services que já existem:

```python
@staticmethod
def por_cnpj(db: Session, ano: int, mes: int) -> DashboardPorCnpjResponse:
    from app.services.fluxo_financeiro_service import FluxoFinanceiroService
    from app.repositories.configuracao_repository import ConfiguracaoInterRepository

    fluxo   = FluxoFinanceiroService.fluxo_mensal(db, ano, mes)     # entradas por CNPJ+tipo
    banco   = FinDashboardService.por_banco(db, ano, mes)           # saídas/transf/saldo por conta

    # 1) entradas por CNPJ (do fluxo-mensal) — chave = cnpj só dígitos
    ent_por_cnpj = {
        _so_digitos(c.cnpj): c            # c: FluxoFinanceiroCnpj
        for c in fluxo.cnpjs
    }

    # 2) agrupa as linhas do por-banco por empresa ("CMPORT"/"TEC"/None)
    #    somando saidas.*, transf_*, rendimento, saldo_inicial, saldo_calculado,
    #    saldo_extrato. Guardar quais contas ficaram sem saldo_inicial/saldo_extrato.
    #    IMPORTANTE: a linha consolidada do por-banco NÃO entra aqui (é só p/ conferência).

    # 3) monta uma DashboardCnpjLinha por CNPJ configurado (ordem das configs):
    #    - entradas: do ent_por_cnpj (manutencao/assistencia/produto/recibos)
    #    - entradas.transf_recebidas: do grupo por-banco daquela empresa
    #    - entradas_total = manutencao+assistencia+produto+recibos+transf_recebidas
    #    - saidas.*: do grupo por-banco
    #    - saidas_total = despesa+fornecedor+funcionario+tarifa+transf_enviadas
    #    - saldo_movimento = entradas_total + rendimento - saidas_total
    #    - conferência: saldo_inicial/saldo_calculado/saldo_extrato = somas do grupo;
    #      conferencia_completa = (todas as contas da empresa têm os 2 saldos);
    #      diferenca = saldo_calculado - saldo_extrato quando os 2 != None;
    #      bate = |diferenca| < 0,02.  Se !conferencia_completa => bate=None.

    # 4) sem_cnpj: a linha "Sem banco identificado" do por-banco (empresa None) +
    #    as entradas do fluxo-mensal cujo CNPJ resolvido NÃO é CMPORT nem TEC
    #    (raro, mas cobre). Só retorna sem_cnpj != None se tiver algum valor != 0.

    # 5) consolidado: soma empresas + sem_cnpj em todos os campos.
    #    diferenca do consolidado = soma(saldo_calculado) - soma(saldo_extrato)
    #    usando só as contas que têm os dois (mesma regra do por_banco.consolidado —
    #    pode reaproveitar banco.consolidado.diferenca / .bate direto).
```

Usar `_d`, `_r2`, `_so_digitos`, `Z`, `TOLERANCIA` que já existem no arquivo.
`razao_social` de cada empresa: pegar de `ConfiguracaoInterRepository.get_all(db)` (campo `.razao_social`), casando pelo CNPJ. Consolidado: `razao_social="Consolidado"`. sem_cnpj: `razao_social="Sem CNPJ / sem banco"`.

### 1c. Router — `backend/app/routers/fluxo_financeiro_router.py`

Logo depois de `dashboard_por_banco`:

```python
@router.get("/dashboard/por-cnpj", response_model=DashboardPorCnpjResponse)
def dashboard_por_cnpj(
    ano: int = Query(..., ge=2020, le=2100),
    mes: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
):
    """Fluxo do mês separado por CNPJ (CMPORT / TEC) + consolidado: entradas e
    saídas com breakdown, totais juntos e separados, e conferência com o extrato."""
    return FinDashboardService.por_cnpj(db, ano=ano, mes=mes)
```
Importar `DashboardPorCnpjResponse` no topo (junto do `DashboardPorBancoResponse`).

### 1d. Teste rápido (rodar local, NÃO commitar output)
`cd backend && venv\Scripts\activate && uvicorn app.main:app --reload` e
`GET http://localhost:8000/api/v1/financeiro/dashboard/por-cnpj?ano=2026&mes=8`
(precisa de token — logar em `/docs`). Conferir:
- `empresas[].entradas_total` == soma do breakdown
- `consolidado` == soma de `empresas` + `sem_cnpj`
- `consolidado.diferenca` / `.bate` == o mesmo do `/dashboard/por-banco` `consolidado`

---

## PARTE 2 — Frontend

### 2a. Tipos — `cmport-front/lib/fluxoFinanceiro.ts` (adicionar junto dos outros)

```ts
export interface EntradasCnpjBreakdown {
  manutencao: number; assistencia: number; produto: number; recibos: number; transf_recebidas: number;
}
export interface SaidasCnpjBreakdown {
  despesa: number; fornecedor: number; funcionario: number; tarifa: number; transf_enviadas: number;
}
export interface DashboardCnpjLinha {
  cnpj: string | null;
  razao_social: string;
  empresa: 'CMPORT' | 'TEC' | null;
  entradas: EntradasCnpjBreakdown;
  entradas_total: number;
  saidas: SaidasCnpjBreakdown;
  saidas_total: number;
  rendimento: number;
  saldo_movimento: number;
  saldo_inicial: number | null;
  saldo_calculado: number | null;
  saldo_extrato: number | null;
  diferenca: number | null;
  bate: boolean | null;
  conferencia_completa: boolean;
  contas_sem_saldo: string[];
}
export interface DashboardPorCnpjResponse {
  ano: number; mes: number;
  empresas: DashboardCnpjLinha[];
  sem_cnpj: DashboardCnpjLinha | null;
  consolidado: DashboardCnpjLinha;
}
```
> Backend serializa `Decimal` como **string** — no fetch, converter cada número com `Number(...)`
> (igual a Visão Geral já faz com o `dashboard`). Faça um helper `normalizarLinhaCnpj(raw)` que
> devolve `DashboardCnpjLinha` com todos os campos numéricos passados por `Number()`.

### 2b. Componente novo — `cmport-front/components/fluxo-financeiro/FechamentoPorCnpj.tsx`

`export function FechamentoPorCnpj({ ano, mes, cnpjFiltro }: { ano: number; mes: number; cnpjFiltro?: string })`

- Faz `api.get('/financeiro/dashboard/por-cnpj', { params: { ano, mes } })`, normaliza.
- Decide quais colunas mostrar:
  - `cnpjFiltro` vazio → **CMPORT · CMPORT TEC · Consolidado** (3 colunas) + `sem_cnpj` se != null
  - `cnpjFiltro` = um CNPJ → só a coluna daquela empresa + Consolidado
- Cada coluna é um card (reutilizar o visual do `DashboardPorBanco` — `LinhaCascata`,
  cores verde/vermelho, `fmtValor`):
  ```
  🏢 CMPORT — CMPORT SISTEMAS...
  ── ENTRADAS ──────────────────
   + Manutenção            0,00
   + Assistência           0,00
   + Produto               0,00
   + Recibos               0,00
   + Transf. recebida      0,00
   = Total entradas    X.XXX,XX     (font-black)
  ── SAÍDAS ────────────────────
   − Despesas              0,00
   − Fornecedor            0,00
   − Funcionário (folha)   0,00
   − Tarifa / juros / IR   0,00
   − Transf. enviada       0,00
   = Total saídas      X.XXX,XX     (font-black)
  ── SALDO DO MÊS (CNPJ)   X.XXX,XX (destaque, verde se >=0 / âmbar se <0)
  ── CONFERÊNCIA COM O EXTRATO ──
   Saldo inicial           ...
   Saldo calc. (sistema)   ...
   Saldo do extrato        ...
   [ badge ] Diferença     ...
  ```
- **Badge de conferência (a parte crítica — pedido explícito do Atila):**
  - `conferencia_completa && bate` → verde: `✓ Bate com o extrato (dif R$ 0,00)`
  - `conferencia_completa && !bate` → **vermelho forte, texto grande**:
    `⚠️ NÃO BATE — diferença de {fmtValor(diferenca)}`
  - `!conferencia_completa` → cinza: `Conferência incompleta — falta saldo de: {contas_sem_saldo.join(', ')}`
- Linha `sem_cnpj` (quando != null): card cinza com aviso
  `Estes valores não têm banco vinculado, então não entram na conferência do extrato de nenhum CNPJ.`
  mostrando entradas_total / saidas_total.
- No topo do bloco, um resumo do **Consolidado**: 3 cards (Total Entrada / Total Saída / Diferença extrato)
  no mesmo estilo dos cards que o `DashboardPorBanco` já usa no consolidado.

### 2c. Ligar na Visão Geral — `cmport-front/app/fluxo-financeiro/page.tsx`

- Trocar `const { ano, mes, setAno, setMes } = useFiltrosFluxo()` por
  `const { ano, mes, cnpjFiltro, setAno, setMes, setCnpjFiltro } = useFiltrosFluxo()`.
- No `<FiltrosFluxo>` passar `cnpjFiltro={cnpjFiltro} onCnpjChange={setCnpjFiltro} mostrarFiltroCnpj`.
- Inserir `<FechamentoPorCnpj ano={ano} mes={mes} cnpjFiltro={cnpjFiltro} />` **logo abaixo do
  bloco "Comparativo geral" (os 3 cards Total Entrada / Total Saída / Saldo do Mês) e acima dos
  cards de navegação**. Manter todo o resto da página como está (cards de navegação + `DashboardPorBanco`).
- Não quebrar o `Suspense` já existente.

---

## Regras de aceite (Claude vai conferir)

1. `npm run lint` e `npx tsc --noEmit` — **zero erro novo**.
2. `por-cnpj`: `entradas_total` == soma do breakdown; `consolidado` == `empresas` + `sem_cnpj` campo a campo.
3. `consolidado.diferenca` e `.bate` iguais aos do `/dashboard/por-banco`.
4. Filtro CNPJ na Visão Geral: "Ambos" → 3 colunas; "CMPORT"/"TEC" → 1 coluna + consolidado. Anda na URL (`?cnpj=`).
5. Quando o extrato não bate: aparece o aviso **vermelho** com o valor da diferença. Quando falta saldo: aviso cinza dizendo qual conta.
6. Nada de query SQL nova no `por_cnpj` — só composição de `fluxo_mensal` + `por_banco`.
7. Não tocar: `fluxo_financeiro_service.py`, `fin_dashboard_service.py::por_banco` (só ADICIONAR `por_cnpj`), nenhum arquivo de produção/migração.

## Arquivos que você vai mexer
- `backend/app/schemas/fin_dashboard_schema.py`  (adicionar schemas)
- `backend/app/services/fin_dashboard_service.py` (adicionar `por_cnpj`)
- `backend/app/routers/fluxo_financeiro_router.py` (adicionar rota + import)
- `cmport-front/lib/fluxoFinanceiro.ts` (adicionar tipos)
- `cmport-front/components/fluxo-financeiro/FechamentoPorCnpj.tsx` (novo)
- `cmport-front/app/fluxo-financeiro/page.tsx` (ligar o componente + filtro CNPJ)
