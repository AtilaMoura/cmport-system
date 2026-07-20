# Refatoracao.md — Tarefa Ativa de Implementação

> **Propósito:** Plano técnico da tarefa em andamento.
> Substituído integralmente a cada nova tarefa iniciada.
> Índice geral e histórico de conclusões em `PLANO_IMPLEMENTACAO.md`.

---

## Tarefas Anteriores — ARQUIVADAS

**P2 — Corpo de Nota (sessão 2026-06-17):** todos os itens `P2-A/B/C` implementados e confirmados em `cmport-front/app/corpos-nota/novo/page.tsx`. Checklist de testes manuais residual em `PENDENCIAS.md`.

**Feature Recibo — wizard 5 passos (sessão 2026-07-14):** testada localmente end-to-end, 3 bugs corrigidos (limit=700, mapeamento de campos em `/recibos/buscar-os`, parse de data), commitada e deployada em produção — commits `b80a303` (feature) e `134968e` (remoção de certificado exposto encontrado durante o deploy, `Cmport_123456.pfx`).

**Recibo: Detalhe, Edição e Exclusão (sessão 2026-07-14) — CONCLUÍDA, falta commitar:**
Fase A (backend): `A1` (`ReciboService.deletar` com `registrar_exclusao`), `A2` (`DELETE /recibos/{id}` aceita `motivo`), `A3` (`GET /servicos/por-recibo/{recibo_id}`) — todos implementados.
Fase B (`cmport-front/app/recibos/[id]/page.tsx` — view + edição inline + modal exclusão) e Fase C (lista `/recibos` clicável) — implementadas e testadas manualmente:
- Edição de valor/observação (REC-2026-019, R$500→R$550) persistida corretamente
- Exclusão com motivo (REC-2026-020) — `status=CANCELADO`, `deletado_em` preenchido, linha em `registros_exclusoes`, some da lista
- Card "Serviço Vinculado" funcionando (REC-2026-019 → OS 72365169) e ausente com segurança quando não há serviço (REC-2026-020)
- `npx tsc --noEmit` zerado; `status` confirmado não-editável via form

**Pendente:** commitar e decidir se entra no deploy (`git push origin master`) — próxima ação antes de iniciar a tarefa abaixo, se o usuário quiser fechar esse ciclo primeiro. **Nota (2026-07-15): já commitado em `36c2ca8`** — item fechado.

**Sincronizar Banco Local + Reconciliação de Fevereiro/2026 (sessão 2026-07-14) — CONCLUÍDA:**
Banco local sincronizado com produção (dump/restore, contagens idênticas). 114 notas fiscais (Manutenção+Assistência) + 2 recibos aplicados em local e produção — R$ 63.750,41, 100% da planilha reconciliado. Runbook reutilizável documentado em `fluxo-financeiro/PROCESSO_RECONCILIACAO_MENSAL.md`. Resíduo: recibo Eraseg (REC-2026-021, R$650,00) sem `condominio_id` — mesma pendência de identificação do D1 de Janeiro. Detalhes completos em `fluxo-financeiro/RELATORIO_NF_2026.md` (seção "Fevereiro 2026") e `PLANO_IMPLEMENTACAO.md` (item D2).

---

## Tarefa Ativa — Recibo ENTRADA deve gerar Serviço automaticamente (pré-requisito antes de retomar a reconciliação mensal)

### Objetivo e escopo

Hoje, criar um recibo `ENTRADA` (que substitui a nota fiscal para aquele lançamento) **não gera o serviço (`ManutencaoAssistencia`) de forma confiável**, o que quebra controle, envio de email e geração de Termo de Garantia para esses casos. Isso importa agora porque a reconciliação mensal (Março em diante) vai criar vários recibos `ENTRADA` — se o bug não for corrigido antes, os próximos meses repetem o mesmo buraco que o Eraseg deixou em Fevereiro.

**Fora de escopo (decidido com o usuário):**
- Recibo `SAIDA` continua com geração de serviço manual/opcional (checkbox), sem mudança — é pagamento a terceiro, não serviço prestado ao cliente.
- Não vamos estender o model `Boleto` para aceitar `recibo_id` — o envio de email/controle do recibo será resolvido com endpoint dedicado no próprio módulo Recibo, sem tocar no fluxo de nota fiscal/boleto existente.

### Diagnóstico (causas raiz confirmadas no código)

1. **`recibo_schema.py:24`** — `gerar_servico: bool = False`. Puramente opt-in, backend não distingue `tipo`.
2. **`recibos/novo/page.tsx:66`** — `useState(false)` para `gerarServico`; o checkbox "Gerar OS vinculada ao recibo" (`page.tsx:516-554`) aparece igual para ENTRADA e SAIDA, sem valor padrão diferente por tipo.
3. **`recibo_service.py:55-56`** — `elif payload.gerar_servico and condominio_id:` — só cria serviço se o checkbox foi marcado E há condomínio.
4. **`servico_model.py:18`** — `condominio_id = Column(..., nullable=False)` — trava estrutural: sem condomínio, literalmente impossível criar `ManutencaoAssistencia`. Correto que o Eraseg (sem condomínio) não gerou serviço — mas hoje **não existe fluxo para gerar retroativamente** quando o condomínio for identificado depois (`ReciboService.atualizar` em `recibo_service.py:138-166` não seta `condominio_id` nem dispara criação de serviço).
5. **`boleto_service.py`** (múltiplos pontos, ex. linha 517 `criar_boleto_manual`, linha 1531-1534 envio de email) — todo o pipeline de boleto/email é amarrado a `nota_fiscal_id`. Serviço nascido de recibo tem `nota_fiscal_id = None` sempre → hoje não há como mandar email nem registrar `email_enviado_em`/`email_destinatarios` (`servico_model.py:29-30`) para ele.
6. **`termo_garantia_service.py:67`** — já tolera `nota_fiscal` ausente (`getattr(servico, 'nota_fiscal', None)`), então gerar Termo para serviço-de-recibo já funciona, só sai sem número de NF no documento (esperado, não é bug).

