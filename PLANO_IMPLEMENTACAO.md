# Plano de Implementação — CMPort

**Última atualização:** 2026-05-01
**Status atual:** Fases 0-9 concluídas. **Sub-fases 10A, 10B, 10C, 10D e 10F concluídas. Correções pós-10F aplicadas. Sub-fase 10G (HTML+WeasyPrint+Preview) planejada.**

Convenções: `[x]` concluído · `[~]` em andamento · `[ ]` a fazer.

---

## Histórico de Fases

### Fases 0–8 — Refatoração de Boletos & Impostos `[x]`

Refactor completo do sistema de boletos:
- Tabela `configuracao_impostos_servico` centralizada por tipo de serviço
- Validação de impostos do XML contra config (alerta não-bloqueante)
- Modal de pré-visualização em 2 etapas (configuração → emissão)
- Geração em massa em `/servicos`
- Tela de detalhe completa em `/servicos/[id]`
- Suporte a notas canceladas
- Integração Banco Inter para PDF e ciclo de vida do boleto

### Fase 9 — Integração com Ordens de Serviço Auvo `[x]`

Sincronização e exibição de Ordens de Serviço da plataforma Auvo:

- `[x]` Modelo `OrdemServico` (`backend/app/models/ordem_servico_model.py`)
- `[x]` FK `ordem_servico_id` em `ManutencaoAssistencia`
- `[x]` Auto-vínculo em duas direções: ao sincronizar OSs e ao criar/atualizar serviços
- `[x]` Parser robusto em `nota_fiscal_service.extrair_numero_os()` (singular/plural/dotted)
- `[x]` Endpoint `GET /api/v1/ordens-servico/{task_id}/pdf`
- `[x]` Auto-anexo do PDF da OS no email de boleto
- `[x]` Frontend: `/ordens-servico` (lista), `/ordens-servico/[id]` (detalhe), painel completo de OS dentro de `/servicos/[id]`, link "Ver serviço →" corrigido

---

## Fase 10 — Sync Auvo Expandido + Termo de Garantia 🚧

### Visão Geral e Motivação

O cliente quer:
1. **Remover XML do email** (sem relevância para o destinatário).
2. **Anexar Termo de Garantia em PDF** quando gerado (3, 6 ou 12 meses).
3. **Salvar orçamentos do Auvo no banco** — serão usados também para geração de nota fiscal no futuro.
4. **Salvar produtos do Auvo no banco** — base para resolver nomes em orçamentos e para o termo de garantia.

A implementação é dividida em sub-fases sequenciais. **Cada sub-fase entrega valor independente** e pode ir para produção isolada.

### Decisões Técnicas Fixadas

| Decisão | Escolha |
|---|---|
| Lib de PDF | **reportlab** (~5MB, sem deps binárias) |
| Persistência do termo | Salva parâmetros; PDF gerado on-the-fly |
| Sync de produtos | Tabela local + endpoint manual + agendamento futuro |
| Sync de orçamentos | Tabela local com itens normalizados; usado para termo e (futuro) gerar nota |
| Empresa no PDF | `ConfiguracaoEmpresa.nome` |
| Responsável no PDF | "André Moreira Rosa — Diretor Comercial" hardcoded |
| Cidade no PDF | "São Paulo" hardcoded |
| Idempotência do termo | UNIQUE em `servico_id`; regerar substitui |

---

## Sub-fase 10A — Sync de Produtos Auvo `[x]`

### Por que primeiro
Tanto o orçamento quanto o termo de garantia precisam exibir nomes de produtos. Salvar localmente evita lookup live e permite exibir mesmo offline.

### Backend

**10A.1** `[x]` Migration SQL
```sql
CREATE TABLE produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    auvo_id INT NOT NULL UNIQUE,                  -- "code"/"id" no Auvo
    auvo_uuid VARCHAR(50) NULL,                   -- "productId" GUID
    external_id VARCHAR(100) NULL,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT NULL,
    categoria_id INT NULL,
    valor_unitario DECIMAL(10,2) NULL,
    custo_unitario DECIMAL(10,2) NULL,
    estoque_minimo DECIMAL(10,2) NULL,
    estoque_total DECIMAL(10,2) NULL,
    imagem_url VARCHAR(500) NULL,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    sincronizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_produto_auvo (auvo_id),
    INDEX idx_produto_nome (nome)
);
```

**10A.2** `[x]` `backend/app/models/produto_model.py` — modelo `Produto`. Registrar em `main.py`.

**10A.3** `[x]` `backend/app/services/auvo_client.py` — adicionar:
- `listar_produtos(page=1, page_size=100, ativo=True)` — paginação `GET /products/`
- `get_all_products()` — itera todas as páginas (similar a `get_all_service_orders_by_period`)
- `get_product(product_id)` — `GET /products/{id}`

