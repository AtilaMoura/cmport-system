# CMPort — Sistema de Gestão
## Apresentação da Primeira Entrega

---

## GUIA DE DESIGN

**Paleta de Cores CMPort**

| Uso | Hex |
|-----|-----|
| Fundo escuro (capa, slides de destaque) | `#1A2E5A` |
| Azul principal — títulos | `#1B5FBF` |
| Azul médio — ícones, bordas | `#2E7DD4` |
| Dourado — separadores, destaques | `#C8A95E` |
| Fundo claro dos cards | `#F0F4FA` |
| Texto padrão | `#1A1A2E` |
| Texto sobre fundo escuro | `#FFFFFF` |

**Tipografia:** Montserrat Bold (títulos) · Open Sans (corpo)
**Logo:** canto superior direito em todos os slides · arquivo: `logo_cmport.png`

---

## TOTAL: 9 SLIDES — 15 MINUTOS

---

## SLIDE 1 — CAPA
*Fundo: `#1A2E5A` · Texto: branco · Logo centralizado*
*Tempo: 30 segundos*

---

# CMPort
### Sistema de Gestão — Primeira Entrega

*Maio de 2026*

---

**Fala de abertura:**
> "Hoje vou mostrar tudo que o sistema já faz por vocês — funcionando agora, não no papel."

---

## SLIDE 2 — O PROBLEMA QUE RESOLVEMOS
*Fundo: branco · Título: `#1B5FBF`*
*Tempo: 1 min 30 seg*

---

### Antes do CMPort:

| Problema real | O que custava |
|---|---|
| Notas fiscais em planilha Excel | Horas de conferência manual toda semana |
| Impostos conferidos à mão | Risco constante de pagar errado |
| Boleto calculado e emitido manualmente | Atraso, erro de valor, esquecimento |
| E-mail enviado à mão com anexos | Tempo perdido anexando arquivo por arquivo |
| Termo de garantia preenchido no Word | Retrabalho a cada serviço |
| Auvo e financeiro separados | Digitação dupla de informação |
| Sem visão clara do financeiro | Decisões baseadas em suposição |

---

**Fala:**
> "Cada um desses problemas acontece toda semana. O sistema resolve todos eles."

---

## SLIDE 3 — O QUE O SISTEMA FAZ HOJE
*Fundo: `#1A2E5A` · Texto: branco*
*Tempo: 1 min 30 seg*

---

### Tudo isso já está funcionando:

```
📁  Cadastro completo de condomínios e clientes
📄  Notas fiscais automáticas — leitura, classificação e validação fiscal
💰  Boletos com Banco Inter — geração, parcelamento e acompanhamento
📧  E-mail de cobrança com boleto + nota anexados em 1 clique
📋  Termo de garantia gerado em PDF automaticamente
🔗  Integração com Auvo — campo e financeiro conectados
📊  Dashboard com gráficos e comparativos financeiros em tempo real
🔐  Controle de acesso por usuário com senha individual
```

---

**Fala:**
> "São 8 módulos entregues. Cada um eliminando trabalho manual."

---

## SLIDE 4 — NOTAS FISCAIS E CONDOMÍNIOS
*Fundo: branco*
*Tempo: 2 minutos*

---

### Cadastro de clientes + Notas fiscais automáticas

**Gestão de condomínios:**
- Ficha completa: CNPJ, endereço, contatos com marcação do principal
- Dados importados automaticamente do Auvo — sem digitação

**Como funciona com notas fiscais:**
1. Você faz upload do XML (ou ZIP com várias notas)
2. O sistema lê e classifica: **Manutenção · Assistência · Outros**
3. Identifica o status: Autorizada ou Cancelada
4. Vincula automaticamente ao condomínio correto
5. Compara os impostos da nota com a configuração do sistema
6. Se houver divergência → **alerta aparece na tela automaticamente**

**Resultado:**
> Você não abre mais a nota para conferir valor, tipo ou imposto.
> O sistema faz isso em segundos.

---

## SLIDE 5 — BOLETOS E E-MAIL DE COBRANÇA
*Fundo: branco*
*Tempo: 2 minutos*

---

### Do serviço ao pagamento — sem trabalho manual

**Boletos com Banco Inter:**
- Gera boleto com valor líquido já descontado dos impostos corretos
- Suporta parcelamento — cada parcela com seu boleto e data
- Sincroniza pagamentos automaticamente todos os dias das 8h às 19h
- Cancela e acompanha status em tempo real: Em aberto · Pago · Vencido

**E-mail de cobrança com 1 clique:**
- Cliente recebe e-mail com **boleto + nota fiscal anexados**
- Assinatura visual da CMPort no rodapé
- Você pré-visualiza o e-mail antes de enviar e edita o texto se quiser
- Escolhe qual conta de e-mail usar (configurável no sistema)

**Resultado:**
> O cliente paga → o sistema detecta e atualiza o status sozinho.
> Ninguém precisa checar manualmente.