### Decisão final (revista com o usuário em 2026-07-15) — Recibo usa sempre os próprios dados

Depois de duas idas e vindas, a regra de negócio ficou assim:

- **Serviço gerado a partir de Nota Fiscal:** inalterado. Continua usando `condominio_id` da nota, e o envio de email continua buscando contatos oficiais em `GET /contatos/condominio/{id}` (fluxo que já funciona e **não pode regredir**).
- **Serviço gerado a partir de Recibo (tipo ENTRADA):** usa **sempre os dados do próprio recibo/cliente** (nome, email do cliente cadastrado, etc.) como fonte da verdade — **independente de o cliente estar ou não vinculado a um condomínio** no cadastro. Não usa a lista de contatos do condomínio nesse caso (por isso o risco de autorização apontado antes não se aplica mais: o destinatário é sempre o do próprio recibo, nunca "herdado" de terceiros).
- No detalhe do serviço, se ele veio de um recibo, mostrar informativamente se aquele cliente também está vinculado a um condomínio (dado de contexto, não usado para decidir destinatário de email).

Isso exige relaxar `ManutencaoAssistencia.condominio_id` para nullable (recibo sem condomínio precisa conseguir gerar serviço), mas **sem** adicionar `cliente_id` ao model — já existe `recibo_id` (FK já implementada) que permite chegar em `servico.recibo.cliente` / `servico.recibo.cliente_nome_avulso` sempre que necessário. Mais simples do que a Fase A.1 original.

### Estratégia de execução: refatoração orientada a teste (proteger o fluxo de Nota Fiscal)

O usuário pediu explicitamente esse formato — não pular direto pra implementação:

1. **Baseline:** escrever testes que capturam o comportamento **atual** do serviço gerado a partir de Nota Fiscal (antes de qualquer mudança) — rodar e confirmar que passam contra o código de hoje.
2. **Refatoração:** implementar a mudança (recibo usa dados próprios, com ou sem condomínio).
3. **Testes novos:** cobrir o comportamento do recibo pós-refatoração (com condomínio, sem condomínio, com nome avulso).
4. **Regressão:** rodar de novo os testes do passo 1 (baseline) contra o código refatorado — têm que dar exatamente o mesmo resultado.
5. Tudo local (`pytest` + `npx tsc --noEmit`). Deploy pra produção só depois, com aprovação explícita — mesma regra do resto do projeto.

Convenção de teste já usada no projeto (`backend/tests/`, ver `test_corpo_nota_produto.py` + `conftest.py`): `pytest` com `MagicMock` para sessão do banco, `patch` nos métodos de repository, helpers tipo `make_nota_fiscal()`/`make_corpo_nota()` no `conftest.py`. Vamos seguir o mesmo padrão (unit test, sem banco real) — criar `make_recibo()` e um `make_servico()` no `conftest.py` para reaproveitar.

---

### Passo 1 — Baseline: testes do fluxo atual (Nota Fiscal → Serviço)

**Arquivo novo:** `backend/tests/test_nota_fiscal_gera_servico.py`

Cobre o trecho já existente em `nota_fiscal_service.py:1301-1318` (dentro do loop de importação de XML/ZIP):
```python
if dados_nota['condominio_id'] and dados_nota['tipo'] in [TipoNota.ASSISTENCIA, TipoNota.MANUTENCAO]:
    servico = ServicoCreate(condominio_id=..., tipo=..., data_servico=..., descricao=..., nota_fiscal_id=db_nota.id, numero_os=...)
    ServicoService.create_servico(db, servico)
```

Casos a cobrir (todos contra o comportamento **atual**, sem nenhuma mudança de código ainda):
- Nota tipo ASSISTENCIA com `condominio_id` preenchido → `ServicoCreate` chamado com `condominio_id` correto, `nota_fiscal_id` setado, `tipo="assistencia"`
- Nota tipo MANUTENCAO → mesmo padrão, `tipo="manutencao"`
- Nota tipo PRODUTO (ou outro fora de ASSISTENCIA/MANUTENCAO) → **nenhum** serviço criado
- Nota sem `condominio_id` → **nenhum** serviço criado, mesmo sendo ASSISTENCIA/MANUTENCAO (é o `if dados_nota['condominio_id'] and ...` que guarda isso hoje)
- `numero_os` do XML repassado corretamente para o serviço quando presente

**Ação:** rodar `pytest backend/tests/test_nota_fiscal_gera_servico.py -v` e confirmar que todos passam contra o código atual — esse resultado é o baseline salvo (arquivo de teste commitado, mas ainda sem nenhuma mudança em `recibo_service.py`/`servico_model.py`).

---

### Passo 2 — Refatoração