**10A.4** `[x]` `backend/app/repositories/produto_repository.py` — `upsert_by_auvo_id`, `list`, `get_by_auvo_id`, `search_by_nome`.

**10A.5** `[x]` `backend/app/services/produto_service.py`:
- `sincronizar(db) -> dict` — busca todos os produtos do Auvo, faz upsert local
- `listar(db, search=None, ativo=None, page, page_size)` — listagem paginada
- `get_by_auvo_id(db, auvo_id)` — usado por orçamento/termo

**10A.6** `[x]` `backend/app/schemas/produto_schema.py` — `ProdutoResponse`, `ProdutoListResponse`.

**10A.7** `[x]` `backend/app/routers/produto_router.py`:
| Verbo | Rota | Função |
|---|---|---|
| POST | `/produtos/sync` | Dispara sincronização |
| GET | `/produtos` | Lista (com `search`, `ativo`, paginação) |
| GET | `/produtos/{auvo_id}` | Detalhe |

Registrar em `main.py` com prefixo `/api/v1`.

### Frontend

**10A.8** `[x]` `cmport-front/app/produtos/page.tsx` — lista simples com:
- Botão "🔄 Sincronizar com Auvo" no header
- Busca por nome (input)
- Tabela: imagem (thumbnail), código Auvo, nome, valor, estoque, status (ativo/inativo)
- Paginação (50 por página)

**10A.9** `[x]` Adicionar item "Produtos" no sidebar (`components/Sidebar.tsx`).

### Verificação 10A
- `POST /produtos/sync` responde com `{novos: N, atualizados: M}`.
- Produtos aparecem em `/produtos` no frontend.
- Busca por nome funciona.

---

## Sub-fase 10B — Sync de Orçamentos Auvo `[x]`

### Por que segundo
Depende de 10A para resolver nomes de produtos via FK local. Será usado pelo termo de garantia e (futuro) por geração de nota fiscal.

### Backend

**10B.1** `[x]` Migration SQL
```sql
CREATE TABLE orcamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    auvo_public_id INT NOT NULL UNIQUE,           -- publicId no Auvo
    customer_id INT NULL,                         -- ID do cliente no Auvo
    customer_name VARCHAR(255) NULL,
    condominio_id INT NULL,                       -- vínculo local (FK opcional)
    external_code VARCHAR(50) NULL,
    register_date DATE NULL,
    request_date DATE NULL,
    expire_date DATE NULL,
    last_update_date DATE NULL,
    observations TEXT NULL,
    internal_note TEXT NULL,
    public_link VARCHAR(500) NULL,
    current_stage_description VARCHAR(100) NULL,
    is_cancelled BOOLEAN DEFAULT FALSE,
    discount_value DECIMAL(10,2) DEFAULT 0,
    total_products DECIMAL(12,2) DEFAULT 0,
    total_services DECIMAL(12,2) DEFAULT 0,
    total_additional_costs DECIMAL(12,2) DEFAULT 0,
    gross_total_value DECIMAL(12,2) DEFAULT 0,
    net_total_value DECIMAL(12,2) DEFAULT 0,
    sincronizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_orcamento_condominio FOREIGN KEY (condominio_id)
        REFERENCES condominios(id) ON DELETE SET NULL,
    INDEX idx_orcamento_customer (customer_id),
    INDEX idx_orcamento_condo (condominio_id),
    INDEX idx_orcamento_request (request_date)
);

CREATE TABLE orcamento_itens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orcamento_id INT NOT NULL,
    tipo ENUM('PRODUTO', 'SERVICO', 'CUSTO_ADICIONAL') NOT NULL,
    produto_id INT NULL,                          -- FK local para produtos
    auvo_product_id INT NULL,                     -- ID Auvo do produto (cópia)
    auvo_service_id VARCHAR(50) NULL,             -- GUID do serviço Auvo
    nome VARCHAR(255) NULL,                       -- snapshot do nome
    descricao TEXT NULL,
    quantidade DECIMAL(10,2) DEFAULT 1,
    valor_unitario DECIMAL(10,2) NOT NULL,
    desconto_tipo VARCHAR(20) NULL,               -- 'Percentual' ou 'Monetario'
    desconto_valor DECIMAL(10,2) DEFAULT 0,
    valor_total DECIMAL(12,2) NOT NULL,
    CONSTRAINT fk_item_orcamento FOREIGN KEY (orcamento_id)
        REFERENCES orcamentos(id) ON DELETE CASCADE,
    CONSTRAINT fk_item_produto FOREIGN KEY (produto_id)
        REFERENCES produtos(id) ON DELETE SET NULL,
    INDEX idx_item_orcamento (orcamento_id)
);

CREATE TABLE orcamento_task_ids (
    orcamento_id INT NOT NULL,
    task_id BIGINT NOT NULL,
    PRIMARY KEY (orcamento_id, task_id),
    CONSTRAINT fk_taskid_orcamento FOREIGN KEY (orcamento_id)
        REFERENCES orcamentos(id) ON DELETE CASCADE,
    INDEX idx_taskid_task (task_id)
);
```

