# CMPort — Plano: Geração de Nota Fiscal

> Estado do sistema em maio/2026. Referência para priorização de desenvolvimento.

---

## 1. O que o sistema já tem

### Cadastros e Dados Mestres ✅
| O quê | Situação |
|---|---|
| Cadastro de condomínios (nome, CNPJ, razão social) | ✅ Completo |
| Contratos por condomínio (valor, vencimento, descrição padrão) | ✅ Completo |
| Contatos por condomínio (email, flag "receber boleto") | ✅ Completo |
| Configuração de impostos por tipo (PIS, COFINS, INSS, CSLL, ISS) | ✅ Completo |
| Configuração da empresa emitente | ✅ Completo |
| Usuários com roles (DEV / ADMIN / USUARIO) | ✅ Completo |

### Integração Auvo ✅
| O quê | Situação |
|---|---|
| Sync de clientes → condomínios | ✅ |
| Sync de produtos | ✅ |
| Sync de orçamentos | ✅ |
| Sync de ordens de serviço (OSs) | ✅ |

### Corpo de Nota (Pré-Nota) ✅
| O quê | Situação |
|---|---|
| Criação de ciclos mensais por condomínio/tipo | ✅ |
| Wizard de criação em 5 passos | ✅ |
| Auto-fill a partir do contrato (valor, vencimento, descrição) | ✅ |
| Auto-fill a partir da OS do Auvo | ✅ |
| Cálculo automático de impostos (bruto → líquido) | ✅ |
| Geração de texto formatado (`conteudo_gerado`) | ✅ |
| Numeração sequencial anual (MAT-2026/0001) | ✅ |
| Botão "Copiar" para facilitar preenchimento manual | ✅ |
| Preview antes de confirmar | ✅ |
| Edição inline de campos | ✅ |
| Filtro de condomínios pendentes no mês | ✅ |
| Stats: com contrato / pendentes / criados | ✅ |

### Nota Fiscal (Importação) ✅
| O quê | Situação |
|---|---|
| Import de XML individual ou ZIP com múltiplas notas | ✅ |
| Suporte a NFS-e municipal e NF-e federal | ✅ |
| Extração automática de: valor, parcelas, impostos, OS | ✅ |
| Vínculo automático nota ↔ corpo de nota ao importar | ✅ |
| Vínculo manual quando há múltiplos candidatos | ✅ |
| Upload e armazenamento do PDF da nota (MinIO/R2) | ✅ |
| Exportação Excel com filtros | ✅ |

### Boleto (Banco Inter) ✅
| O quê | Situação |
|---|---|
| Geração de boleto via API Inter (mTLS) | ✅ |
| Suporte a boleto parcelado (N parcelas) | ✅ |
| Download PDF do boleto | ✅ |
| Sincronização de status (EMABERTO / PAGO / VENCIDO) | ✅ |
| Registro de pagamento manual | ✅ |
| Boleto manual (não-Inter: PIX, transferência, dinheiro) | ✅ |

### Email ✅
| O quê | Situação |
|---|---|
| Envio de email com PDF do boleto em anexo | ✅ |
| Anexo do PDF da nota fiscal | ✅ |
| Anexo do Termo de Garantia | ✅ |
| Envio via SMTP ou Microsoft Graph (fallback) | ✅ |
| Template com corpo e rodapé customizados | ✅ |

### Documentos PDF ✅
| O quê | Situação |
|---|---|
| Boleto (via Banco Inter) | ✅ |
| Termo de Garantia (WeasyPrint, HTML → PDF) | ✅ |
| Excel de notas fiscais | ✅ |

---

## 2. O Fluxo Atual (como funciona hoje)