**2.1 Migration — `backend/app/models/servico_model.py`**
- `condominio_id` de `nullable=False` para `nullable=True` (aditiva, não quebra nada — nota fiscal sempre preenche esse campo, então nenhum dado existente fica inconsistente).
- Nenhuma coluna nova necessária (reaproveita `recibo_id` já existente).

**2.2 `backend/app/schemas/servico_schema.py:22,37`**
- `ServicoCreate.condominio_id: Optional[int] = None` (era `int` obrigatório)
- `ServicoResponse.condominio_id: Optional[int] = None`
- **Atenção:** confirmar que não existe endpoint de criação manual de serviço no frontend que dependia dessa obrigatoriedade — `nota_fiscal_service.py` continua passando `condominio_id` sempre (guard já existe na linha 1301), então esse caminho não muda de comportamento.

**2.3 `backend/app/services/recibo_service.py` — refatoração principal**
- `ReciboService.criar`: substituir a condição atual (`elif payload.gerar_servico and condominio_id`) pela nova regra:
  ```
  SE tipo == ENTRADA E (cliente_id OU cliente_nome_avulso resolvido):
      SE numero_os informado E há condominio_id → reaproveita/cria servico vinculado à OS (fluxo já existe, só roda quando há condomínio pra identificar a OS)
      SENAO → cria servico novo, usando os dados do recibo (condominio_id se houver — informativo — senão None)
  SE tipo == SAIDA:
      mantém comportamento atual (gerar_servico opcional via checkbox)
  ```
- `_criar_servico`: `condominio_id` passa a ser parâmetro opcional (`Optional[int] = None`); `ManutencaoAssistencia(condominio_id=condominio_id, ...)` aceita `None` normalmente após a Fase 2.1/2.2.
- `_vincular_ou_criar_servico_por_os`: só é chamada quando há `condominio_id` (a busca de OS existente é por `(condominio_id, numero_os)` — sem condomínio não tem como reaproveitar OS, então nesse caso pula direto pra criar serviço novo).

**2.4 `backend/app/services/termo_garantia_service.py:54-83` (`_build_context`)**
- Fallback quando `servico.condominio_id` for `None`: usar dados do recibo vinculado —
  ```python
  condominio = servico.condominio  # pode ser None agora
  if condominio:
      cliente_nome, cliente_endereco = condominio.nome, endereco_str
  elif servico.recibo:
      cliente_nome = servico.recibo.cliente.nome if servico.recibo.cliente_id else servico.recibo.cliente_nome_avulso
      cliente_endereco = ""  # Cliente não tem endereço estruturado
  ```

**2.5 Frontend — `cmport-front/app/servicos/[id]/page.tsx`**
- Quando `servico.recibo_id` estiver presente: mostrar um card "Origem: Recibo" com nome do cliente do recibo (e email, se cadastrado) e uma linha informativa "Cliente também vinculado ao condomínio X" (se `recibo.cliente.condominio_id` existir) ou "Cliente sem condomínio vinculado" — só informativo, não altera nenhum fluxo de envio.
- Garantir que os pontos que hoje leem `condominio.nome` sem guard (linha ~1682) não quebrem quando `servico.condominio_id` for `None` — usar os dados do recibo/cliente nesse caso.
- `npx tsc --noEmit` zerado.

---

### Passo 3 — Testes das alterações (novo comportamento do Recibo)

**Arquivo novo:** `backend/tests/test_recibo_gera_servico.py`

Casos a cobrir:
- Recibo ENTRADA com `cliente_id` vinculado a um condomínio existente → serviço criado com `condominio_id` preenchido (vindo do cliente) e dados de nome vindos do recibo/cliente
- Recibo ENTRADA com `cliente_id` de cliente **externo, sem condomínio** → serviço criado com `condominio_id=None`, sem erro
- Recibo ENTRADA com `cliente_nome_avulso` (sem cadastro de cliente) → serviço criado normalmente, descrição usa o nome avulso
- Recibo ENTRADA com `numero_os` e condomínio → reaproveita OS existente (sem duplicar), mesmo padrão de hoje
- Recibo SAIDA → nenhuma mudança, continua exigindo `gerar_servico=True` explícito
- Termo de Garantia gerado para serviço sem condomínio (`_build_context`) não lança exceção, usa nome do cliente

---

### Passo 4 — Regressão: reconfirmar o baseline

- Rodar de novo `pytest backend/tests/test_nota_fiscal_gera_servico.py -v` **depois** da refatoração — todos os casos do Passo 1 têm que passar exatamente igual (mesmo resultado, nenhuma alteração de comportamento no fluxo de Nota Fiscal).
- Rodar a suíte inteira (`pytest backend/tests/ -v`) para garantir que nada mais quebrou (ex: `test_corpo_nota_produto.py`, que também toca `ManutencaoAssistencia` indiretamente).

### Passo 5 — Local primeiro, produção depois

- Tudo isso roda e é validado local (banco local, backend local, `npx tsc --noEmit`).
- Só decidir sobre deploy pra produção (`git push origin master`) depois de validação local completa e aprovação explícita do usuário — mesma regra do resto do projeto.

### Passo 6 — Backend: envio de email do recibo (usa dados do próprio recibo)

**Arquivo novo/edição:** `backend/app/routers/recibo_router.py` + `backend/app/services/recibo_service.py`

