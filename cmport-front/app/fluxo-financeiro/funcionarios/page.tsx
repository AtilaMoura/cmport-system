"use client"

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { fmtValor } from '@/lib/fluxoFinanceiro';

// CNPJ (só dígitos) das duas empresas que pagam a folha
const EMPRESAS = [
  { cnpj: '22761557000188', label: 'CMPORT' },
  { cnpj: '65756913000188', label: 'TEC' },
];
const empresaLabel = (cnpj: string) => EMPRESAS.find(e => e.cnpj === cnpj)?.label ?? cnpj;

const ADIANTAMENTO_OPCOES = [
  { v: 'NENHUM', l: 'Não tem' },
  { v: 'FIXO', l: 'Valor fixo' },
  { v: 'VARIAVEL', l: 'Valor varia' },
];

interface Variaveis {
  salario_mensal: number | string;
  dia_pagamento_salario: number | null;
  adiantamento_tipo: string;
  adiantamento_valor: number | string;
  dia_pagamento_adiantamento: number | null;
  vale_transporte: number | string;
  vale_refeicao: number | string;
  tem_plantao: boolean;
  plantao_valor: number | string;
  tem_hora_extra: boolean;
  hora_extra_valor: number | string;
  encargos_percentual: number | string;
}

interface Funcionario {
  id: number;
  nome: string;
  empresa_padrao_cnpj: string;
  cargo: string | null;
  data_admissao: string | null;
  data_demissao: string | null;
  ativo: boolean;
  observacao: string | null;
  variaveis: Variaveis | null;
}

const varVazia = (): Variaveis => ({
  salario_mensal: '', dia_pagamento_salario: 11,
  adiantamento_tipo: 'NENHUM', adiantamento_valor: '', dia_pagamento_adiantamento: 21,
  vale_transporte: '', vale_refeicao: '',
  tem_plantao: false, plantao_valor: '', tem_hora_extra: false, hora_extra_valor: '',
  encargos_percentual: '',
});

type FormState = {
  nome: string; empresa_padrao_cnpj: string; cargo: string;
  data_admissao: string; ativo: boolean; data_demissao: string;
  observacao: string; variaveis: Variaveis;
};

const formVazio = (): FormState => ({
  nome: '', empresa_padrao_cnpj: '22761557000188', cargo: '',
  data_admissao: '', ativo: true, data_demissao: '', observacao: '',
  variaveis: varVazia(),
});