**10B.2** `[x]` `backend/app/models/orcamento_model.py` — `Orcamento`, `OrcamentoItem`, `OrcamentoTaskId`. Registrar em `main.py`.

**10B.3** `[x]` `backend/app/services/auvo_client.py` — adicionar:
- `listar_orcamentos(date_start, date_end, customer_id=None, page=1, page_size=50)`
- `get_all_orcamentos_by_period(date_start, date_end)` — itera todas as páginas
- `get_orcamento(orcamento_id)` — detalhe completo

**10B.4** `[x]` `backend/app/repositories/orcamento_repository.py` — `upsert`, `list`, `get_by_auvo_id`, `list_by_condominio`, `list_by_task_id`.

**10B.5** `[x]` `backend/app/services/orcamento_service.py`:
- `sincronizar(db, date_start, date_end) -> dict` — itera lista, busca detalhe completo de cada um, salva orçamento + itens + taskIds. Vincula a `condominio_id` se `customer_id` bater.
- `listar(db, condominio_id?, search?, page, page_size)`
- `detalhe(db, orcamento_id)` — retorna com itens enriquecidos
- `_resolver_produto_local(db, auvo_product_id)` — busca em `produtos` para vincular FK
- `listar_por_condominio_e_periodo(db, condominio_id, data_referencia, dias_antes=90)` — usado pelo termo

**10B.6** `[x]` `backend/app/schemas/orcamento_schema.py` — `OrcamentoResponse`, `OrcamentoItemResponse`, `OrcamentoListResponse`.

**10B.7** `[x]` `backend/app/routers/orcamento_router.py`:
| Verbo | Rota | Função |
|---|---|---|
| POST | `/orcamentos/sync` | Dispara sync por período |
| GET | `/orcamentos` | Lista paginada |
| GET | `/orcamentos/{auvo_public_id}` | Detalhe |
| GET | `/orcamentos/condominio/{condo_id}` | Lista por condomínio |

### Frontend

**10B.8** `[x]` `cmport-front/app/orcamentos/page.tsx` — lista com:
- Botão "🔄 Sincronizar (período)"
- Filtros: condomínio, data, status (cancelado/ativo)
- Tabela: publicId, cliente, data, valor, qtd itens, status

**10B.9** `[x]` `cmport-front/app/orcamentos/[id]/page.tsx` — detalhe com lista de itens (produtos + serviços + custos), totais, link público, observações.

**10B.10** `[x]` Sidebar: item "Orçamentos".

**10B.11** `[x]` Em `app/condominios/[id]/page.tsx` — adicionar seção "Orçamentos recentes" (últimos 10 do condomínio).

### Verificação 10B
- Sync de período retorna contagens; orçamentos aparecem na listagem.
- Detalhe mostra itens com nomes corretos (FK para produto local quando disponível, snapshot quando não).

---

## Sub-fase 10C — Termo de Garantia `[x]`

### Backend

**10C.1** `[x]` Migration SQL
```sql
CREATE TABLE termos_garantia (
    id INT AUTO_INCREMENT PRIMARY KEY,
    servico_id INT NOT NULL UNIQUE,
    produto_descricao TEXT NOT NULL,
    prazo_meses INT NOT NULL,                     -- 3, 6 ou 12
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    orcamento_id INT NULL,                        -- FK local para orcamentos
    criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
    atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_termo_servico FOREIGN KEY (servico_id)
        REFERENCES manutencoes_assistencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_termo_orcamento FOREIGN KEY (orcamento_id)
        REFERENCES orcamentos(id) ON DELETE SET NULL,
    INDEX idx_termo_servico (servico_id)
);
```

**10C.2** `[x]` `backend/app/models/termo_garantia_model.py` — modelo + relação com `ManutencaoAssistencia` e `Orcamento`. Registrar em `main.py`.

**10C.3** `[x]` `backend/requirements.txt` — adicionar `reportlab==4.2.5` e `python-dateutil>=2.8.2`.

**10C.4** `[x]` `backend/app/repositories/termo_garantia_repository.py` — `get_by_servico_id`, `upsert`, `delete`.

