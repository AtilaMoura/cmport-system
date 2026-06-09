Você é especialista no módulo financeiro do CMPort (Fase 1) — domínio completo (backend + frontend).

Use `/financeiro-backend` para tasks puramente de backend.
Use `/financeiro-frontend` para tasks puramente de frontend.
Use este command quando a task tocar as duas camadas ao mesmo tempo.

---

## Contexto do módulo

O módulo financeiro digitaliza o fluxo de caixa da empresa, substituindo a planilha manual
`FLUXO FINANCEIRO - 2026.xlsx`. Toda a documentação detalhada está em `financeiro/`.

**Tabelas novas (prefixo `fin_` — nunca alterar tabelas existentes):**
- `fin_categorias` — grupos RECEITA / FORNECEDOR / DESPESA
- `fin_movimentacoes` — cada entrada ou saída de dinheiro
- `fin_saldo_inicial` — saldo de abertura mensal (sobra do mês passado)

**Rotas de API novas:**
- `GET/POST/PUT/DELETE /api/v1/financeiro/movimentacoes`
- `POST /api/v1/financeiro/movimentacoes/{id}/validar`
- `GET /api/v1/financeiro/dashboard`
- `POST /api/v1/financeiro/sincronizar-inter`
- `GET/PUT /api/v1/financeiro/saldo-inicial/{ano}/{mes}`
- `GET/POST/PUT/DELETE /api/v1/categorias-financeiras`

**Páginas novas:**
- `/financeiro` — Dashboard com cards e breakdown
- `/financeiro/movimentacoes` — Lista com filtros e categorização inline
- `/financeiro/categorias` — Gestão de categorias por grupo

---

## Ordem de implementação (checklist)

### Semana 1 — Base backend
- [ ] `fin_categoria_model.py` + registrar no `__init__.py`
- [ ] `fin_movimentacao_model.py` + registrar no `__init__.py`
- [ ] `fin_saldo_inicial_model.py` + registrar no `__init__.py`
- [ ] Seeds das 49 categorias no startup
- [ ] Schemas Pydantic (request + response para cada model)
- [ ] Repositories (CRUD básico, filtros por período, soft delete)
- [ ] Service: CRUD movimentações + cálculo totais + saldo acumulado
- [ ] Routers: `/api/v1/financeiro` + `/api/v1/categorias-financeiras`
- [ ] Testar todos endpoints no Swagger (`/docs`)

### Semana 2 — Integração Inter (extrato)
- [ ] Verificar scope `extrato.read` nas credenciais Inter do cliente
- [ ] Adicionar `_obter_token_extrato()` e `buscar_extrato()` ao `InterClient`
- [ ] `inter_extrato_service.py` com deduplicação por `id_externo_banco`
- [ ] Endpoint `POST /financeiro/sincronizar-inter`
- [ ] Endpoint `GET /financeiro/dashboard` com saldo acumulado

### Semana 3 — Frontend base
- [ ] Refatorar `Sidebar.tsx` para estrutura de grupos (4 grupos)
- [ ] Interfaces TypeScript para todas as entidades financeiras
- [ ] Página `/financeiro` — Dashboard com `DashboardFinanceiro.tsx`
- [ ] Página `/financeiro/movimentacoes` — `TabelaMovimentacoes.tsx`
- [ ] `FormMovimentacaoManual.tsx` — modal grupo → categoria → valores
- [ ] `SaldoInicialCard.tsx` — campo editável inline

### Semana 4 — Finalização
- [ ] `FormCategorizar.tsx` — select inline na tabela
- [ ] `BotaoSincronizarInter.tsx` — feedback de importação
- [ ] Página `/financeiro/categorias`
- [ ] Saldo acumulado calculado encadeando meses
- [ ] `npx tsc --noEmit` zerado
- [ ] QA ponta a ponta com o cliente

---

## Regras críticas do módulo

1. **Nunca alterar tabelas existentes** — adição pura com prefixo `fin_`
2. **`valor` sempre positivo** — o sinal está em `tipo` (ENTRADA/SAIDA)
3. **Soft delete obrigatório** — chamar `registrar_exclusao()` antes de setar `deletado_em`
4. **Deduplicação Inter** — `id_externo_banco` UNIQUE; capturar `IntegrityError` como duplicata
5. **Saldo acumulado não gravado** — sempre calculado em runtime (soma de meses)
6. **Seeds idempotentes** — verificar `COUNT == 0` antes de inserir; nunca re-inserir
7. **Sidebar refatorado primeiro** — antes de adicionar qualquer item de menu financeiro
8. **Scope Inter separado** — `extrato.read` ≠ `boleto-cobranca.write`; tokens distintos
9. **Categorias de fornecedores são empresas reais** — usuário deve poder criar novas pelo frontend
10. **Dashboard atual `/` não muda** — o financeiro fica em `/financeiro`

---

## Fórmula de saldo (regra de negócio)

```
saldo_mes    = saldo_inicial(mes) + entradas(mes) - saidas(mes)
saldo_acum   = Σ saldo_mes(Jan..mes_atual)
```

Breakdown do dashboard (espelha a planilha do cliente):
```
Receitas     = SUM(valor WHERE grupo=RECEITA AND tipo=ENTRADA)
Fornecedores = SUM(valor WHERE grupo=FORNECEDOR AND tipo=SAIDA)
Despesas     = SUM(valor WHERE grupo=DESPESA AND tipo=SAIDA)
```

---

## Fora do escopo da Fase 1 (não implementar)

- ❌ Leitura automática de PDF/comprovantes
- ❌ Vínculo automático movimentação ↔ OS Auvo (Fase 2)
- ❌ Vínculo automático movimentação ↔ nota fiscal (Fase 2)
- ❌ Classificação automática por IA ou regex
- ❌ Relatórios de comparação entre meses (Fase 3)
- ❌ Previsão de caixa

---

## Documentação de referência

```
financeiro/ARQUITETURA-BD-FINANCEIRO.md   ← schema SQL completo + seeds
financeiro/RELATORIO-FASE1-FINANCEIRO.md  ← análise, gap, backlog, riscos
financeiro/FASES.MD                       ← escopo comercial acordado
financeiro/FLUXO FINANCEIRO - 2026.xlsx   ← planilha que o cliente usa hoje
```