- `POST /recibos/{id}/enviar-email` — destinatário resolvido a partir do **próprio recibo** (`recibo.cliente.email` se `cliente_id` cadastrado; senão, o operador informa o email manualmente no momento do envio — `cliente_nome_avulso` não tem email cadastrado). **Nunca** busca contatos de condomínio aqui, mesmo que o cliente esteja vinculado a um — essa é a diferença chave em relação ao fluxo de boleto/nota fiscal.
- Reaproveita a infra de envio de email já usada em boletos (mesmo serviço de SMTP/anexo PDF, ver `boleto_service.py` como referência de implementação), mas anexa o PDF/dados do recibo em vez do boleto.
- Ao enviar com sucesso, se o recibo tiver serviço(s) vinculado(s) (`recibo.servicos`), estampar `email_enviado_em`/`email_destinatarios` no(s) `ManutencaoAssistencia` correspondente(s) — mesmo padrão que já existe para boleto (`boleto_service.py:1531-1534`).
- Reaproveitar `ConfiguracaoEmail` já usado no restante do sistema — nenhuma configuração nova.

### Passo 7 — Backend: gerar serviço retroativamente ao identificar o condomínio depois

**Arquivo:** `backend/app/services/recibo_service.py` (`ReciboService.atualizar`)

- Adicionar `condominio_id` como campo editável no `ReciboUpdate` (hoje ausente do schema — só existe em `ReciboCreate`).
- Como agora o serviço já é criado mesmo sem condomínio (Passo 2.3), este passo passa a ser sobre **retrofit dos casos antigos** (recibos criados antes da correção, sem serviço nenhum): quando `payload.condominio_id` for informado e o recibo (a) for `tipo == ENTRADA`, (b) ainda não tem nenhum serviço vinculado (`recibo.servicos` vazio) → disparar a criação do serviço no momento do update, usando os dados do recibo (mesma lógica do Passo 2.3).

### Passo 8 — Frontend

- `cmport-front/app/recibos/novo/page.tsx`: para `tipoRecibo === 'ENTRADA'`, remover o checkbox opcional e mostrar como informação fixa: "Um serviço de Assistência/Manutenção será criado automaticamente" (mantendo a escolha do `tipoServico` ASSISTENCIA/MANUTENCAO). Para `SAIDA`, manter o checkbox exatamente como está hoje.
- `cmport-front/app/recibos/[id]/page.tsx`: no card "Serviço Vinculado", adicionar botões "Enviar por Email" (Passo 6) e "Gerar Termo de Garantia" (reaproveitando o fluxo já existente em `/servicos/[id]`).
- `npx tsc --noEmit` zerado.

### Passo 9 — Dados: aplicar retroativamente aos casos já existentes

- Recibo Eraseg (REC-2026-021, Fevereiro) — hoje ainda sem condomínio identificado. Depois da refatoração, mesmo sem condomínio, ele já poderia ter gerado serviço automaticamente — conferir se vale rodar isso retroativamente pra ele (via update do Passo 7, mesmo sem condomínio identificado) ou aguardar a identificação.
- Conferir se há outros recibos `ENTRADA` históricos sem serviço vinculado (criados antes da correção) — aplicar o mesmo endpoint de update pra disparar a criação retroativa.

### Checklist final

