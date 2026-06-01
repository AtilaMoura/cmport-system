"use client"

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface CorpoNota {
  id: number;
  ciclo_id: number;
  condominio_id: number;
  tipo_nota: string;
  numero_referencia: string | null;
  numero_os: string | null;
  data_servico: string | null;
  descricao_servico: string | null;
  valor_bruto: number | null;
  percentual_inss: number | null;
  percentual_cofins: number | null;
  percentual_pis: number | null;
  percentual_csll: number | null;
  valor_inss: number | null;
  valor_cofins: number | null;
  valor_pis: number | null;
  valor_csll: number | null;
  valor_liquido: number | null;
  data_vencimento: string | null;
  mes_referencia: string | null;
  observacoes: string | null;
  preenchimento_manual: boolean;
  status: string;
  nota_fiscal_id: number | null;
  tem_garantia: boolean;
  conteudo_gerado: string | null;
  criado_em: string;
  atualizado_em: string | null;
  // Novos campos SERVIÇO
  configuracao_inter_id: number | null;
  orcamento_id: number | null;
  data_servico_texto: string | null;
  descricao_garantia: string | null;
  valor_nota_produto: number | null;
  sem_retencao: boolean;
  numero_nf: number | null;
}

interface Condominio {
  id: number;
  nome: string;
}

interface ConfiguracaoInter {
  id: number;
  cnpj: string;
  razao_social: string | null;
  tipo_nota: string;
  ativo: boolean;
}

interface NotaFiscalCandidato {
  id: number;
  numero_nota: string;
  tipo: string;
  status: string;
  valor: number;
  data_vencimento: string | null;
  cliente_nome: string | null;
}

interface NotaFiscalVinculada {
  id: number;
  numero_nota: string;
  valor: number;
  data_vencimento: string;
}

interface Divergencia {
  campo: string;
  corpo: string;
  nota: string;
  valorCorpo: number | string | null;
  valorNota: number | string | null;
}

