"use client"

import { useState, useEffect, useCallback, Suspense } from 'react';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import { DetalheMovimentacoes } from '@/components/fluxo-financeiro/DetalheMovimentacoes';
import { type Movimentacao } from '@/lib/fluxoFinanceiro';

interface BancoOpcao {
  id: number;
  nome: string;
  razao_social_titular: string | null;
}

interface CategoriaOpcao {
  id: number;
  nome: string;
}

const NOVA_VAZIA = { data: '', descricao: '', valor: '', categoria_id: '', banco_origem_id: '', banco_id: '' };

function TransferenciasContent() {
  const { ano, mes, setAno, setMes } = useFiltrosFluxo();
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [bancos, setBancos] = useState<BancoOpcao[]>([]);
  const [categorias, setCategorias] = useState<CategoriaOpcao[]>([]);
  const [modalNova, setModalNova] = useState(false);
  const [nova, setNova] = useState(NOVA_VAZIA);
  const [salvandoNova, setSalvandoNova] = useState(false);

  useEffect(() => {
    api.get('/configuracoes/bancos').then(({ data }) => setBancos(data.filter((b: { ativo: boolean }) => b.ativo))).catch(() => {});
    // Só categorias usadas de fato em transferência entre contas — exclui "Contrato
    // Manutenção"/"Assistência", que são receita de serviço (gerada via nota/boleto,
    // não cabe num lançamento manual de transferência interna)
    const CATEGORIAS_TRANSFERENCIA = ['Rendimento', 'Ajustes', 'Outros Recebimentos'];
    api.get('/categorias-financeiras', { params: { ativo: true } })
      .then(({ data }) => setCategorias((data ?? []).filter((c: { nome: string }) => CATEGORIAS_TRANSFERENCIA.includes(c.nome))))
      .catch(() => {});
  }, []);

  const abrirNova = () => {
    const outrosRecebimentos = categorias.find(c => c.nome === 'Outros Recebimentos');
    setNova({
      ...NOVA_VAZIA,
      data: new Date().toISOString().slice(0, 10),
      categoria_id: outrosRecebimentos ? String(outrosRecebimentos.id) : '',
    });
    setModalNova(true);
  };

  const salvarNova = async () => {
    if (!nova.data || !nova.descricao || !nova.valor) {
      alert('Preencha data, descrição e valor.'); return;
    }
    setSalvandoNova(true);
    try {
      await api.post('/financeiro/movimentacoes', {
        data: nova.data,
        descricao: nova.descricao,
        valor: Number(nova.valor),
        tipo: 'ENTRADA',
        categoria_id: nova.categoria_id ? Number(nova.categoria_id) : null,
        banco_origem_id: nova.banco_origem_id ? Number(nova.banco_origem_id) : null,
        banco_id: nova.banco_id ? Number(nova.banco_id) : null,
      });
      setModalNova(false);
      await carregar();
    } catch {
      alert('Erro ao salvar a transferência.');
    } finally {
      setSalvandoNova(false);
    }
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/financeiro/movimentacoes', { params: { ano, mes, tipo: 'ENTRADA' } });
      // Decimal do backend serializa como string
      setMovs(r.data.map((m: Movimentacao) => ({ ...m, valor: Number(m.valor) })));
    } catch {
      setMovs([]);
    } finally {
      setLoading(false);
    }
  }, [ano, mes]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Transferências Internas</h1>
          <p className="text-xs text-slate-500 mt-0.5">Entre contas próprias, rendimentos e ajustes — não é receita de condomínio</p>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} onAnoChange={setAno} onMesChange={setMes} acoesExtra={
          <button onClick={abrirNova}
            className="px-4 py-2 bg-teal-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all whitespace-nowrap">
            + Nova Transferência
          </button>
        } />
        {loading ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : (
          <DetalheMovimentacoes movs={movs} cor="text-teal-700 dark:text-teal-400" mostrarBancoOrigem onAtualizado={carregar} />
        )}
      </div>

      {/* ── Modal Nova Transferência ── */}
      {modalNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalNova(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-5">+ Nova Transferência</h2>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Data</label>
                  <input type="date" value={nova.data} onChange={e => setNova(p => ({ ...p, data: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor</label>
                  <input type="number" step="0.01" min="0" value={nova.valor} onChange={e => setNova(p => ({ ...p, valor: e.target.value }))}
                    placeholder="0,00"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Descrição</label>
                <input type="text" value={nova.descricao} onChange={e => setNova(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Ex: Transferência entre contas"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Categoria</label>
                <select value={nova.categoria_id} onChange={e => setNova(p => ({ ...p, categoria_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm">
                  <option value="">— Selecione —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">De onde saiu (origem)</label>
                <select value={nova.banco_origem_id} onChange={e => setNova(p => ({ ...p, banco_origem_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm">
                  <option value="">— Nenhuma —</option>
                  {bancos.map(b => <option key={b.id} value={b.id}>{b.nome} ({b.razao_social_titular})</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Pra onde foi (destino)</label>
                <select value={nova.banco_id} onChange={e => setNova(p => ({ ...p, banco_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-teal-500 outline-none text-sm">
                  <option value="">— Nenhuma —</option>
                  {bancos.map(b => <option key={b.id} value={b.id}>{b.nome} ({b.razao_social_titular})</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalNova(false)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={salvarNova} disabled={salvandoNova}
                className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {salvandoNova
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

export default function TransferenciasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <TransferenciasContent />
    </Suspense>
  );
}