```
┌─ 1. AUVO ──────────────────────────────────────────────────┐
│  Sync automático → OSs, orçamentos, clientes atualizados   │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ 2. CORPO DE NOTA (dentro do CMPort) ──────────────────────┐
│  Operador cria corpo de nota para o mês                    │
│  Sistema auto-preenche: valor, vencimento, OS, descrição   │
│  Gera texto formatado → operador copia e usa externamente  │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ 3. EMISSÃO DA NOTA (FORA do CMPort) ──────────────────────┐
│  ⚠️ PASSO MANUAL — feito no site da prefeitura de SP       │
│     (nfe.prefeitura.sp.gov.br ou nota.fiscal.sp.gov.br)    │
│  Operador cola o texto do corpo de nota lá                 │
│  Recebe o XML da nota autorizada (Nota Fiscal Paulistana)  │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ 4. IMPORTAÇÃO DO XML (dentro do CMPort) ──────────────────┐
│  Upload do XML da nota emitida                             │
│  Sistema vincula automaticamente ao corpo de nota          │
│  Status do corpo → XML_VINCULADO                           │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ 5. GERAÇÃO DE BOLETO (dentro do CMPort) ──────────────────┐
│  Seleciona nota → gera boleto no Banco Inter               │
│  Calcula líquido (bruto - impostos)                        │
│  Suporta parcelamento                                      │
│  Status → BOLETO_GERADO                                    │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ 6. EMAIL (dentro do CMPort) ──────────────────────────────┐
│  Envia para contatos do condomínio                         │
│  Anexos: PDF boleto + PDF nota + termo de garantia         │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ 7. PAGAMENTO ─────────────────────────────────────────────┐
│  Auto: scheduler sincroniza status no Inter a cada 6h      │
│  Manual: operador registra pagamento avulso                │
│  Status → PAGO                                             │
└────────────────────────────────────────────────────────────┘
```

**Passo crítico manual hoje:** O passo 3 — emissão da NFS-e — é feito fora do sistema. O operador copia o texto gerado pelo CMPort e preenche manualmente no site da Prefeitura de São Paulo. Depois traz o XML de volta para o CMPort.

---

## 3. Confirmação: Todas as notas são de São Paulo

Verificado em maio/2026 via análise do banco de dados e XMLs:

- **235 notas de manutenção** importadas — todas NFS-e da Prefeitura de São Paulo
- **Schema XML confirmado:** presença de `<RazaoSocialPrestador>`, `<ValorServicos>`, `<Discriminacao>` — tags exclusivas da **Nota Fiscal Paulistana**
- **Condomínios em bairros paulistanos:** Higienópolis, Perdizes, Ibirapuera, Campo Belo, Vila Madalena, Jardim América, etc.
- **Não há** notas de outros municípios no histórico

**Conclusão:** Como 100% dos condomínios estão em São Paulo, a complexidade multi-cidade é eliminada. A integração direta com a Prefeitura de SP é tecnicamente viável e elimina custo por nota.

---

## 4. O que falta para emitir a nota dentro do CMPort

> A nota de serviço emitida por empresas de manutenção é a **NFS-e** (Nota Fiscal de Serviços Eletrônica), gerenciada pela **Prefeitura de São Paulo** (sistema NF-e Paulistana).

---

### Opção A — Via serviço intermediário (NFe.io, Notazz, PlugNotas...) — Mais Rápido

Esses serviços unificam o acesso às prefeituras de todo o Brasil em uma única API REST. Como todos os condomínios são de SP, a vantagem multi-cidade não se aplica aqui — o único diferencial real é a velocidade de implementação.

| Tarefa | Descrição | Dificuldade | Estimativa |
|---|---|---|---|
| **Escolher provider** | NFe.io, Notazz, PlugNotas, Focus NFe — todos têm planos com custo por nota emitida | Fácil | 1 dia |
| **Cadastrar empresa no provider** | CNPJ, certificado digital A1 (.pfx), série, regime tributário | Fácil | 1 dia |
| **Endpoint: emitir NFS-e** | `POST /nfse` com dados do corpo de nota → provider assina e envia à prefeitura | Média | 3–4 dias |
| **Endpoint: consultar status** | Polling até nota ser autorizada (pode levar segundos ou minutos) | Média | 1–2 dias |
| **Receber XML + PDF** | Salvar XML e PDF no storage (MinIO/R2), vincular ao corpo de nota | Fácil | 1 dia |
| **Tratamento de erros** | Nota rejeitada, CNPJ irregular, alíquota errada, série duplicada | Média | 2–3 dias |
| **Frontend: botão "Emitir Nota"** | No detalhe do corpo de nota, status GERADO → emitir → XML_VINCULADO | Fácil | 1–2 dias |
| **Testes com notas reais** | Testar em ambiente sandbox do provider antes de produção | Média | 2–3 dias |

**Total estimado: 2–3 semanas**
**Custo recorrente: R$ 0,50–R$ 2,00 por nota emitida** (dependendo do plano)

---

### Opção B — Integração direta com a Prefeitura de São Paulo ⭐ Recomendada para longo prazo