**10C.5** `[x]` `backend/app/services/termo_garantia_service.py`:
- `salvar(db, servico_id, produto, prazo_meses, orcamento_id=None)` — calcula `data_inicio = servico.data_servico`, `data_fim = data_inicio + relativedelta(months=prazo_meses)`, faz upsert
- `obter(db, servico_id)`
- `gerar_pdf(db, servico_id) -> bytes` — reportlab montando o template
- `excluir(db, servico_id)`
- `montar_descricao_de_orcamento(db, orcamento_id)` — formata `"3x PRODUTO_X · 1x SERVICO_Y"` a partir dos itens locais (sem chamar Auvo)

**10C.6** `[x]` Template do PDF (em `termo_garantia_service.py`):
```
São Paulo, {DATA_GERACAO}

TERMO DE GARANTIA DO PRODUTO / SERVIÇO

Cliente: {CONDOMINIO_NOME}
Endereço: {ENDERECO_COMPLETO}

Pelo presente instrumento, formaliza-se o termo de garantia referente ao
serviço prestado, consistente em {PRODUTO_DESCRICAO}, conforme abaixo descrito:

Data da execução do serviço: {DATA_SERVICO}
Nota Fiscal: nº {NUMERO_NOTA}
Ordem de Serviço: nº {NUMERO_OS}

Prazo de Garantia:
A garantia concedida é de {PRAZO_NUM} ({PRAZO_EXTENSO}) meses, com início
em {DATA_INICIO} e término em {DATA_FIM}.

Condições da Garantia:
A presente garantia cobre exclusivamente defeitos decorrentes de falha de
instalação ou do equipamento fornecido, dentro do prazo estabelecido.

A garantia será automaticamente cancelada nas seguintes hipóteses:
  • Intervenção, manutenção ou reparo realizado por pessoas não autorizadas;
  • Danos decorrentes de acidentes, quedas ou agentes externos;
  • Variações de tensão elétrica, sobrecargas ou instalações elétricas inadequadas;
  • Uso indevido ou em desacordo com as recomendações técnicas;
  • Qualquer ocorrência imprevisível ou de força maior que comprometa o
    funcionamento do equipamento.

Sem mais, permanecemos à disposição para quaisquer esclarecimentos.

Atenciosamente,
{EMPRESA_NOME}
André Moreira Rosa
Diretor Comercial
```
- Empresa = `ConfiguracaoEmpresa.nome` (fallback "CMPORT Sistemas Eletrônicos de Segurança")
- "André Moreira Rosa — Diretor Comercial" hardcoded

**10C.7** `[x]` `backend/app/schemas/termo_garantia_schema.py`:
- `TermoGarantiaCreate` — `produto: str`, `prazo_meses: Literal[3, 6, 12]`, `orcamento_id: Optional[int]`
- `TermoGarantiaResponse`

**10C.8** `[x]` `backend/app/routers/termo_garantia_router.py`:
| Verbo | Rota | Função |
|---|---|---|
| GET | `/servicos/{servico_id}/orcamentos-candidatos` | Lista orçamentos do condomínio nos 90 dias antes da data do serviço |
| POST | `/servicos/{servico_id}/termo-garantia` | Cria/regera termo |
| GET | `/servicos/{servico_id}/termo-garantia` | Retorna dados (404 se não existe) |
| GET | `/servicos/{servico_id}/termo-garantia/pdf` | Baixa PDF |
| DELETE | `/servicos/{servico_id}/termo-garantia` | Remove |

### Frontend

**10C.9** `[x]` `cmport-front/app/servicos/[id]/page.tsx` — novo painel entre OS e Nota Fiscal:
- **Sem termo gerado**: card cinza com botão "🛡️ Gerar Termo de Garantia"
- **Com termo gerado**: card verde com produto, prazo, validade + botões "Baixar PDF", "Regerar", "Remover"

**10C.10** `[x]` Modal de geração (2 etapas, padrão `modalInter`):
- *Etapa 1*: lista orçamentos candidatos (carregada via `/orcamentos-candidatos`); botões "Usar este orçamento" e "Pular (digitar manualmente)"
- *Etapa 2*: textarea "Produto/Serviço" (pré-preenchido), radio "Prazo: 3/6/12 meses", resumo das datas, botão "Gerar Termo"

### Verificação 10C
- POST cria; GET retorna; PDF baixa e abre; DELETE remove.
- Modal carrega orçamentos do condomínio.
- TS sem erros.

---

## Sub-fase 10D — Email cleanup `[ ]`

**10D.1** `[x]` `backend/app/services/boleto_service.py` — `enviar_email_boleto`:
- Remover anexo XML (linhas ~1156-1160)
- Adicionar anexo do termo após bloco da OS: se `TermoGarantia` existir → gerar PDF e adicionar em `lista_anexos` como `termo_garantia_servico_<id>.pdf`

**10D.2** `[x]` `backend/app/services/email_service.py`:
- `_RODAPE_PADRAO` (linha 60): remover menção a "XML da nota fiscal"
- `_corpo` default (linhas 79-83): remover menção a XML