- [x] Passo 1: `test_nota_fiscal_gera_servico.py` criado e passando contra o código **atual** (5/5, baseline salvo em 2026-07-15). Suíte completa rodada — 3 falhas pré-existentes encontradas em `test_corpo_nota_produto.py`, sem relação com esta tarefa, registradas em `PENDENCIAS.md`
- [x] Passo 2.1: migration `condominio_id` nullable adicionada em `_run_migrations()` (`app/main.py`) — `ALTER TABLE manutencoes_assistencias MODIFY condominio_id INT NULL`, aplica no próximo restart do backend local/produção
- [x] Passo 2.2: `servico_schema.py` atualizado (`ServicoCreate`/`ServicoResponse.condominio_id: Optional[int]`, `ServicoResponse.recibo_id` adicionado)
- [x] Passo 2.3: `recibo_service.py` refatorado — ENTRADA sempre gera serviço com dados do recibo, com ou sem condomínio; SAIDA inalterado
- [x] Passo 2.4: `termo_garantia_service.py` com fallback pro cliente do recibo quando não há condomínio
- [x] Passo 2.5: `/servicos/[id]/page.tsx` — corrigido bug real (`api.get('/condominios/${s.condominio_id}')` sem guard, quebraria com `condominio_id=null`); card "Origem: Recibo" adicionado mostrando cliente + vínculo informativo com condomínio
- [x] Passo 3: `test_recibo_gera_servico.py` criado (7 testes) — com/sem condomínio, nome avulso, reaproveita OS, SAIDA inalterado (com e sem checkbox), termo de garantia sem condomínio. Todos passando
- [x] Passo 4: `test_nota_fiscal_gera_servico.py` (baseline) rodado de novo pós-refatoração — 5/5 idêntico ao Passo 1
- [x] Passo 4: suíte completa `pytest backend/tests/` — 17 testes, mesmas 3 falhas pré-existentes (não relacionadas, registradas em `PENDENCIAS.md`), nenhuma regressão nova
- [x] `npx tsc --noEmit` zerado (exit code 0)
- [x] Passo 5: migration confirmada aplicada no banco local (`manutencoes_assistencias.condominio_id` nullable); `app.main` importa e sobe sem erro contra o banco sincronizado
- [x] Passo 6: `POST /recibos/{id}/enviar-email` implementado — PDF gerado via `ReciboService.gerar_pdf` (Jinja+WeasyPrint, mesmo padrão do Termo de Garantia, template novo `recibo_template.html`), enviado via `EmailService.enviar_recibo` (refactor: `_enviar_com_anexos` extraído de `enviar_boleto` para reuso). Destinatário sempre do `recibo.cliente.email` (ou override explícito) — nunca contatos de condomínio. Estampa `email_enviado_em`/`email_destinatarios` nos serviços vinculados. `GET /recibos/{id}/pdf` adicionado para preview/download direto. 5 testes novos em `test_recibo_enviar_email.py`, todos passando
- [x] Passo 7: `ReciboUpdate.condominio_id` adicionado; `ReciboService.atualizar` dispara `_criar_servico` retroativamente quando um recibo ENTRADA sem nenhum serviço vinculado ganha `condominio_id` novo — não duplica se já existir serviço. 3 testes novos em `test_recibo_gera_servico.py`, todos passando
- [x] Passo 8: `/recibos/novo` — checkbox removido para ENTRADA (texto fixo informativo + seletor de tipo), mantido inalterado para SAIDA. `/recibos/[id]` — botões "📧 Enviar por Email" (modal com destinatário pré-preenchido do cliente) e "🛡️ Gerar Termo de Garantia" (navega para `/servicos/[id]?abrirTermo=1`, que auto-abre o wizard existente via novo efeito). `npx tsc --noEmit` zerado
- [x] `pytest backend/tests/` completo pós Passos 5-8 — 35 testes, 32 passando, mesmas 3 falhas pré-existentes de `test_corpo_nota_produto.py` (não relacionadas), nenhuma regressão nova
- [ ] Passo 9: retrofit de dados do recibo Eraseg (REC-2026-021) e outros recibos ENTRADA históricos sem serviço — mecanismo já pronto (Passo 7), só falta identificar o condomínio (mesma pendência D1) e disparar um `PATCH /recibos/{id}` com `condominio_id`
- [ ] Verificação manual de PDF/email fim-a-fim: template Jinja renderizado e validado localmente (525KB HTML, sem erro), mas o `weasyprint` não consegue rodar neste Windows local por falta de libs nativas (GTK/Pango/Cairo) — mesma limitação preexistente do Termo de Garantia, não é regressão desta tarefa. Precisa ser validado via Docker (ambiente de produção) antes do deploy
- [ ] Deploy para produção — aguardando aprovação explícita do usuário (regra do projeto)

---

## Próxima Tarefa (após esta) — Reconciliação Mensal Completa do Fluxo Financeiro 2026 (Março em diante)

### Objetivo

Fechar, mês a mês, a reconciliação entre a planilha mestre `FLUXO FINANCEIRO - 2026.xlsx` e o banco de dados, até chegar no mês corrente (Julho/2026), repetindo para cada mês o processo já validado em Janeiro e Fevereiro. **Não reinventar o fluxo** — seguir à risca o runbook `fluxo-financeiro/PROCESSO_RECONCILIACAO_MENSAL.md` (8 passos, criado em 2026-07-14 a partir da execução real de Jan/Fev).

Cada mês segue sempre: **local primeiro → validar → produção → validar** — nunca aplicar direto em produção sem ter validado localmente antes.

### Situação atual por mês (levantada em `fluxo-financeiro/RELATORIO_NF_2026.md`)

| Mês | Status | Observação |
|---|---|---|
| Janeiro | ✅ Concluído | 109 registros, R$70.400,79. Resta D1 (7 recibos sem condomínio) |
| Fevereiro | ✅ Concluído | 114 notas + 2 recibos, R$63.750,41. Resta Eraseg sem condomínio |
| **Março** | ❓ **Nunca verificado** | Nenhuma seção no `RELATORIO_NF_2026.md`. Linhas já mapeadas na planilha (675–961, ver runbook Passo 2) mas nunca comparadas com o banco. **Próximo mês a fazer.** |
| Abril | ✅ Já batia 100% (verificado 26/05) | Sistema já gerava as notas normalmente nesse mês — 0 faltando. Revalidar depois do sync do Passo 1, mas não deve precisar de backfill |
| Maio | ✅ Já batia 100% (verificado 26/05) | Mesmo caso de Abril — revalidar, não deve precisar de backfill |
| Junho | ❓ Não verificado | A planilha mestre mais completa hoje (`_arquivo/docs/financeiro/FLUXO FINANCEIRO - 2026.xlsx`) só cobre Jan–Maio (1515 linhas) — **precisa confirmar com o usuário se existe versão mais nova antes de reconciliar Junho** |
| Julho (corrente) | ❓ Não verificado | Mês em andamento — mesma ressalva de fonte de planilha que Junho |

### Sequência de execução (ordem confirmada com o usuário — mês a mês, sem pular)

1. **Sincronizar banco local com produção** (Passo 1 do runbook) — sempre no início de cada retomada, pois o local pode ter ficado desatualizado
2. **Março/2026** — extrair seção (linhas 675–961 já mapeadas), mapear condomínios, separar NF de Recibo, gerar SQL, conferir subtotal, aplicar local → validar → produção → validar, atualizar documentação (Passos 2–8 do runbook)
3. **Abril/2026** — revalidar contagem pós-sync (já indicava 0 faltando); só agir se aparecer divergência nova
4. **Maio/2026** — mesma revalidação de Abril
5. **Confirmar com o usuário a fonte de planilha para Junho em diante** (arquivo mestre atual só vai até Maio) antes de prosseguir
6. **Junho/2026** — mesmo processo completo do runbook
7. **Julho/2026** (mês corrente, parcial) — mesmo processo, com atenção a lançamentos ainda em aberto/não pagos do mês em andamento
8. Ao final de cada mês: atualizar `RELATORIO_NF_2026.md` (nova seção + Resumo Executivo), `PLANO_IMPLEMENTACAO.md` (novo item tipo D3/D4...) e `PENDENCIAS.md` (qualquer condomínio não identificado)