Como **todos os condomínios são de São Paulo**, a integração direta com o Web Service da Prefeitura de SP elimina o custo por nota e é totalmente viável.

#### Como funciona a NFS-e Paulistana

A Prefeitura de SP usa um sistema próprio chamado **Nota Fiscal de Serviços Eletrônica (NFS-e)** ou **Nota Fiscal Paulistana**. O processo é:

```
┌─ EMPRESA (CMPort) ──────────────────────────────────────────┐
│  1. Monta um RPS (Recibo Provisório de Serviço)             │
│     XML estruturado com os dados da nota                    │
│                                                             │
│  2. Assina o XML digitalmente                               │
│     com certificado A1 (.pfx) via XMLDSig                   │
│                                                             │
│  3. Envia lote de RPS via SOAP 1.2                          │
│     POST https://nfews.prefeitura.sp.gov.br/lotenfe.asmx    │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ PREFEITURA DE SP ──────────────────────────────────────────┐
│  4. Valida o XML e converte RPS → NFS-e oficial             │
│  5. Retorna número da nota + XML autorizado                 │
│     (pode demorar segundos a minutos)                       │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ CMPort (pós-emissão) ──────────────────────────────────────┐
│  6. Polling: consulta status até retornar NFS-e autorizada  │
│  7. Salva XML + PDF no storage (MinIO/R2)                   │
│  8. Vincula ao corpo de nota → status XML_VINCULADO         │
└────────────────────────────────────────────────────────────┘
```

#### Endpoints SOAP disponíveis

| Método | URL | Função |
|---|---|---|
| `EnvioRPS` | `https://nfews.prefeitura.sp.gov.br/lotenfe.asmx` | Envia 1 RPS |
| `EnvioLoteRPS` | `https://nfews.prefeitura.sp.gov.br/lotenfe.asmx` | Envia lote de RPS |
| `ConsultaNFe` | `https://nfews.prefeitura.sp.gov.br/lotenfe.asmx` | Consulta NFS-e por número |
| `ConsultaNFeRecebidas` | `https://nfews.prefeitura.sp.gov.br/lotenfe.asmx` | Consulta notas recebidas |
| `CancelaNFe` | `https://nfews.prefeitura.sp.gov.br/lotenfe.asmx` | Cancela NFS-e |
| WSDL | `https://nfews.prefeitura.sp.gov.br/lotenfe.asmx?WSDL` | Definição do serviço |
| Homologação | `https://nfehomologacao.prefeitura.sp.gov.br/lotenfe.asmx` | Ambiente de testes |

#### Estrutura do XML RPS (simplificada)

```xml
<p1:LoteRPS>
  <p1:Cabecalho>
    <p1:CPFCNPJRemetente>
      <p1:CNPJ>00000000000000</p1:CNPJ>
    </p1:CPFCNPJRemetente>
    <p1:transacao>true</p1:transacao>
    <p1:dtInicio>2026-05-01</p1:dtInicio>
    <p1:dtFim>2026-05-31</p1:dtFim>
    <p1:QtTotalRPS>1</p1:QtTotalRPS>
    <p1:ValorTotalServicos>1500.00</p1:ValorTotalServicos>
    <p1:ValorTotalDeducoes>0.00</p1:ValorTotalDeducoes>
  </p1:Cabecalho>
  <p1:RPS>
    <p1:Assinatura>BASE64_ASSINATURA_AQUI</p1:Assinatura>
    <p1:ChaveRPS>
      <p1:InscricaoPrestador>00000000</p1:InscricaoPrestador>
      <p1:SerieRPS>NF</p1:SerieRPS>
      <p1:NumeroRPS>1</p1:NumeroRPS>
    </p1:ChaveRPS>
    <p1:TipoRPS>RPS</p1:TipoRPS>
    <p1:DataEmissao>2026-05-24</p1:DataEmissao>
    <p1:StatusRPS>N</p1:StatusRPS>
    <p1:TributacaoRPS>T</p1:TributacaoRPS>
    <p1:ValorServicos>1500.00</p1:ValorServicos>
    <p1:ValorDeducoes>0.00</p1:ValorDeducoes>
    <p1:ValorPIS>0.00</p1:ValorPIS>
    <p1:ValorCOFINS>0.00</p1:ValorCOFINS>
    <p1:ValorINSS>0.00</p1:ValorINSS>
    <p1:ValorIR>0.00</p1:ValorIR>
    <p1:ValorCSLL>0.00</p1:ValorCSLL>
    <p1:CodigoServico>07498</p1:CodigoServico>
    <p1:AliquotaServicos>2.00</p1:AliquotaServicos>
    <p1:ISSRetido>false</p1:ISSRetido>
    <p1:CPFCNPJTomador>
      <p1:CNPJ>CNPJ_CONDOMINIO</p1:CNPJ>
    </p1:CPFCNPJTomador>
    <p1:RazaoSocialTomador>NOME DO CONDOMINIO</p1:RazaoSocialTomador>
    <p1:Discriminacao>Descricao do servico prestado</p1:Discriminacao>
  </p1:RPS>
</p1:LoteRPS>
```