const STATUS_NOTA_CONFIG: Record<string, { label: string; cls: string }> = {
  AUTORIZADA:   { label: 'Autorizada',   cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' },
  CANCELADA:    { label: 'Cancelada',    cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' },
  DESCONHECIDO: { label: 'Desconhecido', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
};

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  PENDENTE:      { label: 'Pendente',      cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',       dot: 'bg-slate-400' },
  EM_MONTAGEM:   { label: 'Em Montagem',   cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400', dot: 'bg-yellow-500' },
  GERADO:        { label: 'Gerado',        cls: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400', dot: 'bg-indigo-500' },
  XML_VINCULADO: { label: 'XML Vinculado', cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-400',         dot: 'bg-cyan-500' },
  BOLETO_GERADO: { label: 'Boleto Gerado', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400', dot: 'bg-purple-500' },
  PAGO:          { label: 'Pago',          cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',     dot: 'bg-green-500' },
  CANCELADO:     { label: 'Cancelado',     cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',            dot: 'bg-red-400' },
};

const TRANSICOES: Record<string, { destino: string; label: string; cls: string }[]> = {
  PENDENTE:      [{ destino: 'EM_MONTAGEM', label: 'Iniciar Montagem', cls: 'bg-yellow-500 hover:bg-yellow-600' }, { destino: 'CANCELADO', label: 'Cancelar', cls: 'bg-red-500 hover:bg-red-600' }],
  EM_MONTAGEM:   [{ destino: 'GERADO', label: 'Marcar como Gerado', cls: 'bg-indigo-500 hover:bg-indigo-600' }, { destino: 'CANCELADO', label: 'Cancelar', cls: 'bg-red-500 hover:bg-red-600' }],
  GERADO:        [{ destino: 'XML_VINCULADO', label: 'Marcar XML Vinculado', cls: 'bg-cyan-500 hover:bg-cyan-600' }, { destino: 'CANCELADO', label: 'Cancelar', cls: 'bg-red-500 hover:bg-red-600' }],
  XML_VINCULADO: [{ destino: 'BOLETO_GERADO', label: 'Marcar Boleto Gerado', cls: 'bg-purple-500 hover:bg-purple-600' }, { destino: 'CANCELADO', label: 'Cancelar', cls: 'bg-red-500 hover:bg-red-600' }],
  BOLETO_GERADO: [{ destino: 'PAGO', label: 'Registrar Pagamento', cls: 'bg-green-500 hover:bg-green-600' }, { destino: 'CANCELADO', label: 'Cancelar', cls: 'bg-red-500 hover:bg-red-600' }],
  PAGO:          [],
  CANCELADO:     [{ destino: 'PENDENTE', label: 'Reativar', cls: 'bg-slate-500 hover:bg-slate-600' }],
};

function fmt(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtValor(v: number | null | undefined) {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtPct(v: number | null | undefined) {
  if (v == null || v === 0) return '—';
  return `${v.toFixed(2)}%`;
}

export default function DetalheCorpoNotaPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [corpo, setCorpo] = useState<CorpoNota | null>(null);
  const [condominio, setCondominio] = useState<Condominio | null>(null);
  const [configuracoes, setConfiguracoes] = useState<ConfiguracaoInter[]>([]);
  const [loading, setLoading] = useState(true);
  const [atualizandoStatus, setAtualizandoStatus] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Nota fiscal vinculada + divergências
  const [notaVinculada, setNotaVinculada] = useState<NotaFiscalVinculada | null>(null);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [alertaDismissed, setAlertaDismissed] = useState(false);
  const [atualizandoCorpo, setAtualizandoCorpo] = useState(false);

  // Geração de número NF
  const [gerandoNf, setGerandoNf] = useState(false);
  const [erroNf, setErroNf] = useState<string | null>(null);

  // Edição inline
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroEdit, setErroEdit] = useState<string | null>(null);
  const [formEdit, setFormEdit] = useState({
    descricao_servico: '',
    valor_bruto: '',
    data_vencimento: '',
    data_servico: '',
    observacoes: '',
    configuracao_inter_id: '' as string,
    sem_retencao: false,
    numero_nf: '' as string,
  });

  // Modal vínculo manual
  const [showVincular, setShowVincular] = useState(false);
  const [candidatos, setCandidatos] = useState<NotaFiscalCandidato[]>([]);
  const [buscandoCandidatos, setBuscandoCandidatos] = useState(false);
  const [vinculando, setVinculando] = useState(false);

  const carregar = async () => {
    try {
      const r = await api.get(`/corpos-nota/${id}`);
      setCorpo(r.data);
      setFormEdit({
        descricao_servico: r.data.descricao_servico ?? '',
        valor_bruto: r.data.valor_bruto != null ? String(r.data.valor_bruto) : '',
        data_vencimento: r.data.data_vencimento ?? '',
        data_servico: r.data.data_servico ?? '',
        observacoes: r.data.observacoes ?? '',
        configuracao_inter_id: r.data.configuracao_inter_id != null ? String(r.data.configuracao_inter_id) : '',
        sem_retencao: r.data.sem_retencao ?? false,
        numero_nf: r.data.numero_nf != null ? String(r.data.numero_nf) : '',
      });
      try {
        const rCond = await api.get(`/condominios/${r.data.condominio_id}`);
        setCondominio(rCond.data);
      } catch { /* silencioso */ }

      // Busca nota fiscal vinculada e calcula divergências
      if (r.data.nota_fiscal_id) {
        try {
          const rNota = await api.get(`/notas-fiscais/${r.data.nota_fiscal_id}`);
          const nota: NotaFiscalVinculada = rNota.data;
          setNotaVinculada(nota);
          setAlertaDismissed(false);

          const divs: Divergencia[] = [];
          const corpValor = r.data.valor_bruto as number | null;
          if (corpValor != null && Math.abs(corpValor - nota.valor) > 0.01) {
            divs.push({
              campo: 'Valor',
              corpo: fmtValor(corpValor),
              nota: fmtValor(nota.valor),
              valorCorpo: corpValor,
              valorNota: nota.valor,
            });
          }
          const corpData = r.data.data_vencimento as string | null;
          if (corpData && nota.data_vencimento && corpData !== nota.data_vencimento) {
            divs.push({
              campo: 'Vencimento',
              corpo: fmt(corpData),
              nota: fmt(nota.data_vencimento),
              valorCorpo: corpData,
              valorNota: nota.data_vencimento,
            });
          }
          setDivergencias(divs);
        } catch { /* silencioso */ }
      } else {
        setNotaVinculada(null);
        setDivergencias([]);
      }
    } catch {
      router.push('/corpos-nota');
    } finally {
      setLoading(false);
    }
  };

  const copiarConteudo = async () => {
    if (!corpo?.conteudo_gerado) return;
    const nomeHeader = condominio ? `Condomínio: ${condominio.nome}\n\n` : '';
    const texto = nomeHeader + corpo.conteudo_gerado;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // fallback para HTTP (clipboard API requer HTTPS)
      const el = document.createElement('textarea');
      el.value = texto;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  const gerarNumeroNf = async () => {
    if (!confirm('Gerar número NF? O contador será incrementado e não pode ser desfeito.')) return;
    setGerandoNf(true);
    setErroNf(null);
    try {
      await api.post(`/corpos-nota/${id}/gerar-numero-nf`);
      carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErroNf(msg || 'Erro ao gerar número NF.');
    } finally {
      setGerandoNf(false);
    }
  };

  const atualizarComNota = async () => {
    if (!notaVinculada || divergencias.length === 0) return;
    setAtualizandoCorpo(true);
    try {
      const payload: Record<string, unknown> = {};
      for (const div of divergencias) {
        if (div.campo === 'Valor') payload.valor_bruto = div.valorNota;
        if (div.campo === 'Vencimento') payload.data_vencimento = div.valorNota;
      }
      await api.patch(`/corpos-nota/${id}`, payload);
      setAlertaDismissed(true);
      carregar();
    } catch { /* silencioso */ } finally {
      setAtualizandoCorpo(false);
    }
  };

  useEffect(() => {
    carregar();
    api.get('/configuracoes/inter').then(r => setConfiguracoes(r.data)).catch(() => {});
  }, [id]);

  const atualizarStatus = async (destino: string) => {
    if (!confirm(`Mudar status para "${STATUS_CONFIG[destino]?.label ?? destino}"?`)) return;
    setAtualizandoStatus(true);
    try {
      await api.patch(`/corpos-nota/${id}/status`, { status: destino });
      carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(msg || 'Erro ao atualizar status.');
    } finally {
      setAtualizandoStatus(false);
    }
  };

  const salvarEdicao = async () => {
    setSalvando(true);
    setErroEdit(null);
    try {
      await api.patch(`/corpos-nota/${id}`, {
        descricao_servico: formEdit.descricao_servico || null,
        valor_bruto: formEdit.valor_bruto ? Number(formEdit.valor_bruto) : null,
        data_vencimento: formEdit.data_vencimento || null,
        data_servico: formEdit.data_servico || null,
        observacoes: formEdit.observacoes || null,
        configuracao_inter_id: formEdit.configuracao_inter_id ? Number(formEdit.configuracao_inter_id) : null,
        sem_retencao: formEdit.sem_retencao,
        numero_nf: formEdit.numero_nf ? Number(formEdit.numero_nf) : null,
      });
      setEditando(false);
      carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErroEdit(msg || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  const deletar = async () => {
    if (!confirm('Excluir este corpo de nota? A ação registra a exclusão na auditoria.')) return;
    try {
      await api.delete(`/corpos-nota/${id}`);
      router.push('/corpos-nota');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(msg || 'Erro ao excluir.');
    }
  };

  const buscarCandidatosVincular = async () => {
    setBuscandoCandidatos(true);
    setShowVincular(true);
    setCandidatos([]);
    try {
      const r = await api.get(`/corpos-nota/${id}/candidatos-nota`);
      setCandidatos(r.data);
    } catch {
      alert('Erro ao buscar candidatos.');
      setShowVincular(false);
    } finally {
      setBuscandoCandidatos(false);
    }
  };

  const vincularNota = async (notaId: number) => {
    setVinculando(true);
    try {
      await api.post(`/corpos-nota/${id}/vincular-nota`, { nota_fiscal_id: notaId });
      setShowVincular(false);
      carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(msg || 'Erro ao vincular nota.');
    } finally {
      setVinculando(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400 font-semibold">Carregando...</div>;
  }

  if (!corpo) return null;

  const statusConf = STATUS_CONFIG[corpo.status] ?? STATUS_CONFIG.PENDENTE;
  const transicoes = TRANSICOES[corpo.status] ?? [];
  const podeEditar = !['XML_VINCULADO', 'BOLETO_GERADO', 'PAGO'].includes(corpo.status);
  const podeDeletar = corpo.status !== 'PAGO';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-3 lg:py-5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/corpos-nota" className="inline-flex items-center gap-2 text-slate-500 hover:text-violet-600 transition-colors font-semibold text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Corpos de Nota</span>
            </Link>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusConf.cls}`}>
                {statusConf.label}
              </span>
              {podeEditar && !editando && (
                <button
                  onClick={() => setEditando(true)}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Editar
                </button>
              )}
              {podeDeletar && (
                <button
                  onClick={deletar}
                  className="px-3 py-1.5 text-xs font-bold bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 rounded-lg hover:bg-red-200 transition-colors"
                >
                  Excluir
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-6 space-y-4">

        {/* Card principal */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-3 h-3 rounded-full shrink-0 ${statusConf.dot}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-slate-900 dark:text-white">
                    {corpo.numero_referencia ?? `Corpo #${corpo.id}`}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{corpo.tipo_nota}</span>
                </div>
                {condominio && (
                  <div className="text-sm font-semibold text-violet-700 dark:text-violet-400 truncate mt-0.5">
                    {condominio.nome}
                  </div>
                )}
              </div>
            </div>
            <span className="text-xs text-slate-400 shrink-0">{corpo.mes_referencia ?? '—'}</span>
          </div>

          <div className="p-6 space-y-4">
            {editando ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Descrição do Serviço</label>
                  <textarea
                    value={formEdit.descricao_servico}
                    onChange={e => setFormEdit(f => ({ ...f, descricao_servico: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Valor Bruto (R$)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formEdit.valor_bruto}
                      onChange={e => setFormEdit(f => ({ ...f, valor_bruto: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Vencimento</label>
                    <input
                      type="date"
                      value={formEdit.data_vencimento}
                      onChange={e => setFormEdit(f => ({ ...f, data_vencimento: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Data do Serviço</label>
                    <input
                      type="date"
                      value={formEdit.data_servico}
                      onChange={e => setFormEdit(f => ({ ...f, data_servico: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Observações</label>
                    <input
                      type="text"
                      value={formEdit.observacoes}
                      onChange={e => setFormEdit(f => ({ ...f, observacoes: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                {configuracoes.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">CNPJ / Conta Inter</label>
                    <select
                      value={formEdit.configuracao_inter_id}
                      onChange={e => setFormEdit(f => ({ ...f, configuracao_inter_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="">— Nenhuma —</option>
                      {configuracoes.map(c => (
                        <option key={c.id} value={String(c.id)}>
                          {c.cnpj}{c.razao_social ? ` — ${c.razao_social}` : ''} ({c.tipo_nota})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Número NF</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Ex: 19"
                    value={formEdit.numero_nf}
                    onChange={e => setFormEdit(f => ({ ...f, numero_nf: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <p className="text-xs text-slate-400 mt-0.5">Número sequencial da NF (será regenerado no corpo da nota)</p>
                </div>
                {(corpo.tipo_nota === 'MANUTENCAO' || corpo.tipo_nota === 'SERVICO') && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formEdit.sem_retencao}
                      onChange={e => setFormEdit(f => ({ ...f, sem_retencao: e.target.checked }))}
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                    <span className="text-slate-700 dark:text-slate-300">Sem retenção de imposto</span>
                  </label>
                )}
                {erroEdit && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erroEdit}</p>}
                <div className="flex gap-3">
                  <button onClick={() => { setEditando(false); setErroEdit(null); }} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={salvarEdicao} disabled={salvando} className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 transition-colors disabled:opacity-50">
                    {salvando ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <InfoItem label="Nº Referência" value={corpo.numero_referencia ?? '—'} />
                <InfoItem label="OS" value={corpo.numero_os ?? '—'} />
                <InfoItem label="Mês de Referência" value={corpo.mes_referencia ?? '—'} />
                {corpo.data_servico_texto
                  ? <InfoItem label="Data(s) do Serviço" value={corpo.data_servico_texto} />
                  : <InfoItem label="Data do Serviço" value={fmt(corpo.data_servico)} />}
                <InfoItem label="Vencimento" value={fmt(corpo.data_vencimento)} />
                {/* Nota Fiscal: número sequencial + vínculo XML */}
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">Nota Fiscal</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-mono font-bold ${corpo.numero_nf ? 'text-violet-700 dark:text-violet-400' : 'text-slate-400'}`}>
                      {corpo.numero_nf ? String(corpo.numero_nf).padStart(4, '0') : '—'}
                    </span>
                    {corpo.nota_fiscal_id && (
                      <span className="text-xs text-slate-500">· XML #{corpo.nota_fiscal_id}</span>
                    )}
                    {!['PAGO','CANCELADO'].includes(corpo.status) && corpo.configuracao_inter_id && (
                      <button
                        onClick={gerarNumeroNf}
                        disabled={gerandoNf}
                        className="px-2 py-0.5 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 rounded text-xs font-bold hover:bg-violet-200 transition-colors disabled:opacity-50"
                      >
                        {gerandoNf ? '...' : corpo.numero_nf ? 'Regerar' : 'Gerar'}
                      </button>
                    )}
                  </div>
                  {erroNf && <p className="text-xs text-red-600 mt-1">{erroNf}</p>}
                </div>
                <InfoItem label="Preenchimento" value={corpo.preenchimento_manual ? 'Manual' : 'Automático (OS)'} />
                {corpo.configuracao_inter_id && (() => {
                  const cfg = configuracoes.find(c => c.id === corpo.configuracao_inter_id);
                  return cfg ? <InfoItem label="CNPJ / Conta Inter" value={`${cfg.cnpj}${cfg.razao_social ? ` — ${cfg.razao_social}` : ''}`} /> : null;
                })()}
                {corpo.orcamento_id && <InfoItem label="Orçamento" value={`#${corpo.orcamento_id}`} />}
                {corpo.descricao_garantia && <InfoItem label="Garantia" value={corpo.descricao_garantia} className="sm:col-span-2" />}
                {corpo.observacoes && <InfoItem label="Observações" value={corpo.observacoes} className="sm:col-span-2" />}
                {corpo.descricao_servico && (
                  <div className="sm:col-span-2">
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">Descrição do Serviço</div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{corpo.descricao_servico}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Card valores */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
          <h3 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Valores e Impostos</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <ValorCard label="Bruto (Serv.)" value={fmtValor(corpo.valor_bruto)} accent={false} />
            <ValorCard label="INSS" value={fmtValor(corpo.valor_inss)} sub={fmtPct(corpo.percentual_inss)} accent={false} />
            <ValorCard label="COFINS+PIS+CSLL" value={fmtValor((corpo.valor_cofins ?? 0) + (corpo.valor_pis ?? 0) + (corpo.valor_csll ?? 0))} sub={fmtPct((corpo.percentual_cofins ?? 0) + (corpo.percentual_pis ?? 0) + (corpo.percentual_csll ?? 0))} accent={false} />
            <ValorCard label="Líquido (Serv.)" value={fmtValor(corpo.valor_liquido)} accent={true} />
          </div>
          {corpo.valor_nota_produto != null && corpo.valor_nota_produto > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <ValorCard label="Nota de Produto" value={fmtValor(corpo.valor_nota_produto)} accent={false} />
                <ValorCard
                  label="Total do Boleto"
                  value={fmtValor((corpo.valor_liquido ?? 0) + corpo.valor_nota_produto)}
                  accent={true}
                />
              </div>
            </div>
          )}
        </div>

        {/* Alerta de divergência entre corpo e nota fiscal vinculada */}
        {divergencias.length > 0 && !alertaDismissed && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="text-amber-500 text-xl shrink-0">⚠️</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-amber-800 dark:text-amber-300 text-sm mb-2">
                  Divergência entre o corpo da nota e a nota fiscal vinculada
                  {notaVinculada && <span className="font-normal"> (NF {notaVinculada.numero_nota})</span>}
                </p>
                <div className="space-y-1 mb-3">
                  {divergencias.map(div => (
                    <div key={div.campo} className="text-xs text-amber-700 dark:text-amber-400">
                      <span className="font-bold">{div.campo}:</span>{' '}
                      sistema tem <span className="font-mono bg-amber-100 dark:bg-amber-500/20 px-1 rounded">{div.corpo}</span>,
                      NF tem <span className="font-mono bg-amber-100 dark:bg-amber-500/20 px-1 rounded">{div.nota}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={atualizarComNota}
                    disabled={atualizandoCorpo}
                    className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors disabled:opacity-50"
                  >
                    {atualizandoCorpo ? 'Atualizando...' : 'Atualizar sistema com dados da NF'}
                  </button>
                  <button
                    onClick={() => setAlertaDismissed(true)}
                    className="px-3 py-1.5 bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-600 rounded-lg text-xs font-bold hover:bg-amber-50 transition-colors"
                  >
                    Manter divergência
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo gerado */}
        {corpo.conteudo_gerado && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">Corpo da Nota Gerado</h3>
              <button
                onClick={copiarConteudo}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  copiado
                    ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-violet-100 dark:hover:bg-violet-500/20 hover:text-violet-700 dark:hover:text-violet-400'
                }`}
              >
                {copiado ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copiado!
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copiar
                  </>
                )}
              </button>
            </div>
            <pre className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono">
              {corpo.conteudo_gerado}
            </pre>
          </div>
        )}

        {/* Ações de transição de status */}
        {(transicoes.length > 0 || !corpo.nota_fiscal_id) && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
            <h3 className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4">Ações</h3>
            <div className="flex flex-wrap gap-3">
              {transicoes.map(t => (
                <button
                  key={t.destino}
                  onClick={() => atualizarStatus(t.destino)}
                  disabled={atualizandoStatus}
                  className={`px-4 py-2 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50 ${t.cls}`}
                >
                  {t.label}
                </button>
              ))}
              {/* Botão vincular XML manualmente */}
              {!corpo.nota_fiscal_id && corpo.status !== 'CANCELADO' && (
                <button
                  onClick={buscarCandidatosVincular}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold rounded-xl transition-colors"
                >
                  Vincular XML
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Vincular XML */}
      {showVincular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Vincular Nota Fiscal</h2>
              <button onClick={() => setShowVincular(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {buscandoCandidatos ? (
              <div className="text-center py-8 text-slate-400 animate-pulse">Buscando candidatos...</div>
            ) : candidatos.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-3">🔍</div>
                <p className="text-slate-500 font-semibold">Nenhuma nota fiscal candidata encontrada</p>
                <p className="text-xs text-slate-400 mt-1">Importe o XML correspondente primeiro.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                  {candidatos.length} candidato(s) encontrado(s). Selecione a nota correta:
                </p>
                {candidatos.map(c => {
                  const stNota = STATUS_NOTA_CONFIG[c.status] ?? STATUS_NOTA_CONFIG.DESCONHECIDO;
                  return (
                    <button
                      key={c.id}
                      onClick={() => vincularNota(c.id)}
                      disabled={vinculando}
                      className="w-full text-left px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 transition-colors group disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-cyan-700 dark:group-hover:text-cyan-400">
                          NF #{c.numero_nota} · {c.tipo}
                        </div>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${stNota.cls}`}>
                          {stNota.label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {c.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        {c.cliente_nome ? ` · ${c.cliente_nome}` : ''}
                        {c.data_vencimento ? ` · Venc. ${fmt(c.data_vencimento)}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              onClick={() => setShowVincular(false)}
              className="w-full mt-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{value}</div>
    </div>
  );
}

function ValorCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${accent ? 'bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-800' : 'bg-slate-50 dark:bg-slate-800'}`}>
      <div className={`text-xs font-bold uppercase mb-1 ${accent ? 'text-violet-600 dark:text-violet-400' : 'text-slate-500 dark:text-slate-400'}`}>{label}</div>
      <div className={`text-sm font-black ${accent ? 'text-violet-700 dark:text-violet-400' : 'text-slate-800 dark:text-slate-200'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 dark:text-slate-500">{sub}</div>}
    </div>
  );
}
