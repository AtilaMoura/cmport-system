"use client"

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Cliente { id: number; nome: string; apartamento: string | null; email: string | null; }

interface Recibo {
  id: number;
  numero_recibo: string;
  tipo: 'ENTRADA' | 'SAIDA';
  cliente_id: number | null;
  condominio_id: number | null;
  cliente_nome_avulso: string | null;
  cliente: Cliente | null;
  configuracao_inter_id: number | null;
  cnpj_emitente: string | null;
  cnpj_cliente: string | null;
  descricao_servico: string;
  valor: number;
  data_emissao: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  status: string;
  observacao: string | null;
  criado_em: string | null;
}

interface Condominio { id: number; nome: string; }

interface ContaInter { id: number; cnpj: string; razao_social: string | null; ativo: boolean; }

interface ServicoVinculado {
  id: number;
  tipo: 'manutencao' | 'assistencia';
  numero_os: string | null;
  data_servico: string;
  descricao: string | null;
}

const STATUS_CLS: Record<string, string> = {
  PENDENTE:  'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  PAGO:      'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  CANCELADO: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
};

const TIPO_CLS: Record<string, string> = {
  ENTRADA: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
  SAIDA:   'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
};

function fmtValor(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtData(d: string | null) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

export default function ReciboDetalhePage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [recibo, setRecibo] = useState<Recibo | null>(null);
  const [condominio, setCondominio] = useState<Condominio | null>(null);
  const [servicoVinculado, setServicoVinculado] = useState<ServicoVinculado | null>(null);
  const [contasInter, setContasInter] = useState<ContaInter[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);

  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [excluindo, setExcluindo] = useState(false);

  const [modalEmail, setModalEmail] = useState(false);
  const [emailDestinatario, setEmailDestinatario] = useState('');
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailErro, setEmailErro] = useState<string | null>(null);
  const [emailSucesso, setEmailSucesso] = useState(false);

  // Form — só campos financeiros/descritivos (tipo, condomínio e cliente ficam travados)
  const [clienteNomeAvulso, setClienteNomeAvulso] = useState('');
  const [descricaoServico, setDescricaoServico] = useState('');
  const [valor, setValor] = useState('');
  const [dataEmissao, setDataEmissao] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [observacao, setObservacao] = useState('');
  const [contaInterSelecionada, setContaInterSelecionada] = useState<ContaInter | null>(null);

  useEffect(() => {
    if (id) carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const carregarDados = async () => {
    try {
      const { data: r } = await api.get(`/recibos/${id}`);
      setRecibo(r);
      setClienteNomeAvulso(r.cliente_nome_avulso || '');
      setDescricaoServico(r.descricao_servico);
      setValor(String(r.valor));
      setDataEmissao(r.data_emissao);
      setDataVencimento(r.data_vencimento || '');
      setDataPagamento(r.data_pagamento || '');
      setObservacao(r.observacao || '');

      if (r.condominio_id) {
        try {
          const { data: c } = await api.get(`/condominios/${r.condominio_id}`);
          setCondominio(c);
        } catch { setCondominio(null); }
      } else {
        setCondominio(null);
      }

      try {
        const { data: s } = await api.get(`/servicos/por-recibo/${id}`);
        setServicoVinculado(s);
      } catch {
        setServicoVinculado(null);
      }

      try {
        const { data: contas } = await api.get('/configuracoes/inter');
        const ativas: ContaInter[] = (contas ?? []).filter((c: ContaInter) => c.ativo);
        setContasInter(ativas);
        if (r.configuracao_inter_id) {
          setContaInterSelecionada(ativas.find((c: ContaInter) => c.id === r.configuracao_inter_id) || null);
        }
      } catch {
        setContasInter([]);
      }
    } catch {
      setNotFoundState(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async () => {
    if (!recibo) return;
    setSalvando(true);
    try {
      await api.patch(`/recibos/${id}`, {
        cliente_nome_avulso: !recibo.cliente_id ? (clienteNomeAvulso || null) : undefined,
        descricao_servico: descricaoServico,
        valor: Number(valor),
        data_emissao: dataEmissao,
        data_vencimento: dataVencimento || null,
        data_pagamento: dataPagamento || null,
        observacao: observacao || null,
        configuracao_inter_id: contaInterSelecionada?.id ?? null,
        cnpj_emitente: contaInterSelecionada?.cnpj ?? null,
      });
      setEditando(false);
      await carregarDados();
    } catch {
      alert('Erro ao salvar recibo.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirModalEmail = () => {
    setEmailDestinatario(recibo?.cliente?.email || '');
    setEmailErro(null);
    setEmailSucesso(false);
    setModalEmail(true);
  };

  const handleEnviarEmail = async () => {
    if (!emailDestinatario) { setEmailErro('Informe um email de destino.'); return; }
    setEnviandoEmail(true);
    setEmailErro(null);
    try {
      await api.post(`/recibos/${id}/enviar-email`, { destinatarios: [emailDestinatario] });
      setEmailSucesso(true);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setEmailErro(msg || 'Erro ao enviar email.');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const handleExcluir = async () => {
    setExcluindo(true);
    try {
      await api.delete(`/recibos/${id}`, { params: { motivo: motivo || 'Exclusão solicitada pelo usuário' } });
      router.push('/recibos');
    } catch {
      alert('Erro ao excluir recibo.');
      setExcluindo(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando recibo...</p>
        </div>
      </div>
    );
  }

  if (notFoundState || !recibo) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-3">🧾</div>
          <p className="font-semibold text-slate-700 dark:text-white">Recibo não encontrado</p>
          <Link href="/recibos" className="text-sm text-violet-600 hover:underline mt-2 inline-block">← Voltar para Recibos</Link>
        </div>
      </div>
    );
  }

  const nomeContraparte = recibo.cliente?.nome || recibo.cliente_nome_avulso || '—';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/recibos" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">←</Link>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black text-slate-900 dark:text-white font-mono">{recibo.numero_recibo}</h1>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TIPO_CLS[recibo.tipo]}`}>{recibo.tipo}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLS[recibo.status] ?? ''}`}>{recibo.status}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{nomeContraparte}{condominio ? ` · ${condominio.nome}` : ''}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {editando ? (
              <>
                <button onClick={() => { setEditando(false); carregarDados(); }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSalvar} disabled={salvando}
                  className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50">
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditando(true)}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-200 transition-colors">
                  Editar
                </button>
                <button onClick={() => setModalExcluir(true)}
                  className="px-4 py-2 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-bold rounded-xl hover:bg-red-100 transition-colors">
                  Excluir
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">

        {/* Hero */}
        <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-2xl p-6 text-white">
          <div className="text-xs font-bold uppercase tracking-wide opacity-80 mb-1">Valor do recibo</div>
          <div className="text-3xl font-black">{fmtValor(recibo.valor)}</div>
        </div>

        {/* Card — Dados Financeiros */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Dados Financeiros</h2>

          {!recibo.cliente_id && (
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Nome (avulso)</label>
              {editando ? (
                <input type="text" value={clienteNomeAvulso} onChange={e => setClienteNomeAvulso(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              ) : (
                <p className="text-sm text-slate-800 dark:text-white">{nomeContraparte}</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Descrição do Serviço</label>
            {editando ? (
              <textarea value={descricaoServico} onChange={e => setDescricaoServico(e.target.value)} rows={3}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none" />
            ) : (
              <p className="text-sm text-slate-800 dark:text-white whitespace-pre-wrap">{recibo.descricao_servico}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Valor (R$)</label>
              {editando ? (
                <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              ) : (
                <p className="text-sm text-slate-800 dark:text-white">{fmtValor(recibo.valor)}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Data de Emissão</label>
              {editando ? (
                <input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              ) : (
                <p className="text-sm text-slate-800 dark:text-white">{fmtData(recibo.data_emissao)}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Vencimento</label>
              {editando ? (
                <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              ) : (
                <p className="text-sm text-slate-800 dark:text-white">{fmtData(recibo.data_vencimento)}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Pagamento</label>
              {editando ? (
                <input type="date" value={dataPagamento} onChange={e => setDataPagamento(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              ) : (
                <p className="text-sm text-slate-800 dark:text-white">{fmtData(recibo.data_pagamento)}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Observação</label>
            {editando ? (
              <input type="text" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Informações adicionais"
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            ) : (
              <p className="text-sm text-slate-800 dark:text-white">{recibo.observacao || '—'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">CNPJ / Conta Inter (CMPort)</label>
            {editando ? (
              <div className="flex flex-wrap gap-2">
                {contasInter.map(c => (
                  <button key={c.id} type="button" onClick={() => setContaInterSelecionada(c)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                      contaInterSelecionada?.id === c.id ? 'border-violet-600 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-violet-300'
                    }`}>
                    {c.cnpj}{c.razao_social ? ` — ${c.razao_social}` : ''}
                  </button>
                ))}
                {contasInter.length === 0 && <p className="text-xs text-slate-400">Nenhuma conta Inter cadastrada.</p>}
              </div>
            ) : (
              <p className="text-sm text-slate-800 dark:text-white">{recibo.cnpj_emitente || '—'}</p>
            )}
          </div>
        </div>

        {/* Card — Serviço Vinculado */}
        {servicoVinculado && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
            <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">Serviço Vinculado</h2>
            <Link href={`/servicos/${servicoVinculado.id}`} className="block hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 py-2 rounded-xl transition-colors">
              <div className="text-sm font-bold text-violet-700 dark:text-violet-400">
                {servicoVinculado.numero_os ? `OS nº ${servicoVinculado.numero_os}` : 'Serviço manual'}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {fmtData(servicoVinculado.data_servico)}
                {servicoVinculado.descricao ? ` · ${servicoVinculado.descricao}` : ''}
              </div>
            </Link>
            <div className="flex gap-2 pt-1">
              <button onClick={abrirModalEmail}
                className="px-3 py-1.5 text-xs font-bold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors">
                📧 Enviar por Email
              </button>
              <Link href={`/servicos/${servicoVinculado.id}?abrirTermo=1`}
                className="px-3 py-1.5 text-xs font-bold bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 rounded-lg hover:bg-teal-100 dark:hover:bg-teal-500/20 transition-colors">
                🛡️ Gerar Termo de Garantia
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Modal Excluir */}
      {modalExcluir && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Excluir Recibo</h2>
            <p className="text-sm text-slate-500">O recibo será arquivado no histórico de exclusões.</p>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Motivo (opcional)</label>
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalExcluir(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
              <button onClick={handleExcluir} disabled={excluindo}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors disabled:opacity-50">
                {excluindo ? 'Excluindo...' : 'Confirmar Exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Enviar Email */}
      {modalEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full space-y-4">
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Enviar Recibo por Email</h2>
            {emailSucesso ? (
              <>
                <p className="text-sm text-green-600 bg-green-50 dark:bg-green-500/10 rounded-xl p-3">
                  Email enviado com sucesso para {emailDestinatario}.
                </p>
                <button onClick={() => setModalEmail(false)}
                  className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  Fechar
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">O PDF do recibo será anexado automaticamente ao email.</p>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Destinatário</label>
                  <input type="email" value={emailDestinatario} onChange={e => setEmailDestinatario(e.target.value)}
                    placeholder="cliente@email.com"
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                </div>
                {emailErro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{emailErro}</p>}
                <div className="flex gap-3">
                  <button onClick={() => setModalEmail(false)}
                    className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handleEnviarEmail} disabled={enviandoEmail}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors disabled:opacity-50">
                    {enviandoEmail ? 'Enviando...' : 'Enviar'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
