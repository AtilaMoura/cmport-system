"use client"

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

interface Condominio {
  id: number;
  nome: string;
}

interface Contrato {
  id: number;
  condominio_id: number;
  ativo: boolean;
  data_inicio: string | null;
  data_termino: string | null;
  dia_vencimento_padrao: number | null;
  valor_fixo_mensal: string | null;
  descricao_padrao_servico: string | null;
  observacoes_contrato: string | null;
  criado_em: string;
  atualizado_em: string | null;
  condominio?: Condominio;
}

function fmt(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtValor(v: string | number | null) {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const formInicial = {
  condominio_id: '',
  ativo: true,
  data_inicio: '',
  data_termino: '',
  dia_vencimento_padrao: '',
  valor_fixo_mensal: '',
  descricao_padrao_servico: '',
  observacoes_contrato: '',
};

export default function ContratosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Contrato | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState(formInicial);

  const carregar = async () => {
    try {
      const [rc, rco] = await Promise.all([
        api.get('/contratos'),
        api.get('/condominios'),
      ]);
      setContratos(rc.data);
      setCondominios(rco.data);
    } catch {
      setErro('Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const abrirNovo = () => {
    setEditando(null);
    setForm(formInicial);
    setErro(null);
    setShowForm(true);
  };

  const abrirEditar = (c: Contrato) => {
    setEditando(c);
    setForm({
      condominio_id: String(c.condominio_id),
      ativo: c.ativo,
      data_inicio: c.data_inicio ?? '',
      data_termino: c.data_termino ?? '',
      dia_vencimento_padrao: c.dia_vencimento_padrao != null ? String(c.dia_vencimento_padrao) : '',
      valor_fixo_mensal: c.valor_fixo_mensal ?? '',
      descricao_padrao_servico: c.descricao_padrao_servico ?? '',
      observacoes_contrato: c.observacoes_contrato ?? '',
    });
    setErro(null);
    setShowForm(true);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.condominio_id) { setErro('Selecione um condomínio.'); return; }
    if (!form.data_inicio) { setErro('Informe a data de início.'); return; }
    setSalvando(true);
    setErro(null);
    try {
      if (editando) {
        // Edição: PATCH no contrato existente
        const payload = {
          ativo: form.ativo,
          data_inicio: form.data_inicio,
          data_termino: form.data_termino || null,
          dia_vencimento_padrao: form.dia_vencimento_padrao ? Number(form.dia_vencimento_padrao) : null,
          valor_fixo_mensal: form.valor_fixo_mensal ? Number(form.valor_fixo_mensal) : null,
          descricao_padrao_servico: form.descricao_padrao_servico || null,
          observacoes_contrato: form.observacoes_contrato || null,
        };
        await api.patch(`/contratos/${editando.id}`, payload);
      } else {
        // Criação: POST com condominio_id
        const payload = {
          condominio_id: Number(form.condominio_id),
          ativo: form.ativo,
          data_inicio: form.data_inicio,
          data_termino: form.data_termino || null,
          dia_vencimento_padrao: form.dia_vencimento_padrao ? Number(form.dia_vencimento_padrao) : null,
          valor_fixo_mensal: form.valor_fixo_mensal ? Number(form.valor_fixo_mensal) : null,
          descricao_padrao_servico: form.descricao_padrao_servico || null,
          observacoes_contrato: form.observacoes_contrato || null,
        };
        await api.post('/contratos', payload);
      }
      setShowForm(false);
      carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao salvar contrato.');
    } finally {
      setSalvando(false);
    }
  };

  const toggleAtivo = async (c: Contrato) => {
    try {
      await api.patch(`/contratos/${c.id}/toggle-ativo`);
      carregar();
    } catch {
      alert('Erro ao alterar status.');
    }
  };

  const deletar = async (c: Contrato) => {
    if (!confirm(`Excluir o contrato de "${c.condominio?.nome ?? c.condominio_id}"? Esta ação é registrada no histórico de auditoria.`)) return;
    try {
      await api.delete(`/contratos/${c.id}`);
      carregar();
    } catch {
      alert('Erro ao excluir contrato.');
    }
  };

  const condominiosComContrato = new Set(contratos.map(c => c.condominio_id));
  const condominiosSemContrato = condominios.filter(c => !condominiosComContrato.has(c.id));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                <span className="text-xl sm:text-2xl">📃</span>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                  Contratos
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {contratos.length} contrato(s) cadastrado(s)
                </p>
              </div>
            </div>
            <button
              onClick={abrirNovo}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm shadow hover:bg-indigo-700 transition-colors"
            >
              + Novo Contrato
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="text-center py-20 text-slate-400 font-semibold">Carregando...</div>
        ) : contratos.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📃</div>
            <div className="text-slate-500 font-semibold">Nenhum contrato cadastrado</div>
            <button onClick={abrirNovo} className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors">
              Cadastrar primeiro contrato
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {contratos.map(c => (
              <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-bold text-slate-900 dark:text-white truncate">
                      {c.condominio?.nome ?? `Condomínio #${c.condominio_id}`}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      c.ativo
                        ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                    }`}>
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 flex gap-4 flex-wrap">
                    <span>Início: {fmt(c.data_inicio)}</span>
                    <span>Término: {fmt(c.data_termino)}</span>
                    {c.dia_vencimento_padrao && <span>Vence dia {c.dia_vencimento_padrao}</span>}
                    {c.valor_fixo_mensal && (
                      <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                        {fmtValor(c.valor_fixo_mensal)}/mês
                      </span>
                    )}
                  </div>
                  {c.descricao_padrao_servico && (
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 truncate max-w-md">
                      Padrão: {c.descricao_padrao_servico}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => abrirEditar(c)}
                    className="px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleAtivo(c)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                      c.ativo
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 hover:bg-amber-200'
                        : 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400 hover:bg-green-200'
                    }`}
                  >
                    {c.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                  <button
                    onClick={() => deletar(c)}
                    className="px-3 py-1.5 text-xs font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de formulário */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6">
              {editando ? 'Editar Contrato' : 'Novo Contrato'}
            </h2>
            <form onSubmit={salvar} className="space-y-4">
              {/* Condomínio */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                  Condomínio
                </label>
                {editando ? (
                  <div className="px-3 py-2 bg-slate-100 dark:bg-slate-800 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {editando.condominio?.nome ?? `#${editando.condominio_id}`}
                  </div>
                ) : (
                  <select
                    value={form.condominio_id}
                    onChange={e => setForm(f => ({ ...f, condominio_id: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="">Selecione...</option>
                    {condominiosSemContrato.map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Ativo */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ativo"
                  checked={form.ativo}
                  onChange={e => setForm(f => ({ ...f, ativo: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <label htmlFor="ativo" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Contrato ativo
                </label>
              </div>

              {/* Datas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Início <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))}
                    required
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Término
                  </label>
                  <input
                    type="date"
                    value={form.data_termino}
                    onChange={e => setForm(f => ({ ...f, data_termino: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Auto-preenchimento */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                  Auto-preenchimento do corpo de nota (opcional)
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                      Dia de Vencimento
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={form.dia_vencimento_padrao}
                      onChange={e => setForm(f => ({ ...f, dia_vencimento_padrao: e.target.value }))}
                      placeholder="Ex: 10"
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                      Valor Fixo Mensal (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.valor_fixo_mensal}
                      onChange={e => setForm(f => ({ ...f, valor_fixo_mensal: e.target.value }))}
                      placeholder="0,00"
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Descrição Padrão do Serviço
                  </label>
                  <textarea
                    value={form.descricao_padrao_servico}
                    onChange={e => setForm(f => ({ ...f, descricao_padrao_servico: e.target.value }))}
                    rows={2}
                    placeholder="Ex: Serviços de manutenção predial preventiva e corretiva..."
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                  />
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wide">
                    Observações do Contrato
                  </label>
                  <textarea
                    value={form.observacoes_contrato}
                    onChange={e => setForm(f => ({ ...f, observacoes_contrato: e.target.value }))}
                    rows={2}
                    placeholder="Informações adicionais sobre o contrato..."
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                  />
                </div>
              </div>

              {erro && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-xl p-3 font-semibold">
                  {erro}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={salvando}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50"
                >
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