**10D.3** `[x]` Frontend `cmport-front/app/servicos/[id]/page.tsx` (composer ~linhas 2470-2507):
- Remover chip do XML (`nota_<numero>.xml`)
- Adicionar chip "Termo de Garantia (automático)" condicional — só renderiza se `ordemServico` tem termo gerado

### Verificação 10D
- Enviar email de teste para si mesmo; confirmar **sem XML**, **com termo**.
- Boleto sem termo: email continua funcionando (boleto + OS).

---

## Sub-fase 10F — Checklist de Produtos do Orçamento no Termo de Garantia `[x]`

### Objetivo
Substituir a textarea pré-preenchida por um checklist interativo de produtos do orçamento, permitindo ao usuário selecionar, adicionar e remover itens antes de gerar o termo. PDF mantido em 1 página via redução de fonte.

### Decisões Técnicas
| Decisão | Escolha |
|---|---|
| Tipos de item no termo | Apenas `PRODUTO` (excluir `SERVICO` e `CUSTO_ADICIONAL`) |
| Fluxo manual (sem orçamento) | Sem alteração — continua com textarea livre |
| Fonte do produto no PDF | `Pt(9)` aplicado via python-docx ao preencher o run |
| Novo endpoint | Nenhum — usa `GET /api/v1/orcamentos/{auvo_public_id}` já existente |

### Backend

**10F.1** `[x]` `backend/app/services/termo_garantia_service.py` — `montar_descricao_de_orcamento`:
- Filtrar apenas `item.tipo == 'PRODUTO'` (ignorar `SERVICO` e `CUSTO_ADICIONAL`)

**10F.2** `[x]` `backend/app/services/termo_garantia_service.py` — `gerar_pdf`:
- Ao preencher o run bold do produto (`"consistente na"`), aplicar `run.font.size = Pt(9)` logo após `run.text = produto_desc`
- Importar `from docx.shared import Pt` no topo do arquivo

### Frontend

**10F.3** `[x]` `cmport-front/app/servicos/[id]/page.tsx` — nova Etapa 1.5 no modal do termo:

**Fluxo atual:**
`Etapa 1 (selecionar orçamento)` → `Etapa 2 (textarea + prazo + datas)`

**Novo fluxo:**
`Etapa 1 (selecionar orçamento)` → `Etapa 1.5 (checklist de produtos)` → `Etapa 2 (prazo + datas)`

**Etapa 1.5 — detalhes:**
- Ao clicar "Usar este orçamento" na Etapa 1: fetch `GET /api/v1/orcamentos/{auvo_public_id}` (endpoint existente, retorna `OrcamentoFullResponse` com `itens`)
- Filtrar `itens.filter(i => i.tipo === 'PRODUTO')` → montar estado local `produtosSelecionados: {nome: string, quantidade: number}[]` (todos pré-checados)
- Renderizar lista: cada linha tem checkbox + `{quantidade}x {nome}` + botão `×` para remover
- Botão `+ Adicionar item` → abre inputs inline para `nome` (text) e `quantidade` (number), botão "OK" adiciona à lista
- Botão "Avançar" → gera `produto_descricao` = itens checados formatados como `"2x Camera HiKVISION · 1x NVDS"` → avança para Etapa 2 (com `setTermoProduto`)
- Botão "← Voltar" → retorna à Etapa 1
- Caminho "Pular (digitar manualmente)" → continua indo direto para Etapa 2 sem passar pela 1.5

**Novo estado necessário:**
```typescript
const [etapaTermo, setEtapaTermo] = useState<1 | 1.5 | 2>(1)
interface ProdutoChecklist { nome: string; quantidade: number }
const [produtosChecklist, setProdutosChecklist] = useState<ProdutoChecklist[]>([])
const [novoItemNome, setNovoItemNome] = useState('')
const [novoItemQtd, setNovoItemQtd] = useState(1)
const [adicionandoItem, setAdicionandoItem] = useState(false)
```

### Verificação 10F
- Selecionar orçamento → Etapa 1.5 aparece com produtos do orçamento pré-checados
- Remover item → some da lista; adicionar item avulso → aparece na lista
- Avançar → `produto_descricao` reflete exatamente os itens checados
- PDF gerado cabe em 1 página mesmo com 5+ produtos
- Caminho manual (Pular) → textarea livre como antes
- `npx tsc --noEmit` — zero erros

---

## Correções Pós-10F — 2026-04-30 `[x]`