export default function FuncionariosPage() {
  const [lista, setLista] = useState<Funcionario[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(formVazio());
  const [salvando, setSalvando] = useState(false);
  const [removendo, setRemovendo] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/funcionarios');
      setLista(r.data);
    } catch {
      setLista([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirNovo = () => {
    setEditandoId(null);
    setForm(formVazio());
    setModalAberto(true);
  };

  const abrirEdicao = (f: Funcionario) => {
    setEditandoId(f.id);
    setForm({
      nome: f.nome,
      empresa_padrao_cnpj: f.empresa_padrao_cnpj,
      cargo: f.cargo ?? '',
      data_admissao: f.data_admissao ?? '',
      ativo: f.ativo,
      data_demissao: f.data_demissao ?? '',
      observacao: f.observacao ?? '',
      variaveis: f.variaveis
        ? {
            salario_mensal: f.variaveis.salario_mensal ?? '',
            dia_pagamento_salario: f.variaveis.dia_pagamento_salario ?? 11,
            adiantamento_tipo: f.variaveis.adiantamento_tipo ?? 'NENHUM',
            adiantamento_valor: f.variaveis.adiantamento_valor ?? '',
            dia_pagamento_adiantamento: f.variaveis.dia_pagamento_adiantamento ?? 21,
            vale_transporte: f.variaveis.vale_transporte ?? '',
            vale_refeicao: f.variaveis.vale_refeicao ?? '',
            tem_plantao: !!f.variaveis.tem_plantao,
            plantao_valor: f.variaveis.plantao_valor ?? '',
            tem_hora_extra: !!f.variaveis.tem_hora_extra,
            hora_extra_valor: f.variaveis.hora_extra_valor ?? '',
            encargos_percentual: f.variaveis.encargos_percentual ?? '',
          }
        : varVazia(),
    });
    setModalAberto(true);
  };

  const setV = (patch: Partial<Variaveis>) =>
    setForm(f => ({ ...f, variaveis: { ...f.variaveis, ...patch } }));

  const num = (v: number | string) => {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
    return isNaN(n) ? 0 : n;
  };

  const salvar = async () => {
    if (!form.nome.trim()) { alert('Informe o nome.'); return; }
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        empresa_padrao_cnpj: form.empresa_padrao_cnpj,
        cargo: form.cargo.trim() || null,
        data_admissao: form.data_admissao || null,
        data_demissao: form.ativo ? null : (form.data_demissao || null),
        ativo: form.ativo,
        observacao: form.observacao.trim() || null,
        variaveis: {
          salario_mensal: num(form.variaveis.salario_mensal),
          dia_pagamento_salario: form.variaveis.dia_pagamento_salario || null,
          adiantamento_tipo: form.variaveis.adiantamento_tipo,
          adiantamento_valor: form.variaveis.adiantamento_tipo === 'FIXO' ? num(form.variaveis.adiantamento_valor) : 0,
          dia_pagamento_adiantamento: form.variaveis.adiantamento_tipo !== 'NENHUM' ? (form.variaveis.dia_pagamento_adiantamento || null) : null,
          vale_transporte: num(form.variaveis.vale_transporte),
          vale_refeicao: num(form.variaveis.vale_refeicao),
          tem_plantao: form.variaveis.tem_plantao,
          plantao_valor: form.variaveis.tem_plantao ? num(form.variaveis.plantao_valor) : 0,
          tem_hora_extra: form.variaveis.tem_hora_extra,
          hora_extra_valor: form.variaveis.tem_hora_extra ? num(form.variaveis.hora_extra_valor) : 0,
          encargos_percentual: num(form.variaveis.encargos_percentual),
        },
      };
      if (editandoId) await api.put(`/funcionarios/${editandoId}`, payload);
      else await api.post('/funcionarios', payload);
      setModalAberto(false);
      await carregar();
    } catch {
      alert('Erro ao salvar o funcionário.');
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (f: Funcionario) => {
    if (!confirm(`Remover "${f.nome}" do cadastro? (não apaga o histórico de despesas)`)) return;
    setRemovendo(f.id);
    try {
      await api.delete(`/funcionarios/${f.id}`);
      await carregar();
    } catch {
      alert('Erro ao remover.');
    } finally {
      setRemovendo(null);
    }
  };

  const q = busca.trim().toLowerCase();
  const filtrados = lista
    .filter(f => mostrarInativos || f.ativo)
    .filter(f => !q || f.nome.toLowerCase().includes(q) || (f.cargo ?? '').toLowerCase().includes(q));

  const ativos = lista.filter(f => f.ativo);
  const somaSalario = ativos.reduce((s, f) => s + Number(f.variaveis?.salario_mensal ?? 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Funcionários</h1>
            <p className="text-xs text-slate-500 mt-0.5">Cadastro, salário e variáveis da folha</p>
          </div>
          <button onClick={abrirNovo}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-sm">
            + Novo funcionário
          </button>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{lista.length}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Ativos</div>
            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{ativos.length}</div>
          </div>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Salários / mês</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{fmtValor(somaSalario)}</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap gap-3 items-center">
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou cargo..."
            className="flex-1 min-w-48 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={mostrarInativos} onChange={e => setMostrarInativos(e.target.checked)} />
            Mostrar desligados
          </label>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div className="text-center py-12 text-slate-500">Nenhum funcionário.</div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtrados.map(f => (
                <div key={f.id} className="flex items-center gap-4 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <button onClick={() => abrirEdicao(f)} className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-slate-900 dark:text-white">{f.nome}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{empresaLabel(f.empresa_padrao_cnpj)}</span>
                      {f.ativo
                        ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">Ativo</span>
                        : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">Desligado</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {f.cargo || 'sem cargo'}
                      {f.variaveis?.salario_mensal ? ` · ${fmtValor(Number(f.variaveis.salario_mensal))}` : ''}
                    </div>
                  </button>
                  <button onClick={() => remover(f)} disabled={removendo === f.id}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50">
                    {removendo === f.id ? '...' : 'Remover'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={() => setModalAberto(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 my-8" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4">
              {editandoId ? 'Editar funcionário' : 'Novo funcionário'}
            </h2>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nome</label>
                  <input type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Empresa que paga</label>
                  <select value={form.empresa_padrao_cnpj} onChange={e => setForm(f => ({ ...f, empresa_padrao_cnpj: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm">
                    {EMPRESAS.map(e => <option key={e.cnpj} value={e.cnpj}>{e.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Cargo</label>
                  <input type="text" value={form.cargo} onChange={e => setForm(f => ({ ...f, cargo: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Admissão</label>
                  <input type="date" value={form.data_admissao} onChange={e => setForm(f => ({ ...f, data_admissao: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Situação</label>
                  <select value={form.ativo ? 'ATIVO' : 'DESLIGADO'}
                    onChange={e => setForm(f => ({ ...f, ativo: e.target.value === 'ATIVO' }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm">
                    <option value="ATIVO">Ativo</option>
                    <option value="DESLIGADO">Desligado</option>
                  </select>
                </div>
                {!form.ativo && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Data do desligamento</label>
                    <input type="date" value={form.data_demissao} onChange={e => setForm(f => ({ ...f, data_demissao: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                <div className="text-xs font-bold text-slate-500 uppercase mb-2">Variáveis da folha</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Salário mensal (R$)</label>
                    <input type="number" step="0.01" min="0" value={form.variaveis.salario_mensal}
                      onChange={e => setV({ salario_mensal: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Dia do pagamento</label>
                    <input type="number" step="1" min="1" max="31" value={form.variaveis.dia_pagamento_salario ?? ''}
                      onChange={e => setV({ dia_pagamento_salario: e.target.value ? Number(e.target.value) : null })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Adiantamento</label>
                    <select value={form.variaveis.adiantamento_tipo} onChange={e => setV({ adiantamento_tipo: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm">
                      {ADIANTAMENTO_OPCOES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                  {form.variaveis.adiantamento_tipo === 'FIXO' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor do adiantamento (R$)</label>
                      <input type="number" step="0.01" min="0" value={form.variaveis.adiantamento_valor}
                        onChange={e => setV({ adiantamento_valor: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                    </div>
                  )}
                  {form.variaveis.adiantamento_tipo !== 'NENHUM' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Dia do adiantamento</label>
                      <input type="number" step="1" min="1" max="31" value={form.variaveis.dia_pagamento_adiantamento ?? ''}
                        onChange={e => setV({ dia_pagamento_adiantamento: e.target.value ? Number(e.target.value) : null })}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Vale transporte / mês (R$)</label>
                    <input type="number" step="0.01" min="0" value={form.variaveis.vale_transporte}
                      onChange={e => setV({ vale_transporte: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Vale refeição / mês (R$)</label>
                    <input type="number" step="0.01" min="0" value={form.variaveis.vale_refeicao}
                      onChange={e => setV({ vale_refeicao: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">% de encargos (opcional)</label>
                    <input type="number" step="0.1" min="0" value={form.variaveis.encargos_percentual}
                      onChange={e => setV({ encargos_percentual: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={form.variaveis.tem_plantao} onChange={e => setV({ tem_plantao: e.target.checked })} />
                    Recebe plantão
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={form.variaveis.tem_hora_extra} onChange={e => setV({ tem_hora_extra: e.target.checked })} />
                    Recebe hora extra
                  </label>
                  {form.variaveis.tem_plantao && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Plantão — valor padrão (R$)</label>
                      <input type="number" step="0.01" min="0" value={form.variaveis.plantao_valor}
                        onChange={e => setV({ plantao_valor: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                    </div>
                  )}
                  {form.variaveis.tem_hora_extra && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Hora extra — valor padrão (R$)</label>
                      <input type="number" step="0.01" min="0" value={form.variaveis.hora_extra_valor}
                        onChange={e => setV({ hora_extra_valor: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  Salário, adiantamento, vales, plantão e hora extra geram uma pendência todo mês
                  com esse valor de sugestão — dá pra ajustar o valor real na hora de marcar como pago.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Observações</label>
                <input type="text" value={form.observacao} onChange={e => setForm(f => ({ ...f, observacao: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalAberto(false)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