### Pendências transversais (não bloqueiam a sequência, mas ficam registradas)

- **D1** — 7 recibos de Janeiro sem condomínio identificado (R$ 2.530,00)
- **Eraseg (Fevereiro)** — recibo sem condomínio identificado (R$ 650,00)
- Essas duas podem ser resolvidas a qualquer momento (não dependem de Março/Abril/Maio/Junho/Julho) — perguntar ao usuário condomínio por condomínio quando ele tiver a informação

### Checklist da tarefa

- [ ] Março: reconciliado local + produção, seção no relatório criada
- [ ] Abril: revalidado pós-sync (sem necessidade de novo SQL, esperado)
- [ ] Maio: revalidado pós-sync (sem necessidade de novo SQL, esperado)
- [ ] Fonte de planilha para Junho+ confirmada com o usuário
- [ ] Junho: reconciliado local + produção, seção no relatório criada
- [ ] Julho (parcial): reconciliado local + produção, seção no relatório criada
- [ ] `PLANO_IMPLEMENTACAO.md` e `PENDENCIAS.md` atualizados a cada mês concluído

---

## Referência — Sincronizar Banco Local com Produção + Reconciliação de Fevereiro/2026 (ARQUIVADO — já executado)

### Objetivo

1. Tornar o banco local (`docker-compose.yml` → container `cmport_db`, schema `cmport_gerenciamento`) uma **cópia idêntica** do banco de produção (VPS `168.231.96.184`, container `cmport_db`).
2. Isolar todos os lançamentos de **Fevereiro/2026** da planilha mestre de fluxo financeiro.
3. Comparar Fevereiro (planilha) × Fevereiro (banco, já sincronizado) e produzir o mesmo tipo de reconciliação já feita para Janeiro/Abril/Maio em `fluxo-financeiro/RELATORIO_NF_2026.md`: o banco deve **bater 100%** com a planilha (nenhuma NF faltando).

Este plano segue o padrão já validado no projeto para D1 (Janeiro): `gerar_sql_janeiro.py` → `insercao_janeiro_2026.sql` → `pendentes_janeiro.txt` → seção no `RELATORIO_NF_2026.md`. Vamos replicar o mesmo fluxo para Fevereiro, mas **antes** garantindo que o banco local usado na comparação é fiel à produção (hoje pode não ser — nunca foi confirmado nesta sessão).

### Levantamento já feito nesta sessão

**Planilha mestre — localizada a seção Fevereiro.** A aba "Entradas e SAIDAS - 2026" tem 5 seções por mês, nesta ordem: `MANUTENÇÕES` (contratos), `ASSISTÊNCIAS`, `ENTRADA/BANCOS`, `DESPESAS ESCRITÓRIO`, `FORNECEDORES`. Para Fevereiro (no arquivo mais completo, ver decisão abaixo):

| Seção | Linha do título |
|---|---|
| MANUTENÇÕES MÊS FEVEREIRO | 348 |
| ASSISTÊNCIAS MÊS FEVEREIRO | 397 |
| ENTRADA/BANCOS MÊS FEVEREIRO | 472 |
| DESPESAS ESCRITÓRIO MÊS FEVEREIRO | 500 |
| FORNECEDORES MÊS FEVEREIRO | 636 |
| *(próxima seção: MANUTENÇÕES MÊS MARÇO)* | 675 |

Ou seja, o bloco de Fevereiro vai da linha 348 até a 674. **Importante:** ao contrário do que foi feito em Janeiro (só a seção MANUTENÇÕES + ASSISTÊNCIAS foi importada como NF), aqui aparecem também ENTRADA/BANCOS, DESPESAS ESCRITÓRIO e FORNECEDORES — precisa decidir com o usuário se essas seções também entram na reconciliação com `notas_fiscais`, ou se ficam de fora (provavelmente são fluxo de caixa geral, não notas fiscais — a confirmar).

**Dificuldade técnica confirmada:** a aba tem dimensão inflada (~16.353 colunas), o que trava a leitura ingênua via `openpyxl` (`ws.max_row`/`ws.max_column` ficam presos calculando — 3 processos de teste travaram >10 min sem retornar nesta sessão). A leitura funciona normalmente quando se limita explicitamente o range (`min_row`/`max_row`/`min_col`/`max_col` fixos), o que foi usado para o levantamento acima.

### ⚠️ Decisões que preciso que você confirme antes de eu rodar qualquer comando de execução

**Decisão 1 — Qual planilha é a fonte de verdade para Fevereiro?**
Encontrei **duas versões** do arquivo mestre `FLUXO FINANCEIRO - 2026.xlsx`, com conteúdo bem diferente:

| Arquivo | Local | Última modificação | Linhas na aba "Entradas e SAIDAS - 2026" |
|---|---|---|---|
| A | `C:\Users\amand\OneDrive\Documentos\CMport\FLUXO FINANCEIRO - 2026 .xlsx` (nome com espaço antes do `.xlsx`, fora do repositório) | 26/01/2026 | 215 (só cobre Janeiro) |
| B | `cmport-system\_arquivo\docs\financeiro\FLUXO FINANCEIRO - 2026.xlsx` | 24/05/2026 | 1515 (cobre Jan–Maio, inclui a seção Fevereiro mapeada acima) |

O arquivo **A** está fora do repositório e tem um **lock file** (`.~lock.FLUXO FINANCEIRO - 2026 .xlsx#`), indicando que pode estar aberto no Excel/LibreOffice agora. O arquivo **B** é o único que tem Fevereiro, mas está dentro de `_arquivo/` (pasta que normalmente indica "arquivado, não usar mais").
**Preciso que você confirme:** o arquivo B é mesmo a planilha atualizada que você quer usar como fonte de Fevereiro? Se você tem uma versão mais nova ainda (talvez salva em outro lugar do OneDrive), me passe o caminho.

**Decisão 2 — Escopo da reconciliação: só Manutenções+Assistências, ou também Entrada/Bancos, Despesas e Fornecedores?**
Em Janeiro só as seções "Contratos de Manutenção" e "Assistências" viraram `notas_fiscais` no banco (são as únicas com número de NF). As seções ENTRADA/BANCOS, DESPESAS ESCRITÓRIO e FORNECEDORES parecem ser fluxo de caixa/despesas administrativas, sem NF associada — não teriam equivalente direto em `notas_fiscais`. Confirma que a reconciliação de Fevereiro é **só das seções MANUTENÇÕES + ASSISTÊNCIAS** (mesmo escopo de Janeiro), ou você quer que eu inclua as outras seções também (nesse caso preciso entender contra qual tabela comparar — não seria `notas_fiscais`)?

**Decisão 3 — Confirmar sobrescrita do banco local**
O restore da Fase 1 vai **substituir completamente** o schema `cmport_gerenciamento` local pelos dados de produção. Qualquer dado de teste que só existe localmente será perdido — vou tirar um backup do estado local atual antes (Fase 1.1), mas ele não será restaurado automaticamente depois. Confirma que pode seguir?

**Decisão 4 — Alvo final do SQL de Fevereiro**
Depois de gerar `insercao_fevereiro_2026.sql`, ele deve ser aplicado **só no local** (para eu te mostrar o resultado antes) ou você quer que eu já aplique em produção assim que validado localmente? (Fase 4 abaixo assume: local primeiro, produção só com sua aprovação explícita depois de ver o relatório.)

---

### Fase 1 — Sincronizar Banco Local ← Produção

**1.1. Backup de segurança do banco local atual (antes de sobrescrever)**
```bash
docker exec cmport_db mysqldump -u cmport -pcmport123 cmport_gerenciamento > fluxo-financeiro/backup_local_pre_sync_$(date +%Y%m%d_%H%M).sql
```

**1.2. Dump do banco de produção via SSH**
```bash
ssh -i ~/.ssh/id_ed25519 root@168.231.96.184 \
  "docker exec cmport_db sh -c 'exec mysqldump -u root -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction --routines --triggers cmport_gerenciamento'" \
  > fluxo-financeiro/dump_producao_$(date +%Y%m%d).sql
```
(senha lida de dentro do próprio container via variável de ambiente já configurada — nunca digitada em texto claro no comando.)

**1.3. Restaurar no banco local**
```bash
docker exec -i cmport_db mysql -u root -pcmport2026 cmport_gerenciamento < fluxo-financeiro/dump_producao_YYYYMMDD.sql
```
Parar o backend local (`uvicorn`) antes de restaurar para evitar conexões concorrentes durante o `DROP`/`CREATE` das tabelas.

**1.4. Validar sincronização**
Comparar contagem de linhas nas tabelas-chave entre local (pós-restore) e produção (via SSH): `condominios`, `notas_fiscais`, `manutencoes_assistencias`, `boletos`, `recibos`. Todas devem bater exatamente.

**Checklist Fase 1**
- [ ] Backup local salvo em `fluxo-financeiro/backup_local_pre_sync_*.sql`
- [ ] Dump de produção obtido sem erros
- [ ] Restore local concluído sem erros
- [ ] Contagem de linhas idêntica local × produção nas 5 tabelas-chave
- [ ] Backend local reiniciado e funcionando contra o banco sincronizado

---

### Fase 2 — Isolar Fevereiro/2026 da Planilha Mestre

**2.1. Copiar a planilha fonte (decidida na Decisão 1) para a pasta de trabalho, sem editar o original**
```bash
cp "<planilha fonte confirmada>" "fluxo-financeiro/FLUXO_FINANCEIRO_2026_snapshot_$(date +%Y%m%d).xlsx"
```
Trabalhar sempre sobre essa cópia — nunca abrir/escrever no arquivo original do usuário.

**2.2. Extrair linhas 348–674 (seção Fevereiro completa) usando range fixo no `openpyxl`**
Nunca chamar `ws.max_row`/`ws.max_column` nessa aba (trava). Ler só com `ws.iter_rows(min_row=348, max_row=674, min_col=1, max_col=13, values_only=True)`.

**2.3. Gerar `fluxo-financeiro/Entradas Fluxo Fevereiro.xlsx`**
Mesmo formato do arquivo `Entradas Fluxo Janeiro.xlsx` (cabeçalho na linha 2, dados a partir da linha 4), só com as linhas de Fevereiro — escopo conforme Decisão 2 (Manutenções + Assistências, ou tudo).

