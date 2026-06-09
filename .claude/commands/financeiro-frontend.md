Você é especialista no frontend do módulo financeiro do CMPort (Fase 1).
Next.js 16 App Router + TypeScript + Tailwind v4. Zero erros TypeScript. Dark mode obrigatório.

## Arquivos principais
```
cmport-front/components/Sidebar.tsx              ← REFATORAR para grupos de menu
cmport-front/app/financeiro/page.tsx             ← Dashboard financeiro
cmport-front/app/financeiro/movimentacoes/page.tsx
cmport-front/app/financeiro/categorias/page.tsx
cmport-front/components/financeiro/DashboardFinanceiro.tsx
cmport-front/components/financeiro/TabelaMovimentacoes.tsx
cmport-front/components/financeiro/FormMovimentacaoManual.tsx
cmport-front/components/financeiro/FormCategorizar.tsx
cmport-front/components/financeiro/BotaoSincronizarInter.tsx
cmport-front/components/financeiro/SaldoInicialCard.tsx
```

---

## Refatoração do Sidebar.tsx — OBRIGATÓRIA antes das páginas

O Sidebar atual usa um array flat de `menuItems`. Precisa migrar para **grupos com itens filhos**.

### Estrutura atual (não tocar o HTML/CSS — só o array de dados):
```tsx
const menuItems = [...] // array flat
```

### Nova estrutura (grupos):
```tsx
type MenuItem = { name: string; icon: string; href: string; roles: string[] }
type MenuGroup = { label: string; items: MenuItem[] }

const menuGroups: MenuGroup[] = [
  {
    label: 'OPERACIONAL',
    items: [
      { name: 'Dashboard',         icon: '📊', href: '/',               roles: ['DEV','ADMIN','USUARIO'] },
      { name: 'Condomínios',       icon: '🏢', href: '/condominios',    roles: ['DEV','ADMIN','USUARIO'] },
      { name: 'Serviços',          icon: '🛠️', href: '/servicos',       roles: ['DEV','ADMIN','USUARIO'] },
      { name: 'Ordens de Serviço', icon: '📋', href: '/ordens-servico', roles: ['DEV','ADMIN','USUARIO'] },
      { name: 'Orçamentos',        icon: '📑', href: '/orcamentos',     roles: ['DEV','ADMIN','USUARIO'] },
    ],
  },
  {
    label: 'FISCAL',
    items: [
      { name: 'Notas Fiscais',  icon: '📄', href: '/notas',       roles: ['DEV','ADMIN','USUARIO'] },
      { name: 'Corpos de Nota', icon: '📝', href: '/corpos-nota', roles: ['DEV','ADMIN','USUARIO'] },
      { name: 'Boletos',        icon: '🏦', href: '/boletos',     roles: ['DEV','ADMIN','USUARIO'] },
      { name: 'Produtos',       icon: '📦', href: '/produtos',    roles: ['DEV','ADMIN','USUARIO'] },
    ],
  },
  {
    label: 'FINANCEIRO',
    items: [
      { name: 'Visão Geral',    icon: '💰', href: '/financeiro',                roles: ['DEV','ADMIN','USUARIO'] },
      { name: 'Movimentações',  icon: '↕️',  href: '/financeiro/movimentacoes', roles: ['DEV','ADMIN','USUARIO'] },
      { name: 'Categorias',     icon: '🏷️', href: '/financeiro/categorias',    roles: ['DEV','ADMIN','USUARIO'] },
    ],
  },
  {
    label: 'SISTEMA',
    items: [
      { name: 'Configurações', icon: '⚙️', href: '/configuracoes', roles: ['DEV','ADMIN'] },
      { name: 'Dev / Teste',   icon: '🔧', href: '/dev',           roles: ['DEV'] },
    ],
  },
]
```

### Renderização dos grupos no `<nav>`:
```tsx
<nav className="flex-1 p-3 lg:p-4 overflow-y-auto space-y-4">
  {menuGroups.map((group) => {
    const visibleItems = group.items.filter(item => !user || item.roles.includes(user.role))
    if (visibleItems.length === 0) return null
    return (
      <div key={group.label}>
        <p className="px-3 mb-1 text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-600 uppercase">
          {group.label}
        </p>
        <div className="space-y-0.5">
          {visibleItems.map((item) => { /* mesmo Link de antes */ })}
        </div>
      </div>
    )
  })}
</nav>
```

---

## Interfaces TypeScript

```typescript
// Espelha fin_categorias
interface CategoriaFinanceira {
  id: number
  nome: string
  grupo: 'RECEITA' | 'FORNECEDOR' | 'DESPESA'
  tipo: 'ENTRADA' | 'SAIDA'
  ativo: boolean
  ordem: number
}

// Espelha fin_movimentacoes
interface Movimentacao {
  id: number
  data: string                          // 'YYYY-MM-DD'
  descricao: string
  valor: number
  tipo: 'ENTRADA' | 'SAIDA'
  categoria_id: number | null
  categoria?: CategoriaFinanceira       // join opcional
  origem: 'BANCO' | 'MANUAL'
  status: 'PENDENTE' | 'VALIDADO'
  observacao: string | null
  criado_em: string
}

// Resposta do dashboard
interface DashboardFinanceiro {
  mes: number
  ano: number
  total_entradas: number
  total_saidas: number
  // Breakdown por grupo
  receitas: number      // grupo RECEITA
  fornecedores: number  // grupo FORNECEDOR
  despesas: number      // grupo DESPESA
  // Saldo
  saldo_inicial: number
  saldo_mes: number
  saldo_acumulado: number
}

// Espelha fin_saldo_inicial
interface SaldoInicial {
  ano: number
  mes: number
  valor: number
  observacao: string | null
}

// Payload para criar movimentação manual
interface FormMovimentacaoManual {
  data: string
  descricao: string
  valor: number
  tipo: 'ENTRADA' | 'SAIDA'
  categoria_id: number | null
  observacao?: string
}
```