### Termo de Garantia — 1 página + produtos corretos
- `[x]` `_remover_quebras_pagina(doc)` adicionado ao service e ao script de teste — elimina `w:pageBreakBefore` e `w:br type="page"` do template; PDF sai em 1 página
- `[x]` `gerar_pdf` passou a usar `termo.produto_descricao` diretamente (checklist já formatado pelo frontend), em vez de re-consultar `montar_descricao_de_orcamento` — resolve produtos não aparecendo
- `[x]` Sufixo A/M confirmado correto: `-A` = assistencia, `-M` = manutencao
- `[x]` `backend/teste_gerador_termo_garantia.py` corrigido com encoding utf-8 e `remover_quebras_pagina`

### Orçamento no detalhe do serviço
- `[x]` Novo endpoint `GET /api/v1/orcamentos/por-servico/{servico_id}` — busca via `OrcamentoTaskId.task_id = int(servico.numero_os)`
- `[x]` Frontend: card "Orçamento Vinculado" na página `/servicos/[id]` entre OS e Termo de Garantia — mostra número Auvo, data, status, total e itens
- `[x]` Fallback: se `por-servico` retorna null, busca primeiro candidato dos últimos 90 dias (`/orcamentos/candidatos/{servico_id}`)

### Checklist do termo — pré-preenchimento e itens SERVICO
- `[x]` `abrirModalTermo`: se orçamento já carregado na página, pula direto para Etapa 2 com produtos pré-selecionados (sem precisar recarregar da API)
- `[x]` Checklist agora inclui itens `PRODUTO` **e** `SERVICO` (antes só `PRODUTO`)
- `[x]` Card do detalhe também mostra itens `PRODUTO` e `SERVICO`

### Relacionamento orçamento ↔ OS
- Chave comum: Auvo task ID guardado em `manutencoes_assistencias.numero_os` (String), `ordens_servico.task_id` (Int) e `orcamento_task_ids.task_id` (BigInt)
- Um orçamento pode ter N task_ids (N OSs); cada OS normalmente liga a 1 orçamento

---

## Sub-fase 10G — Geração de Termo via HTML + Preview no Frontend `[ ]`

### Visão Geral e Motivação

O PDF atual é gerado manipulando um template DOCX com `python-docx` e convertendo via **LibreOffice headless** (subprocess externo, ~60s de timeout, imagem Docker +400MB). O resultado tem problemas de layout difíceis de ajustar porque dependem de como o LibreOffice interpreta o DOCX.

O arquivo `gerador_termo_garantia.html` já foi refinado para produzir um PDF idêntico ao oficial (timbrado, assinatura, layout A4). A ideia é usar essa estrutura HTML como template no backend, substituindo todo o fluxo DOCX+LibreOffice por **HTML + WeasyPrint** (biblioteca Python pura, processo interno, mais rápido e leve).

Além disso, o usuário ganha um botão **"👁️ Visualizar"** que abre um preview do termo antes de baixar o PDF.

### Decisões Técnicas

| Decisão | Escolha |
|---|---|
| Motor de PDF | **WeasyPrint** (Python, in-process, substitui LibreOffice) |
| Templating | **Jinja2** (já no ecossistema FastAPI/Starlette) |
| Template fonte | `backend/app/assets/termo_garantia_template.html` (derivado do `gerador_termo_garantia.html`) |
| Imagens no template | Timbrado + assinatura lidos do disco e embutidos como base64 em runtime |
| Preview | Novo endpoint `GET /termos-garantia/{id}/preview-html` retorna `text/html` |
| Modal de preview | `<iframe>` no frontend, escalado para caber na tela |
| Dockerfile | Trocar `libreoffice` por deps do WeasyPrint (imagem ~200MB menor) |

---

### Backend

**10G.1** `[ ]` Criar template HTML Jinja2 em `backend/app/assets/termo_garantia_template.html`

Baseado na estrutura do `gerador_termo_garantia.html`, mas sem sidebar e sem JavaScript. Apenas o `.doc` container com `.doc-bg`, `.doc-layer` e `.doc-body`. Variáveis Jinja2 em todos os campos dinâmicos:

```html
<!-- Campos dinâmicos via Jinja2 -->
{{ data_hoje }}               <!-- "27 de abril de 2026" -->
{{ cliente_nome }}            <!-- "Condominio Edifício Araucárias" -->
{{ cliente_endereco }}        <!-- "Av: Dr. Francisco Ranieri1, 700..." -->
{{ produto_descricao }}       <!-- "1x REFLETOR LED 100W SLIM EMPALUX" -->
{{ data_servico }}            <!-- "22/04/2026" -->
{{ numero_nota }}             <!-- "000.000.079-A" ou vazio -->
{{ numero_os }}               <!-- "72179837" ou vazio -->
{{ prazo_fmt }}               <!-- "06 (seis)" -->
{{ data_inicio }}             <!-- "17/04/2026" -->
{{ data_fim }}                <!-- "17/04/2027" -->
{{ empresa_nome }}            <!-- "CMPORT Sistemas de Eletrônicos de Segurança" -->
{{ timbrado_b64 }}            <!-- base64 do PNG do timbrado — injetado pelo service -->
{{ assinatura_b64 }}          <!-- base64 do PNG da assinatura — injetado pelo service -->
```

