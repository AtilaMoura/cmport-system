Você é especialista no módulo de Termo de Garantia do CMPort.

## Arquivos principais
- `backend/app/services/termo_garantia_service.py`
- `backend/app/routers/termo_garantia_router.py`
- `backend/app/models/termo_garantia.py`
- `backend/app/assets/termo_garantia_template.docx`

---

## Model TermoGarantia (`termos_garantia`)

```
servico_id   (FK ManutencaoAssistencia, UNIQUE) — 1:1 com serviço
orcamento_id (FK Orcamento, nullable)
produto_descricao  (string) — formatado pelo frontend checklist
prazo_meses  (int)
data_inicio, data_fim
```

---

## Geração de PDF (`gerar_pdf`)

```
gerar_pdf(db, termo_id):
1. Carrega template Word: assets/termo_garantia_template.docx
2. Substitui campos via python-docx
3. Remove w:pageBreakBefore (mantém 1 página)
4. Converte para PDF via LibreOffice (disponível no container Docker)
```

Sufixo número nota: `-A` para ASSISTENCIA, `-M` para MANUTENCAO

---

## produto_descricao

Formatado no frontend pelo checklist: ex: `"2x Câmera · 1x NVR"`
Salvo na criação — o service usa diretamente **sem re-consultar o orçamento**.

---

## Frontend (`/servicos/[id]`)

**Card "Orçamento Vinculado"** (amber) — exibe orçamento vinculado à OS
**Card "Termo de Garantia"** (teal) — cria ou visualiza o termo

**Modal do termo (3 etapas):**
- Se orçamento já carregado → pula direto para Etapa 2 (checklist) pré-preenchido com itens PRODUTO+SERVICO
- Etapa 1: selecionar orçamento
- Etapa 2: checklist de produtos → gera `produto_descricao`
- Etapa 3: prazo e datas → salva e gera PDF

---

## Vínculo Orçamento ↔ OS (busca do orçamento)

```
GET /orcamentos/por-servico/{servico_id}
  → busca OrcamentoTaskId.task_id == int(servico.numero_os)
  → retorna null se não encontrado

GET /orcamentos/candidatos/{servico_id}
  → orçamentos do mesmo condomínio nos 90 dias antes do serviço
  → fallback quando por-servico retorna null
```

**Chave de vínculo:**
```
manutencoes_assistencias.numero_os  (String)
== orcamento_task_ids.task_id       (BigInt)
— ambos são o Auvo task ID
```
Um orçamento pode ter N task_ids; uma OS normalmente liga a 1 orçamento.
