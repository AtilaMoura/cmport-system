Você é especialista no frontend do CMPort (Next.js 16 App Router + TypeScript + Tailwind v4).

## Regras obrigatórias
- Zero erros TypeScript: `npx tsc --noEmit` deve passar limpo
- Usar `dark:` classes do Tailwind para dark mode
- Axios para chamadas à API (base: `http://localhost:8000/api/v1/`)
- Componentes reutilizáveis vão em `cmport-front/components/`
- Sempre rodar `npm run lint` após mudanças

---

## Estrutura de páginas (App Router)

```
cmport-front/app/
  page.tsx                  Dashboard (home)
  layout.tsx                Root layout + Sidebar + ThemeToggle
  login/
    page.tsx                Login: email+senha → JWT → localStorage
  condominios/
    page.tsx                Lista de condomínios
    novo/page.tsx           Criar condomínio
    [id]/page.tsx           Detalhe
    [id]/editar/page.tsx    Editar
  servicos/
    page.tsx                Lista + "Gerar em Massa" (bulk boleto)
    [id]/page.tsx           Detalhe + Cobranças por Parcela + 2-step boleto modal + email sender
  notas/
    page.tsx                Lista + modal boleto single-nota
    [id]/page.tsx           Detalhe nota fiscal
    importar/page.tsx       Import XML/ZIP
  boletos/
    page.tsx                Lista e gestão de boletos
  configuracoes/
    page.tsx                Contas de email + empresa config + preview/teste
  dev/
    page.tsx                Utilitários de desenvolvimento
```

**Componentes em `cmport-front/components/`:**
`Sidebar`, `ThemeToggle`, `CondominiosList`, `FormEditarCondominio`, `FloatingActionButton`

---

## Interfaces principais

```typescript
// 2-step boleto modal — valores editáveis por parcela
interface ParcelaItem {
  numero: number
  valor: number
  dataVencimento: string
  situacaoBoleto: string
}

// "Gerar em Massa" modal em servicos/page.tsx
interface MassaItem { /* ver arquivo */ }

// Espelha ConfigImpostosResponse do backend
interface ConfigImpostos {
  pct_pis: number
  pct_cofins: number
  pct_inss: number
  pct_csll: number
  valor_bruto: number
  valor_liquido: number
  numero_os: string
  aplicar_juros_default: boolean
  alerta_impostos: number
  divergencia_impostos: Record<string, unknown> | null
}
```

---

## Helpers

```typescript
// Aritmética de datas para offset de parcelas no 2-step modal
addDays(dateStr: string, days: number): string
```

---

## Auth

Token JWT em `localStorage`
Header: `Authorization: Bearer <token>`
Redireciona para `/login` se receber 401

---

## Leia antes de agir
`cmport-front/app/layout.tsx` — estrutura global e providers
