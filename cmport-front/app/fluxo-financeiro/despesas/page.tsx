"use client"

import { useState, useEffect, useCallback, Suspense } from 'react';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import { DetalheMovimentacoes } from '@/components/fluxo-financeiro/DetalheMovimentacoes';
import { type Movimentacao, type CategoriaFinanceira } from '@/lib/fluxoFinanceiro';

interface BancoOpcao {
  id: number;
  nome: string;
  razao_social_titular: string | null;
  ativo: boolean;
}

interface LinhaParcela {
  numero_parcela: number;
  valor: string;
  data_vencimento: string;
}

const CNPJ_OPCOES = [
  { label: 'CMPORT', value: '22761557000188' },
  { label: 'CMPORT TEC', value: '65756913000188' },
];

const TIPOS_PAGAMENTO = [
  { v: 'UNICO', l: 'Pagamento único' },
  { v: 'PARCELADO', l: 'Parcelado' },
  { v: 'RECORRENTE', l: 'Recorrente' },
];

const NOVA_DESPESA_VAZIA = {
  descricao: '',
  categoria_id: '',
  cnpj: CNPJ_OPCOES[0].value,
  banco_previsto_id: '',
  tipo_pagamento: 'UNICO',
  observacao: '',
  // UNICO
  valor_total: '',
  data_primeira_parcela: '',
  // PARCELADO — usados só pra sugerir a tabela editável abaixo
  valor_total_sugerido: '',
  numero_parcelas_sugerido: '2',
  data_primeira_parcela_parcelado: '',
  // RECORRENTE
  valor_recorrente: '',
  dia_vencimento: '10',
  data_inicio: '',
};