#### Certificado Digital A1

- **Tipo:** Certificado A1 (arquivo `.pfx` / PKCS#12) — o mais comum e mais barato
- **Padrão:** ICP-Brasil (obrigatório para assinar XMLs fiscais no Brasil)
- **Custo:** R$ 200–R$ 400/ano (emitido por autoridades certificadoras credenciadas: Certisign, Serasa, Valid, etc.)
- **Validade:** 1 ano (precisa renovar anualmente)
- **Uso no código:** lido como arquivo `.pfx` protegido por senha → nunca expor no repositório

#### Bibliotecas Python necessárias

```
lxml            # montagem e parsing do XML RPS/NFS-e
zeep            # cliente SOAP para comunicar com o Web Service
xmlsec          # assinatura digital XMLDSig (libxml2 + xmlsec1)
cryptography    # leitura do certificado .pfx
pyopenssl       # suporte adicional para mTLS
```

> `xmlsec` requer compilação nativa (`libxml2`, `libxmlsec1`) — pode exigir build layer extra no Dockerfile.

#### Tarefas de implementação

| Tarefa | Descrição | Dificuldade | Estimativa |
|---|---|---|---|
| **Obter certificado A1** | Comprar e instalar certificado digital da empresa emitente | Fácil | 1–2 dias (burocracia) |
| **Instalar dependências** | `xmlsec` + build deps no Dockerfile | Média | 1 dia |
| **Assinar XML com XMLDSig** | Função `assinar_rps(xml_element, pfx_bytes, pfx_senha)` | Alta | 3–5 dias |
| **Montar XML RPS** | Mapear campos do `CorpoNota` → estrutura RPS | Média | 2–3 dias |
| **Enviar via SOAP** | `EnvioRPS` usando `zeep`, tratar resposta/erros | Média | 2–3 dias |
| **Polling de autorização** | Task async: consulta a cada 30s até NFS-e retornar ou erro | Média | 2 dias |
| **Salvar XML + PDF retornado** | Armazenar no MinIO/R2 e vincular ao corpo de nota | Fácil | 1 dia |
| **Tratamento de erros SP** | Códigos E1, E2, E3... (veja tabela abaixo) | Média | 2–3 dias |
| **Ambiente de homologação** | Testar em `nfehomologacao.prefeitura.sp.gov.br` antes do prod | Média | 3–5 dias |
| **Frontend: botão "Emitir Nota"** | No detalhe do corpo de nota → emitir → polling → vinculado | Fácil | 1–2 dias |
| **Armazenar senha do .pfx** | No banco (`ConfiguracaoEmpresa`), nunca no código | Fácil | 0.5 dia |

**Total estimado: 6–8 semanas**
**Custo recorrente: R$ 0,00 por nota** (apenas custo anual do certificado ~R$ 300/ano)

#### Principais erros da Prefeitura de SP

| Código | Descrição | Como tratar |
|---|---|---|
| `E1` | CNPJ do prestador inválido | Verificar cadastro na prefeitura |
| `E2` | Inscrição municipal não encontrada | Cadastrar prestador em `nfe.prefeitura.sp.gov.br` |
| `E3` | Série/número RPS duplicado | Incrementar numeração |
| `E4` | Assinatura digital inválida | Verificar certificado e algoritmo XMLDSig |
| `E5` | Data de emissão inválida | Só aceita data do dia atual |
| `E6` | Código de serviço não encontrado | Verificar lista de serviços permitidos |
| `E79` | Certificado digital vencido | Renovar certificado A1 |
| `E89` | Tomador não encontrado | CNPJ do condomínio precisa estar correto |

---

## 5. Comparativo das opções

| Critério | Opção A (Intermediário) | Opção B (Direto SP) |
|---|---|---|
| **Tempo de implementação** | 2–3 semanas | 6–8 semanas |
| **Custo por nota** | R$ 0,50–R$ 2,00 | R$ 0,00 |
| **Custo anual (150 notas/mês)** | R$ 900–R$ 3.600/ano | ~R$ 300/ano (certificado) |
| **Suporte a outras cidades** | ✅ Automático | ❌ Não (apenas SP) |
| **Complexidade técnica** | Baixa | Alta |
| **Dependência externa** | Provider (risco de mudança de preço/API) | Prefeitura de SP (estável) |
| **Recomendação** | Lançar rápido / validar | Migrar após validação |

> **Recomendação:** Começar com a Opção A para entregar o fluxo integrado rapidamente (2–3 semanas). Migrar para a Opção B (integração direta SP) quando o volume de notas justificar o investimento de desenvolvimento — break-even em ~200 notas/mês dependendo do plano escolhido.

---

## 6. Fluxo completo futuro (com emissão integrada)

```
┌─ 1. AUVO ──────────────────────────────────────────────────┐
│  Sync automático (já existe)                               │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ 2. CORPO DE NOTA ─────────────────────────────────────────┐
│  Criação assistida pelo wizard (já existe)                 │
│  Auto-fill de todos os campos (já existe)                  │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ 3. EMISSÃO DA NFS-e (A IMPLEMENTAR) ──────────────────────┐
│  Botão "Emitir Nota" no detalhe do corpo de nota           │
│  Opção A: CMPort chama NFe.io (ou similar) via REST        │
│  Opção B: CMPort monta RPS → assina → envia SOAP para SP   │
│  Status: aguardando autorização (polling ~30s)             │
│  XML + PDF recebidos e salvos automaticamente              │
│  Corpo de nota → status XML_VINCULADO                      │
└────────────────────────────────────────────────────────────┘
                        ↓
┌─ 4 a 7. Boleto, Email, Pagamento ──────────────────────────┐
│  Já existem — sem mudança                                  │
└────────────────────────────────────────────────────────────┘
```

---

## 7. Outras melhorias identificadas

| Item | Descrição | Dificuldade | Prioridade |
|---|---|---|---|
| **Emissão NFS-e integrada** | Descrito acima — elimina passo manual | Alta | 🔴 Alta |
| **Cancelamento de NFS-e** | Cancelar nota emitida via `CancelaNFe` (SOAP SP) ou provider | Média | 🟡 Média |
| **Substituição de NFS-e** | Emitir nota corretiva vinculada à cancelada | Alta | 🟡 Média |
| **Scheduler automático de boletos** | Gerar todos os boletos do mês automaticamente (já existe base) | Média | 🟡 Média |
| **Portal do condomínio** | Página pública para o síndico ver boletos e histórico | Alta | 🟡 Média |
| **Dashboard financeiro** | Receita mensal, inadimplência, comparativo por período | Média | 🟡 Média |
| **App mobile** | Acesso rápido para síndicos e técnicos | Muito Alta | 🟢 Baixa |
| **Relatório de IR** | Consolidado anual por condomínio para declaração | Média | 🟢 Baixa |

---

## 8. Resumo executivo

| Etapa | Situação |
|---|---|
| Gestão de condomínios e contratos | ✅ Pronto |
| Sincronização com Auvo (OSs, orçamentos) | ✅ Pronto |
| Criação do corpo de nota (pré-nota) | ✅ Pronto |
| Geração de boleto (Banco Inter) | ✅ Pronto |
| Email com anexos | ✅ Pronto |
| Importação de XML de notas | ✅ Pronto |
| Vínculo automático nota ↔ corpo | ✅ Pronto |
| **Emissão automática da NFS-e** | ❌ Falta — passo manual hoje |
| Pagamento automático (webhook) | ⚠️ Parcial — scheduler de sync existe |

**O sistema cobre ~85% do fluxo.** O único elo faltante crítico é a emissão da NFS-e dentro do próprio sistema.

**Todas as 235 notas históricas são da Prefeitura de São Paulo (Nota Fiscal Paulistana)**, o que torna a integração direta totalmente viável no médio prazo. Para lançar rápido: Opção A (intermediário, 2–3 semanas). Para economizar no longo prazo: Opção B (direto SP, 6–8 semanas, R$0/nota).