---

## SLIDE 6 — TERMOS DE GARANTIA E INTEGRAÇÃO AUVO
*Fundo: branco*
*Tempo: 2 minutos*

---

### Documentos prontos + campo conectado ao financeiro

**Termo de Garantia em PDF:**
1. Sistema já tem os dados do serviço: condomínio, data, OS
2. Você seleciona os produtos e quantidades (importados do Auvo)
3. Define o prazo de garantia em meses
4. Clica **"Gerar PDF"** — documento pronto para assinar e entregar

**Integração com Auvo:**
- OS fechada no campo → aparece no sistema financeiro automaticamente
- Orçamento aprovado no Auvo → disponível para faturar e gerar o termo
- Catálogo de produtos sincronizado para montar o termo
- Clientes e condomínios atualizados direto do Auvo

**Resultado:**
> O técnico fecha a OS. O sistema já recebe. Sem digitação dupla.
> O termo sai pronto em segundos — sem Word, sem copiar e colar.

---

## SLIDE 7 — DASHBOARD COM GRÁFICOS E COMPARATIVOS
*Fundo: `#F0F4FA`*
*Tempo: 2 minutos*

---

### Visão completa do negócio — em tempo real

**O Dashboard já entrega hoje:**

| O que aparece | Como ajuda |
|---|---|
| Faturamento emitido vs recebido vs pendente | Sabe exatamente o que entrou e o que falta |
| Comparativo mês a mês (gráfico de barras) | Vê crescimento ou queda sem planilha |
| Faturamento: **este ano vs ano passado** (gráfico de linha) | Comparativo histórico instantâneo |
| Receita líquida estimada com ISS configurável | Sabe quanto sobra de verdade |
| Top 5 condomínios por faturamento | Identifica os maiores clientes |
| Distribuição de serviços por tipo | Vê o que mais consome a equipe |
| Status de todos os boletos (pagos, vencidos, em aberto) | Inadimplência na tela sem esforço |

**Filtros de período:** Este Mês · Trimestre · 6 Meses · Este Ano · Ano Passado

**Resultado:**
> Em vez de abrir 5 planilhas para entender o mês,
> você vê tudo numa tela — e exporta em Excel se precisar.

---

## SLIDE 8 — ANTES X DEPOIS
*Fundo: `#1B5FBF` · Texto: branco*
*Tempo: 1 min 30 seg*

---

### O que mudou na prática

| Antes | Com o CMPort |
|---|---|
| Conferência de nota à mão | Upload → sistema classifica e valida impostos |
| Boleto calculado manualmente | 1 clique → valor correto, emitido no banco |
| E-mail com anexo enviado à mão | 1 clique → boleto + nota enviados com assinatura |
| Termo preenchido no Word | PDF gerado com dados do serviço em segundos |
| Auvo e financeiro separados | Integrados — OS fecha no campo, aparece aqui |
| Planilhas para entender o mês | Dashboard com gráficos e comparativos prontos |
| Sem histórico de exclusões | Tudo registrado — nada some sem rastro |

---

**Fala:**
> "Cada linha dessa tabela representa tempo economizado toda semana."

---

## SLIDE 9 — ENCERRAMENTO
*Fundo: `#1A2E5A` · Texto: branco · Logo centralizado*
*Tempo: 1 minuto*

---

### O que vem a seguir

O sistema já é sólido. A próxima fase expande o que está funcionando:

- Portal do condomínio — síndico vê histórico e cobranças
- Controle de notas recebidas de fornecedores
- Novas integrações conforme a operação crescer

---

> **O que entregamos hoje já funciona e já economiza tempo.**
> **O próximo passo é expandir o que está sólido.**

---
---

## GUIA DO APRESENTADOR

**Frase de abertura:**
> "Em 15 minutos vou mostrar tudo que o sistema já faz por vocês — funcionando agora, não no papel."

**Palavras-chave:**
automatiza · elimina · 1 clique · sem digitação · economiza · centraliza · em tempo real

**Nunca dizer:**
backend · API · banco de dados · servidor · deploy · código · SQLAlchemy

**Tempo por slide:**

| Slide | Tema | Tempo |
|---|---|---|
| 1 | Capa | 0:30 |
| 2 | O Problema | 1:30 |
| 3 | Visão Geral | 1:30 |
| 4 | Notas + Condomínios | 2:00 |
| 5 | Boletos + E-mail | 2:00 |
| 6 | Termos + Auvo | 2:00 |
| 7 | Dashboard | 2:00 |
| 8 | Antes x Depois | 1:30 |
| 9 | Encerramento | 1:00 |
| **Total** | | **~14 min** |

**Demo ao vivo após apresentação (+5 min opcional):**
1. Login → Dashboard (mostrar gráficos e filtros de período)
2. Notas → importar um XML ao vivo
3. Boletos → mostrar status e histórico de pagamento
4. Serviços → abrir um com termo de garantia já gerado