**Checklist Fase 2**
- [ ] Planilha fonte confirmada com o usuário (Decisão 1)
- [ ] Escopo de seções confirmado (Decisão 2)
- [ ] Snapshot local criado, original não tocado
- [ ] `Entradas Fluxo Fevereiro.xlsx` gerado e revisado visualmente (contagem de linhas bate com a seção original)

---

### Fase 3 — Comparar Fevereiro: Planilha × Banco (agora sincronizado)

**3.1. Adaptar o script de geração de SQL**
Criar `fluxo-financeiro/gerar_sql_fevereiro.py` a partir de `gerar_sql_janeiro.py`:
- Trocar a planilha fonte para `'Entradas Fluxo Fevereiro.xlsx'`
- Reaproveitar o dicionário `COND_IDS` (já validado em Janeiro) — **verificar se aparecem condomínios novos em Fevereiro** que não estavam no mapeamento e completá-lo
- Ajustar `SKIP` (linhas de cabeçalho/subtítulo) conforme a estrutura real da seção Fevereiro extraída
- Saída: `insercao_fevereiro_2026.sql` + `pendentes_fevereiro.txt`

**3.2. Relatório comparativo completo**
Reaproveitar a lógica que gerou `RELATORIO_NF_2026.md` (Janeiro/Abril/Maio) para produzir a mesma comparação de Fevereiro:
- NFs na planilha vs NFs no banco (filtrando `notas_fiscais` por `data_vencimento` em Fevereiro/2026)
- 3 grupos: presentes em ambos / faltando no banco / só no banco (não na planilha — informativo, mesmo padrão já usado)

**3.3. Acrescentar seção "## Fevereiro 2026" em `fluxo-financeiro/RELATORIO_NF_2026.md`**
Mesmo formato das seções existentes (tabela de métricas + tabelas detalhadas), e atualizar a tabela "Resumo Executivo" no final do arquivo.

**Checklist Fase 3**
- [ ] `gerar_sql_fevereiro.py` criado e rodado sem erros
- [ ] `insercao_fevereiro_2026.sql` gerado
- [ ] `pendentes_fevereiro.txt` gerado (se houver condomínios não mapeados)
- [ ] Seção "Fevereiro 2026" adicionada ao `RELATORIO_NF_2026.md` com números conferidos

---

### Fase 4 — Aplicar Correções (após aprovação)

**4.1.** Revisar manualmente `insercao_fevereiro_2026.sql` linha a linha (igual foi feito para Janeiro) antes de rodar contra qualquer banco.

**4.2.** Rodar primeiro no **banco local** (já sincronizado com produção na Fase 1) — validar que os totais batem com a planilha depois da inserção.

**4.3.** Só após validação local e sua aprovação explícita (Decisão 4): aplicar o mesmo SQL em produção (com backup de produção antes, mesmo padrão da Fase 1.1 mas do lado do servidor).

**4.4.** Documentar pendências (condomínios não identificados em `pendentes_fevereiro.txt`) seguindo o mesmo modelo do item **D1** em `PLANO_IMPLEMENTACAO.md` — perguntar ao usuário condomínio por condomínio.

**Checklist Fase 4**
- [ ] SQL revisado manualmente
- [ ] Aplicado e validado no banco local
- [ ] Aprovação explícita do usuário para produção
- [ ] Aplicado em produção com backup prévio
- [ ] Pendências de Fevereiro documentadas (novo item tipo D1, ou anexado ao D1 existente)

---

### Mapa de Arquivos

| Arquivo | Fase | O que muda |
|---------|------|-----------|
| `fluxo-financeiro/backup_local_pre_sync_*.sql` | 1.1 | **novo** — backup do banco local antes do restore |
| `fluxo-financeiro/dump_producao_*.sql` | 1.2 | **novo** — dump da produção |
| `fluxo-financeiro/FLUXO_FINANCEIRO_2026_snapshot_*.xlsx` | 2.1 | **novo** — cópia de trabalho da planilha mestre |
| `fluxo-financeiro/Entradas Fluxo Fevereiro.xlsx` | 2.3 | **novo** — seção Fevereiro isolada |
| `fluxo-financeiro/gerar_sql_fevereiro.py` | 3.1 | **novo** — adaptado de `gerar_sql_janeiro.py` |
| `fluxo-financeiro/insercao_fevereiro_2026.sql` | 3.1 | **novo** — SQL gerado |
| `fluxo-financeiro/pendentes_fevereiro.txt` | 3.1 | **novo** — condomínios não mapeados |
| `fluxo-financeiro/RELATORIO_NF_2026.md` | 3.3 | seção "Fevereiro 2026" + resumo executivo atualizado |
| `PLANO_IMPLEMENTACAO.md` | 4.4 | pendências de Fevereiro registradas (padrão D1) |

### Testes / Validação Final

- [ ] Contagem de tabelas-chave local == produção (Fase 1)
- [ ] Nenhuma NF de Fevereiro na planilha ausente no banco após Fase 4 (0 faltando, igual Abril/Maio hoje)
- [ ] Total em R$ de Fevereiro no banco == total em R$ de Fevereiro na planilha (após aplicar SQL)
- [ ] Nenhum dado de outros meses foi alterado (comparação antes-depois nas tabelas fora do filtro Fevereiro)