Blocos condicionais:
```html
{% if numero_nota %}
  <li><em><strong>Nota Fiscal:</strong> nº {{ numero_nota }}</em></li>
{% endif %}
{% if numero_os %}
  <li><em><strong>Ordem de Serviço:</strong> nº {{ numero_os }}</em></li>
{% endif %}
```

**10G.2** `[ ]` Atualizar `backend/requirements.txt`:
```
weasyprint>=62.0
jinja2>=3.1.0
```

**10G.3** `[ ]` Atualizar `backend/Dockerfile`:
```dockerfile
# REMOVER:
#   libreoffice

# ADICIONAR (deps do WeasyPrint):
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    shared-mime-info \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
```

**10G.4** `[ ]` Refatorar `backend/app/services/termo_garantia_service.py`:

**Remover** (específico de DOCX):
- `_TEMPLATE_PATH` (caminho do `.docx`)
- Funções: `_para_text`, `_merge_all`, `_set_cliente_endereco`, `_set_normal_runs`, `_set_prazo`, `_remove_para`, `_remover_quebras_pagina`, `_remover_paragrafos_vazios_iniciais`, `_ajustar_para_uma_pagina`
- Import `from docx import Document`
- Bloco `subprocess.run(['libreoffice', ...])`

**Adicionar**:
```python
import base64
from jinja2 import Environment, FileSystemLoader

_ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "assets")
_HTML_TEMPLATE = "termo_garantia_template.html"
_TIMBRADO_PATH = os.path.join(_ASSETS_DIR, "timbrado.png")
_ASSINATURA_PATH = os.path.join(_ASSETS_DIR, "assinatura_andre.png")

def _b64(path: str) -> str:
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def _render_html(context: dict) -> str:
    env = Environment(loader=FileSystemLoader(_ASSETS_DIR))
    tpl = env.get_template(_HTML_TEMPLATE)
    return tpl.render(**context)
```

**Modificar** `gerar_pdf(db, termo_id)`:
```python
@staticmethod
def gerar_pdf(db: Session, termo_id: int) -> io.BytesIO:
    from weasyprint import HTML

    # ... (mesmo código de coleta de dados — sem alteração) ...

    html_str = _render_html({
        'data_hoje':        hoje_str,
        'cliente_nome':     condominio.nome,
        'cliente_endereco': endereco_str,
        'produto_descricao': produto_desc,
        'numero_nota':      numero_nota_fmt,   # vazio se sem nota
        'numero_os':        numero_os,          # vazio se sem OS
        'prazo_fmt':        prazo_fmt,
        'data_servico':     data_servico_str,
        'data_inicio':      data_inicio_str,
        'data_fim':         data_fim_str,
        'empresa_nome':     empresa_nome,
        'timbrado_b64':     _b64(_TIMBRADO_PATH),
        'assinatura_b64':   _b64(_ASSINATURA_PATH),
    })

    pdf_bytes = HTML(string=html_str).write_pdf()
    return io.BytesIO(pdf_bytes)
```

**Adicionar** método `gerar_html_preview(db, termo_id) -> str`:
- Mesmo fluxo de coleta de dados + `_render_html(context)`, mas retorna string HTML em vez de converter para PDF.

**10G.5** `[ ]` Adicionar endpoint de preview em `backend/app/routers/termo_garantia_router.py`:

```python
@router.get("/{termo_id}/preview-html", response_class=HTMLResponse)
def get_termo_preview_html(termo_id: int, db: Session = Depends(get_db)):
    html_str = TermoGarantiaService.gerar_html_preview(db, termo_id)
    return HTMLResponse(content=html_str)
```

| Verbo | Rota | Resposta |
|---|---|---|
| GET | `/termos-garantia/{id}/preview-html` | `text/html` — HTML do termo com dados reais |

---

### Frontend

**10G.6** `[ ]` Adicionar botão "👁️ Visualizar" no card do termo em `cmport-front/app/servicos/[id]/page.tsx`:

- Aparece ao lado de "Baixar PDF" quando `termoGarantia` existe
- Ao clicar: `setModalPreviewTermo(true)` + fetch `GET /termos-garantia/{termoGarantia.id}/preview-html` → armazena HTML em estado

**Novo estado necessário:**
```typescript
const [modalPreviewTermo, setModalPreviewTermo] = useState(false)
const [previewTermoHtml, setPreviewTermoHtml] = useState<string | null>(null)
const [carregandoPreview, setCarregandoPreview] = useState(false)
```

**10G.7** `[ ]` Criar modal de preview em `cmport-front/app/servicos/[id]/page.tsx`:

```tsx
{modalPreviewTermo && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
    <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{width: 860, maxHeight: '95vh'}}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <span className="font-semibold text-gray-800">Preview — Termo de Garantia</span>
        <div className="flex gap-2">
          <button onClick={baixarPdfTermo} className="btn-primary">⬇️ Baixar PDF</button>
          <button onClick={() => setModalPreviewTermo(false)} className="btn-ghost">✕ Fechar</button>
        </div>
      </div>
      {/* Iframe com o HTML */}
      <div className="overflow-auto flex-1 flex justify-center p-4 bg-gray-100">
        <iframe
          srcDoc={previewTermoHtml ?? ''}
          style={{ width: 794, height: 1123, border: 'none', flexShrink: 0 }}
          title="Preview Termo de Garantia"
        />
      </div>
    </div>
  </div>
)}
```

- `srcDoc` recebe o HTML retornado pelo endpoint (não usa `src` com URL para evitar auth issues)
- Dimensões do iframe: 794×1123px (A4 exato)
- Modal scrollável se a tela for menor que A4

---

### Arquivos a Salvar

| Arquivo | Ação |
|---|---|
| `backend/app/assets/termo_garantia_template.html` | **Criar** — template Jinja2 derivado do `gerador_termo_garantia.html` |
| `backend/app/assets/timbrado.png` | **Criar** — extrair do DOCX (`word/media/image2.jpeg` ou PNG do HTML) |
| `backend/app/assets/assinatura_andre.png` | **Criar** — já extraído em `extracted_media/word/media/image1.png` |
| `backend/app/services/termo_garantia_service.py` | **Refatorar** — remover DOCX/LibreOffice, adicionar Jinja2+WeasyPrint |
| `backend/app/routers/termo_garantia_router.py` | **Adicionar** endpoint `preview-html` |
| `backend/requirements.txt` | **Atualizar** — add `weasyprint`, `jinja2` |
| `backend/Dockerfile` | **Atualizar** — trocar LibreOffice por deps WeasyPrint |
| `cmport-front/app/servicos/[id]/page.tsx` | **Adicionar** botão + modal de preview |

---

### Verificação 10G

- `GET /termos-garantia/{id}/preview-html` retorna HTML renderizado com dados reais do banco
- `GET /termos-garantia/{id}/pdf` retorna PDF gerado pelo WeasyPrint (sem LibreOffice)
- PDF gerado é visualmente idêntico ao gerado pelo `gerador_termo_garantia.html` no browser
- Botão "👁️ Visualizar" abre modal com iframe mostrando o termo corretamente
- Botão "⬇️ Baixar PDF" dentro do modal faz download do PDF
- `npx tsc --noEmit` — zero erros
- Imagem Docker ~200MB menor (sem LibreOffice)

---

## Sub-fase 10E — Futuro (não escopo desta entrega)

`[ ]` Geração de nota fiscal a partir de orçamento Auvo:
- A partir do detalhe do orçamento local, criar registro em `notas_fiscais` com produtos/serviços
- Permitir disparar emissão fiscal externa
- Vincular automaticamente a `ManutencaoAssistencia` correspondente

---

## Ordem de Execução Sugerida

| Bloco | Sub-fase | Razão |
|---|---|---|
| 1 | 10A — Produtos | Base para resolver nomes em orçamentos |
| 2 | 10B — Orçamentos | Depende de 10A; entrega valor de visualização |
| 3 | 10C — Termo de Garantia | Depende de 10B |
| 4 | 10D — Email cleanup | Depende de 10C estar emitindo termos |

Cada bloco é deployável separadamente via `git push vps master`.

---

## Verificação Geral End-to-End (após 10D)

1. **Sincronizar produtos**: `/produtos/sync` → ver lista no frontend.
2. **Sincronizar orçamentos**: `/orcamentos/sync` → ver lista; abrir um detalhe → confirmar itens com nomes corretos.
3. **Criar termo**: abrir um serviço com orçamento recente → modal carrega lista → selecionar → preencher prazo → gerar.
4. **Baixar PDF do termo** → abrir e validar texto.
5. **Email de boleto**: enviar teste → confirmar 3 anexos (boleto + OS + termo), **sem XML**.
6. **TypeScript**: `npx tsc --noEmit` (zero erros).
7. **Deploy**: `git push vps master`.

---

## Notas de Compatibilidade

- Endpoints existentes continuam funcionando.
- Remoção do XML é silent (não há flag).
- Termo é opcional — serviços sem termo enviam email normalmente.
- Sync de produtos/orçamentos é incremental (upsert por `auvo_id`/`auvo_public_id`).
- Pode executar 10A e 10B sem ainda ter o termo — entregam valor sozinhos (visualização de catálogo + histórico de propostas).
