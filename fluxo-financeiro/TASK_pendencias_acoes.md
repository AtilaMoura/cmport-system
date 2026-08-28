# TAREFA: botões de ação no painel de Pendências (follow-up A1)

## Contexto
A tela `cmport-front/app/fluxo-financeiro/pendencias/page.tsx` já tem accordion
(clicar na linha expande um painel de detalhe). Falta: **chip da empresa na linha**
e **botões de ação no painel expandido**.

O **backend já está pronto** (não mexer nele) — `PendenciaLinha` agora traz:
`nota_id`, `servico_id`, `cnpj_emitente`, `empresa` ("CMPORT" | "TEC" | null).
O tipo TS em `cmport-front/lib/fluxoFinanceiro.ts` já foi atualizado.
Endpoint novo já existe: `PATCH /boletos/{id}` com body `{valor_nominal?, data_vencimento?}`
(só funciona se o boleto não estiver pago — o backend bloqueia e devolve erro 400).

## Só mexer em: `cmport-front/app/fluxo-financeiro/pendencias/page.tsx`
Não tocar em backend, não tocar em outros arquivos.

## Mudança 1 — chip da empresa na linha (colapsada)
No cabeçalho de cada linha, junto dos chips de tipo e situação (por volta da linha
234-244, o bloco `flex items-center gap-2 flex-wrap`), adicionar, **quando `l.empresa`**:

```tsx
{l.empresa && (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
    l.empresa === 'TEC'
      ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400'
      : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400'
  }`}>{l.empresa}</span>
)}
```

## Mudança 2 — rodapé de ações no painel expandido
O painel expandido hoje é um `<div class="px-4 pb-4 pt-1 ... grid ...">` só com campos
de leitura (linhas ~284-303). **Depois desse grid, ainda dentro do bloco
`expandidos.has(...)`**, adicionar um rodapé de botões:

```tsx
<div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2">
  {l.origem === 'BOLETO' && l.situacao !== 'PAGO' && (
    <button
      onClick={(e) => { e.stopPropagation(); abrirModalEdicao(l); }}
      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600"
    >
      ✎ Editar
    </button>
  )}
  {l.situacao !== 'PAGO' && (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (l.origem === 'RECIBO') marcarPago(l.origem_id); else abrirModalPagamento(l);
      }}
      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-green-600 text-white hover:bg-green-700"
    >
      ✓ Registrar pagamento
    </button>
  )}
  {l.nota_id && (
    <a
      href={`/notas/${l.nota_id}`} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      Ver nota ↗
    </a>
  )}
  {l.servico_id && (
    <a
      href={`/servicos/${l.servico_id}`} target="_blank" rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      Ver serviço ↗
    </a>
  )}
</div>
```

## Mudança 3 — modal de edição do boleto
Novo state no componente `PendenciasContent` (junto dos outros `useState`):

```tsx
const [modalEdicao, setModalEdicao] = useState<PendenciaLinha | null>(null);
const [edValor, setEdValor] = useState('');
const [edVencimento, setEdVencimento] = useState('');
const [salvandoEdicao, setSalvandoEdicao] = useState(false);
```

Funções (junto de `abrirModalPagamento` / `confirmarPagamento`):

```tsx
const abrirModalEdicao = (linha: PendenciaLinha) => {
  setModalEdicao(linha);
  setEdValor(String(linha.valor));
  setEdVencimento(linha.data_vencimento.slice(0, 10));
};

const confirmarEdicao = async () => {
  if (!modalEdicao) return;
  setSalvandoEdicao(true);
  try {
    await api.patch(`/boletos/${modalEdicao.origem_id}`, {
      valor_nominal: Number(edValor),
      data_vencimento: edVencimento,
    });
    setModalEdicao(null);
    await carregar();
  } catch {
    alert('Erro ao salvar. Boleto pago não pode ser editado.');
  } finally {
    setSalvandoEdicao(false);
  }
};
```

Markup do modal — colar logo ANTES do fechamento do modal de pagamento existente
(ou seja, como irmão do bloco `{modalPagamento && (...)}`, dentro do return, antes do
`</div>` final do componente):

```tsx
{modalEdicao && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalEdicao(null)}>
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
      <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">Editar boleto</h2>
      <p className="text-xs text-slate-500 mb-4 font-mono">{modalEdicao.condominio_nome} · NF {modalEdicao.numero_nota}</p>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor</label>
          <input type="number" step="0.01" min="0" value={edValor} onChange={e => setEdValor(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Vencimento</label>
          <input type="date" value={edVencimento} onChange={e => setEdVencimento(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm" />
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <button onClick={() => setModalEdicao(null)}
          className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">Cancelar</button>
        <button onClick={confirmarEdicao} disabled={salvandoEdicao}
          className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50">
          {salvandoEdicao ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  </div>
)}
```

## Regras do projeto
- Comentários em português.
- Não criar arquivo novo, não mexer em backend.
- Reusar as funções que já existem (`abrirModalPagamento`, `confirmarPagamento`,
  `marcarPago`, `carregar`) — não duplicar.
- `api` já está importado (`import { api } from '@/lib/api'`) e tem `.patch`.

## Critério de pronto
```
cd cmport-front && npm run lint && npx tsc --noEmit
```
Zero erro. E abrir a tela: linha mostra chip CMPORT/TEC; expandir mostra os 4 botões
conforme as condições; "Editar" abre o modal, salva e a lista recarrega.