function DespesasContent() {
  const { ano, mes, setAno, setMes } = useFiltrosFluxo();
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);

  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [bancos, setBancos] = useState<BancoOpcao[]>([]);
  const [modalNova, setModalNova] = useState(false);
  const [novaDespesa, setNovaDespesa] = useState(NOVA_DESPESA_VAZIA);
  const [parcelasTabela, setParcelasTabela] = useState<LinhaParcela[]>([]);
  const [salvandoDespesa, setSalvandoDespesa] = useState(false);

  const [novaCategoriaAberto, setNovaCategoriaAberto] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
  const [criandoCategoria, setCriandoCategoria] = useState(false);

  const [gerenciarCategoriasAberto, setGerenciarCategoriasAberto] = useState(false);
  const [categoriaEditandoId, setCategoriaEditandoId] = useState<number | null>(null);
  const [categoriaEditandoNome, setCategoriaEditandoNome] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/financeiro/movimentacoes', { params: { ano, mes, tipo: 'SAIDA', grupo: 'DESPESA' } });
      // Decimal do backend serializa como string
      setMovs(r.data.map((m: Movimentacao) => ({ ...m, valor: Number(m.valor) })));
    } catch {
      setMovs([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes]);

  const carregarCategorias = useCallback(async () => {
    try {
      const { data } = await api.get('/categorias-financeiras', { params: { grupo: 'DESPESA', ativo: true } });
      setCategorias(data);
    } catch {
      setCategorias([]);
    }
  }, []);

  const carregarBancos = useCallback(async () => {
    try {
      const { data } = await api.get('/configuracoes/bancos');
      setBancos(data.filter((b: BancoOpcao) => b.ativo));
    } catch {
      setBancos([]);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { carregarCategorias(); }, [carregarCategorias]);
  useEffect(() => { carregarBancos(); }, [carregarBancos]);

  const abrirNova = () => {
    setNovaDespesa({ ...NOVA_DESPESA_VAZIA });
    setParcelasTabela([]);
    setNovaCategoriaAberto(false);
    setNovaCategoriaNome('');
    setGerenciarCategoriasAberto(false);
    setCategoriaEditandoId(null);
    setModalNova(true);
  };

  const trocarTipoPagamento = (tipo: string) => {
    setNovaDespesa(p => ({ ...p, tipo_pagamento: tipo }));
    setParcelasTabela([]);
  };

  const gerarTabelaParcelas = () => {
    const total = Number(novaDespesa.valor_total_sugerido);
    const n = Number(novaDespesa.numero_parcelas_sugerido);
    const dataBase = novaDespesa.data_primeira_parcela_parcelado;
    if (!total || total <= 0 || !n || n < 2 || !dataBase) {
      alert('Preencha valor total, nº de parcelas (mín. 2) e data da 1ª parcela pra gerar a tabela.');
      return;
    }
    const valorParcela = Math.round((total / n) * 100) / 100;
    let soma = 0;
    const linhas: LinhaParcela[] = [];
    for (let i = 1; i <= n; i++) {
      const d = new Date(dataBase + 'T00:00:00');
      d.setDate(d.getDate() + 30 * (i - 1));
      const valor = i === n ? Math.round((total - soma) * 100) / 100 : valorParcela;
      if (i < n) soma += valor;
      linhas.push({ numero_parcela: i, valor: valor.toFixed(2), data_vencimento: d.toISOString().slice(0, 10) });
    }
    setParcelasTabela(linhas);
  };

  const editarLinhaParcela = (index: number, campo: 'valor' | 'data_vencimento', valor: string) => {
    setParcelasTabela(prev => prev.map((p, i) => i === index ? { ...p, [campo]: valor } : p));
  };

  const replicarValorParaTodas = () => {
    if (parcelasTabela.length === 0) return;
    const v = parcelasTabela[0].valor;
    setParcelasTabela(prev => prev.map(p => ({ ...p, valor: v })));
  };

  const totalParcelasTabela = parcelasTabela.reduce((s, p) => s + (Number(p.valor) || 0), 0);

  const salvarDespesa = async () => {
    if (!novaDespesa.descricao || !novaDespesa.categoria_id) {
      alert('Preencha descrição e categoria.'); return;
    }

    const payload: Record<string, unknown> = {
      descricao: novaDespesa.descricao,
      categoria_id: Number(novaDespesa.categoria_id),
      cnpj: novaDespesa.cnpj,
      banco_previsto_id: novaDespesa.banco_previsto_id ? Number(novaDespesa.banco_previsto_id) : null,
      tipo_pagamento: novaDespesa.tipo_pagamento,
      observacao: novaDespesa.observacao || null,
    };

    if (novaDespesa.tipo_pagamento === 'UNICO') {
      if (!novaDespesa.valor_total || !novaDespesa.data_primeira_parcela) {
        alert('Preencha valor e data do vencimento.'); return;
      }
      payload.valor_total = Number(novaDespesa.valor_total);
      payload.data_primeira_parcela = novaDespesa.data_primeira_parcela;
    } else if (novaDespesa.tipo_pagamento === 'PARCELADO') {
      if (parcelasTabela.length < 2) {
        alert('Gere a tabela de parcelas (mínimo 2 parcelas) antes de salvar.'); return;
      }
      if (parcelasTabela.some(p => !p.valor || Number(p.valor) <= 0 || !p.data_vencimento)) {
        alert('Preencha valor e data em todas as parcelas.'); return;
      }
      payload.parcelas = parcelasTabela.map(p => ({
        numero_parcela: p.numero_parcela,
        valor: Number(p.valor),
        data_vencimento: p.data_vencimento,
      }));
    } else {
      // RECORRENTE
      if (!novaDespesa.valor_recorrente || !novaDespesa.dia_vencimento || !novaDespesa.data_inicio) {
        alert('Preencha valor mensal, dia de vencimento e data de início.'); return;
      }
      const dia = Number(novaDespesa.dia_vencimento);
      if (dia < 1 || dia > 28) {
        alert('Dia de vencimento deve ser entre 1 e 28.'); return;
      }
      payload.valor_recorrente = Number(novaDespesa.valor_recorrente);
      payload.dia_vencimento = dia;
      payload.data_inicio = novaDespesa.data_inicio;
    }

    setSalvandoDespesa(true);
    try {
      await api.post('/despesas', payload);
      setModalNova(false);
      await carregar();
    } catch {
      alert('Erro ao salvar a despesa.');
    } finally {
      setSalvandoDespesa(false);
    }
  };

  const criarCategoriaInline = async () => {
    if (!novaCategoriaNome.trim()) { alert('Preencha o nome da categoria.'); return; }
    setCriandoCategoria(true);
    try {
      const { data } = await api.post('/categorias-financeiras', { nome: novaCategoriaNome.trim(), grupo: 'DESPESA' });
      setCategorias(prev => [...prev, data]);
      setNovaDespesa(p => ({ ...p, categoria_id: String(data.id) }));
      setNovaCategoriaAberto(false);
      setNovaCategoriaNome('');
    } catch {
      alert('Erro ao criar categoria (talvez já exista uma com esse nome).');
    } finally {
      setCriandoCategoria(false);
    }
  };

  const iniciarEdicaoCategoria = (cat: CategoriaFinanceira) => {
    setCategoriaEditandoId(cat.id);
    setCategoriaEditandoNome(cat.nome);
  };

  const salvarEdicaoCategoria = async () => {
    if (categoriaEditandoId === null || !categoriaEditandoNome.trim()) return;
    try {
      const { data } = await api.put(`/categorias-financeiras/${categoriaEditandoId}`, { nome: categoriaEditandoNome.trim() });
      setCategorias(prev => prev.map(c => c.id === data.id ? data : c));
      setCategoriaEditandoId(null);
    } catch {
      alert('Erro ao editar categoria.');
    }
  };

  const desativarCategoria = async (id: number) => {
    if (!confirm('Desativar essa categoria? Ela deixa de aparecer nas opções (despesas já lançadas continuam intactas).')) return;
    try {
      await api.delete(`/categorias-financeiras/${id}`);
      setCategorias(prev => prev.filter(c => c.id !== id));
      if (novaDespesa.categoria_id === String(id)) setNovaDespesa(p => ({ ...p, categoria_id: '' }));
    } catch {
      alert('Erro ao desativar categoria.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Despesas Escritório</h1>
          <p className="text-xs text-slate-500 mt-0.5">Salários, aluguel, tarifas bancárias, combustível e demais despesas fixas</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} onAnoChange={setAno} onMesChange={setMes} acoesExtra={
          <button onClick={abrirNova}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all whitespace-nowrap">
            + Nova Despesa
          </button>
        } />
        {loading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : (
          <DetalheMovimentacoes movs={movs} cor="text-red-700 dark:text-red-400" onAtualizado={carregar} />
        )}
      </div>

      {/* ── Modal Nova Despesa ── */}
      {modalNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalNova(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-5">+ Nova Despesa</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Descrição</label>
                <input type="text" value={novaDespesa.descricao} onChange={e => setNovaDespesa(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Ex: Aluguel do escritório"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Categoria</label>
                  <select value={novaDespesa.categoria_id} onChange={e => setNovaDespesa(p => ({ ...p, categoria_id: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm">
                    <option value="">— Selecione —</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <div className="flex gap-3 mt-1.5">
                    <button type="button" onClick={() => setNovaCategoriaAberto(s => !s)}
                      className="text-xs font-bold text-red-600 dark:text-red-400 underline decoration-dotted underline-offset-2">
                      + Nova categoria
                    </button>
                    <button type="button" onClick={() => setGerenciarCategoriasAberto(s => !s)}
                      className="text-xs font-bold text-slate-500 dark:text-slate-400 underline decoration-dotted underline-offset-2">
                      Gerenciar categorias
                    </button>
                  </div>

                  {novaCategoriaAberto && (
                    <div className="mt-2 border-2 border-dashed border-red-300 dark:border-red-500/40 rounded-xl p-3 space-y-2">
                      <input type="text" autoFocus value={novaCategoriaNome} onChange={e => setNovaCategoriaNome(e.target.value)}
                        placeholder="Nome da categoria"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setNovaCategoriaAberto(false); setNovaCategoriaNome(''); }}
                          className="flex-1 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-xs">
                          Cancelar
                        </button>
                        <button type="button" onClick={criarCategoriaInline} disabled={criandoCategoria || !novaCategoriaNome.trim()}
                          className="flex-1 py-1.5 bg-red-600 text-white rounded-lg font-bold text-xs hover:brightness-110 transition-all disabled:opacity-50">
                          {criandoCategoria ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  )}

                  {gerenciarCategoriasAberto && (
                    <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                      {categorias.map(c => (
                        <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                          {categoriaEditandoId === c.id ? (
                            <>
                              <input type="text" autoFocus value={categoriaEditandoNome} onChange={e => setCategoriaEditandoNome(e.target.value)}
                                className="flex-1 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs" />
                              <button type="button" onClick={salvarEdicaoCategoria} className="text-xs font-bold text-red-600 dark:text-red-400">✓</button>
                              <button type="button" onClick={() => setCategoriaEditandoId(null)} className="text-xs font-bold text-slate-400">×</button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-xs text-slate-700 dark:text-slate-300">{c.nome}</span>
                              <button type="button" onClick={() => iniciarEdicaoCategoria(c)} className="text-xs font-bold text-slate-400 hover:text-red-600 dark:hover:text-red-400">editar</button>
                              <button type="button" onClick={() => desativarCategoria(c.id)} className="text-xs font-bold text-slate-400 hover:text-red-600 dark:hover:text-red-400">desativar</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">CNPJ</label>
                  <select value={novaDespesa.cnpj} onChange={e => setNovaDespesa(p => ({ ...p, cnpj: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm">
                    {CNPJ_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Banco previsto (opcional)</label>
                <select value={novaDespesa.banco_previsto_id} onChange={e => setNovaDespesa(p => ({ ...p, banco_previsto_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm">
                  <option value="">— Nenhum —</option>
                  {bancos.map(b => <option key={b.id} value={b.id}>{b.nome}{b.razao_social_titular ? ` (${b.razao_social_titular})` : ''}</option>)}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Só uma sugestão — o banco continua editável na hora de marcar cada parcela como paga.</p>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tipo de pagamento</label>
                <div className="flex gap-2">
                  {TIPOS_PAGAMENTO.map(op => (
                    <button key={op.v} type="button"
                      onClick={() => trocarTipoPagamento(op.v)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                        novaDespesa.tipo_pagamento === op.v
                          ? 'bg-red-900 text-white dark:bg-red-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}>
                      {op.l}
                    </button>
                  ))}
                </div>
              </div>

              {novaDespesa.tipo_pagamento === 'UNICO' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor</label>
                    <input type="number" step="0.01" min="0" value={novaDespesa.valor_total}
                      onChange={e => setNovaDespesa(p => ({ ...p, valor_total: e.target.value }))}
                      placeholder="0,00"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Vencimento</label>
                    <input type="date" value={novaDespesa.data_primeira_parcela}
                      onChange={e => setNovaDespesa(p => ({ ...p, data_primeira_parcela: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                  </div>
                </div>
              )}

              {novaDespesa.tipo_pagamento === 'PARCELADO' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor total (sugestão)</label>
                      <input type="number" step="0.01" min="0" value={novaDespesa.valor_total_sugerido}
                        onChange={e => setNovaDespesa(p => ({ ...p, valor_total_sugerido: e.target.value }))}
                        placeholder="0,00"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nº de parcelas</label>
                      <input type="number" min="2" step="1" value={novaDespesa.numero_parcelas_sugerido}
                        onChange={e => setNovaDespesa(p => ({ ...p, numero_parcelas_sugerido: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Vencimento da 1ª parcela</label>
                      <input type="date" value={novaDespesa.data_primeira_parcela_parcelado}
                        onChange={e => setNovaDespesa(p => ({ ...p, data_primeira_parcela_parcelado: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                    </div>
                  </div>

                  <button type="button" onClick={gerarTabelaParcelas}
                    className="w-full py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                    {parcelasTabela.length > 0 ? '↻ Atualizar tabela de parcelas' : 'Gerar tabela de parcelas'}
                  </button>

                  {parcelasTabela.length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800">
                        <span className="text-xs font-bold text-slate-500 uppercase">Parcelas (editável)</span>
                        <button type="button" onClick={replicarValorParaTodas}
                          className="text-xs font-bold text-red-600 dark:text-red-400 underline decoration-dotted underline-offset-2">
                          Replicar valor da 1ª pra todas
                        </button>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                        {parcelasTabela.map((p, i) => (
                          <div key={p.numero_parcela} className="flex items-center gap-2 px-3 py-2">
                            <span className="text-xs font-bold text-slate-400 w-14 shrink-0">{p.numero_parcela}/{parcelasTabela.length}</span>
                            <input type="number" step="0.01" min="0" value={p.valor}
                              onChange={e => editarLinhaParcela(i, 'valor', e.target.value)}
                              className="flex-1 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs" />
                            <input type="date" value={p.data_vencimento}
                              onChange={e => editarLinhaParcela(i, 'data_vencimento', e.target.value)}
                              className="flex-1 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs" />
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 text-right text-xs font-bold text-slate-700 dark:text-slate-300">
                        Total: {totalParcelasTabela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {novaDespesa.tipo_pagamento === 'RECORRENTE' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor mensal</label>
                    <input type="number" step="0.01" min="0" value={novaDespesa.valor_recorrente}
                      onChange={e => setNovaDespesa(p => ({ ...p, valor_recorrente: e.target.value }))}
                      placeholder="0,00"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Dia do vencimento</label>
                    <input type="number" min="1" max="28" step="1" value={novaDespesa.dia_vencimento}
                      onChange={e => setNovaDespesa(p => ({ ...p, dia_vencimento: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Início</label>
                    <input type="date" value={novaDespesa.data_inicio}
                      onChange={e => setNovaDespesa(p => ({ ...p, data_inicio: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                  </div>
                  <p className="text-[11px] text-slate-400 col-span-full">Sem data de fim — gera pendências automaticamente todo mês (horizonte de 12 meses à frente).</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Observação (opcional)</label>
                <input type="text" value={novaDespesa.observacao} onChange={e => setNovaDespesa(p => ({ ...p, observacao: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalNova(false)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={salvarDespesa} disabled={salvandoDespesa}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {salvandoDespesa
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DespesasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <DespesasContent />
    </Suspense>
  );
}