---

## Chamadas de API

Base: `http://localhost:8000/api/v1`
Auth header: `Authorization: Bearer <token>` (token em localStorage)

```typescript
// Dashboard
GET  /financeiro/dashboard?mes=5&ano=2026

// Movimentações
GET  /financeiro/movimentacoes?mes=5&ano=2026&grupo=DESPESA&status=PENDENTE
POST /financeiro/movimentacoes          { data, descricao, valor, tipo, categoria_id, observacao }
PUT  /financeiro/movimentacoes/{id}     { categoria_id?, status?, descricao?, valor?, data? }
DELETE /financeiro/movimentacoes/{id}
POST /financeiro/movimentacoes/{id}/validar

// Saldo inicial
GET  /financeiro/saldo-inicial/2026/5
PUT  /financeiro/saldo-inicial/2026/5   { valor, observacao? }

// Sincronizar Inter
POST /financeiro/sincronizar-inter      { data_inicio, data_fim }
// Resposta: { novas: 12, duplicadas: 3, periodo: { inicio, fim } }

// Categorias
GET  /categorias-financeiras?grupo=FORNECEDOR&ativo=true
POST /categorias-financeiras            { nome, grupo, tipo, ordem? }
PUT  /categorias-financeiras/{id}       { nome?, ordem? }
DELETE /categorias-financeiras/{id}     // desativa, não deleta
```

---

## Componentes — Responsabilidades

### `DashboardFinanceiro.tsx`
- 4 cards topo: Receitas / Fornecedores / Despesas / Saldo
- Breakdown de receitas: Manutenção + Assistência + Outros
- Saldo inicial editável inline (chama `SaldoInicialCard`)
- Saldo do mês e saldo acumulado calculados

### `TabelaMovimentacoes.tsx`
Colunas: Data | Descrição | Grupo | Categoria | Valor | Tipo | Origem | Status | Ações
- Filtros: seletor mês/ano, grupo (tabs: Todas/Receitas/Fornecedores/Despesas), status (Todas/Pendentes/Validadas)
- Badge colorido por tipo: ENTRADA=verde, SAIDA=vermelho
- Badge por origem: BANCO=azul, MANUAL=cinza
- Badge por status: PENDENTE=amarelo, VALIDADO=verde
- Coluna Categoria: se null → mostrar `FormCategorizar` inline

### `FormMovimentacaoManual.tsx`
Modal com:
1. Seleção de tipo: ENTRADA ou SAÍDA (toggle visual)
2. Seleção de grupo (filtrado pelo tipo)
3. Seleção de categoria (filtrada pelo grupo)
4. Campos: valor (numérico), data (date picker), descrição (text), observação (textarea)

### `FormCategorizar.tsx`
- Select inline na linha da tabela
- Carrega categorias filtradas pelo `tipo` da movimentação
- Ao selecionar: PUT /movimentacoes/{id} com categoria_id
- Sem modal — salva direto na linha

### `BotaoSincronizarInter.tsx`
```tsx
// Estado: idle | loading | sucesso | erro
// Ao clicar: POST /financeiro/sincronizar-inter com período do mês atual
// Feedback: "12 novas transações importadas, 3 já existiam"
// Erro: "Verifique se o scope extrato.read está ativo no portal Inter"
```

### `SaldoInicialCard.tsx`
- Exibe valor atual como texto formatado
- Clique → input numérico inline
- Enter ou blur → PUT /financeiro/saldo-inicial/{ano}/{mes}
- Validação: valor >= 0

---

## Página `/financeiro` (Dashboard)
```
Layout:
[BotaoSincronizarInter]  [Seletor mês/ano]

[Receitas R$X]  [Fornecedores R$X]  [Despesas R$X]  [Saldo R$X]

Detalhamento Receitas        Saldo do Período
├─ Manutenção   R$X          Saldo inicial:  [editável]
├─ Assistência  R$X          Entradas:       R$X
└─ Outros       R$X          Saídas:         R$X (−)
                             ─────────────────────
Fornecedores    R$X          Saldo do mês:   R$X
Despesas        R$X          Saldo acumulado: R$X
```

## Página `/financeiro/movimentacoes`
```
[Seletor mês/ano] [Tabs: Todas | Receitas | Fornecedores | Despesas]
[Status: Todas | Pendentes | Validadas] [+ Nova Movimentação]

[TabelaMovimentacoes]
```

## Página `/financeiro/categorias`
```
[Tabs: Receitas | Fornecedores | Despesas]
[+ Nova Categoria]

Lista por grupo com: nome, ordem, ativo toggle, editar nome/ordem
```

---

## Formatação de valores
```typescript
const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Data exibição: 'DD/MM/YYYY'
// Data API: 'YYYY-MM-DD'
```

---

## Leia antes de agir
- `cmport-front/components/Sidebar.tsx` — antes de qualquer refatoração de menu
- `cmport-front/app/layout.tsx` — estrutura global
- `cmport-front/contexts/AuthContext.tsx` — acesso a `user.role`
