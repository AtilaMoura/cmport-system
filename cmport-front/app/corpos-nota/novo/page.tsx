"use client"

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface CondPendente {
  condominio_id: number;
  nome: string;
  data_inicio_contrato: string | null;
  valor_fixo_mensal: number | null;
  dia_vencimento_padrao: number | null;
  descricao_padrao_servico: string | null;
}

interface OSItem {
  servico_id: number;
  numero_os: string | null;
  data_servico: string | null;
  descricao_preview: string;
  descricao_completa: string | null;
}

interface OSResultado {
  lista: OSItem[];
  preenchimento_manual: boolean;
}

const LABELS_STEP = ['Tipo', 'Condomínio', 'Ordem de Serviço', 'Dados', 'Confirmar'];
const TOTAL_STEPS = 5;

function StepIndicator({ atual }: { atual: number }) {
  return (
    <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
      {LABELS_STEP.map((label, idx) => {
        const n = idx + 1;
        const concluido = n < atual;
        const ativo = n === atual;
        return (
          <div key={n} className="flex items-center gap-1 shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                concluido ? 'bg-violet-600 text-white' :
                ativo    ? 'bg-violet-600 text-white ring-4 ring-violet-100 dark:ring-violet-500/20' :
                           'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                {concluido ? '✓' : n}
              </div>
              <span className={`text-[10px] font-semibold whitespace-nowrap ${
                ativo ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'
              }`}>{label}</span>
            </div>
            {n < TOTAL_STEPS && (
              <div className={`h-0.5 w-6 sm:w-10 mb-4 shrink-0 ${n < atual ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function NovoCorpoNotaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const now = new Date();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Step 1 — Tipo + Período
  const [tipoNota, setTipoNota] = useState('MANUTENCAO');
  const [mes, setMes] = useState(() => {
    const p = searchParams.get('mes');
    return p ? Number(p) : now.getMonth() + 1;
  });
  const [ano, setAno] = useState(() => {
    const p = searchParams.get('ano');
    return p ? Number(p) : now.getFullYear();
  });

  // Step 2 — Condomínio
  const [condsPendentes, setCondsPendentes] = useState<CondPendente[]>([]);
  const [buscandoConds, setBuscandoConds] = useState(false);
  const [condSelecionado, setCondSelecionado] = useState<CondPendente | null>(null);
  const [filtroCond, setFiltroCond] = useState('');

  // Step 3 — OS
  const [osResultado, setOsResultado] = useState<OSResultado | null>(null);
  const [buscandoOS, setBuscandoOS] = useState(false);
  const [osSelecionada, setOsSelecionada] = useState<OSItem | null>(null);
  const [servicoId, setServicoId] = useState<number | null>(null);

  // Step 4 — Dados financeiros
  const [numeroOs, setNumeroOs] = useState('');
  const [dataServico, setDataServico] = useState('');
  const [descricaoServico, setDescricaoServico] = useState('');
  const [valorBruto, setValorBruto] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacoes, setObservacoes] = useState('');

  // Step 5 — Preview
  const [preview, setPreview] = useState<{
    conteudo_gerado: string;
    impostos_calculados: { valor_liquido: number; percentual_iss?: number } | null;
  } | null>(null);
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [proximoNumero, setProximoNumero] = useState<string | null>(null);

  const buscarProximoNumero = async (tipo: string, anoRef: number) => {
    try {
      const r = await api.get('/corpos-nota/proximo-numero', { params: { tipo_nota: tipo, ano: anoRef } });
      setProximoNumero(r.data.numero_referencia);
    } catch {
      setProximoNumero(null);
    }
  };

  const buscarCondominios = async (tipoRef: string, anoRef: number, mesRef: number) => {
    setBuscandoConds(true);
    setCondsPendentes([]);
    setCondSelecionado(null);
    setFiltroCond('');
    try {
      const r = await api.get('/corpos-nota/condominios-pendentes', {
        params: { tipo_nota: tipoRef, ano: anoRef, mes: mesRef },
      });
      setCondsPendentes(r.data);
    } catch {
      setCondsPendentes([]);
    } finally {
      setBuscandoConds(false);
    }
  };

  // Re-busca condomínios quando estiver no step 2 e mudar período ou tipo
  useEffect(() => {
    if (step === 2) {
      buscarCondominios(tipoNota, ano, mes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mes, ano, tipoNota]);

  // ── Step 1 → 2 ──────────────────────────────────────────────────────────────
  const avancarStep1 = () => {
    setErro(null);
    buscarProximoNumero(tipoNota, ano);
    setStep(2);
  };

  // ── Step 2 → 3: condomínio selecionado, busca OSs ────────────────────────────
  const avancarStep2 = async (cond: CondPendente) => {
    setCondSelecionado(cond);
    setErro(null);

    if (cond.descricao_padrao_servico) setDescricaoServico(cond.descricao_padrao_servico);
    if (cond.valor_fixo_mensal) setValorBruto(String(cond.valor_fixo_mensal));
    if (cond.dia_vencimento_padrao) {
      const dia = String(cond.dia_vencimento_padrao).padStart(2, '0');
      const mesStr = String(mes).padStart(2, '0');
      setDataVencimento(`${ano}-${mesStr}-${dia}`);
    }

    setBuscandoOS(true);
    setOsResultado(null);
    setOsSelecionada(null);
    setServicoId(null);
    try {
      const r = await api.get('/corpos-nota/buscar-os', {
        params: { condominio_id: cond.condominio_id, mes, ano },
      });
      setOsResultado(r.data);
      if (r.data.lista?.length === 1) {
        const os = r.data.lista[0];
        setOsSelecionada(os);
        setServicoId(os.servico_id);
        if (os.numero_os) setNumeroOs(os.numero_os);
        if (os.data_servico) setDataServico(os.data_servico);
        if (os.descricao_completa && !descricaoServico) setDescricaoServico(os.descricao_completa);
      }
    } catch {
      setOsResultado({ lista: [], preenchimento_manual: true });
    } finally {
      setBuscandoOS(false);
    }
    setStep(3);
  };

  // ── Step 3 → 4 ──────────────────────────────────────────────────────────────
  const selecionarOS = (os: OSItem) => {
    setOsSelecionada(os);
    setServicoId(os.servico_id);
    if (os.numero_os) setNumeroOs(os.numero_os);
    if (os.data_servico) setDataServico(os.data_servico);
    if (os.descricao_completa) setDescricaoServico(os.descricao_completa);
  };

  const avancarStep3 = () => {
    setErro(null);
    setStep(4);
  };

  // ── Step 4 → 5: gera preview ─────────────────────────────────────────────────
  const gerarPreview = async () => {
    if (!valorBruto || !dataVencimento || !descricaoServico) {
      setErro('Preencha valor bruto, data de vencimento e descrição do serviço.');
      return;
    }
    setErro(null);
    setGerandoPreview(true);
    try {
      const mesRef = `${String(mes).padStart(2, '0')}/${ano}`;
      const r = await api.post('/corpos-nota/preview', {
        condominio_id: condSelecionado!.condominio_id,
        tipo_nota: tipoNota,
        mes_referencia: mesRef,
        numero_os: numeroOs || null,
        data_servico: dataServico || null,
        descricao_servico: descricaoServico,
        valor_bruto: Number(valorBruto),
        data_vencimento: dataVencimento,
        observacoes: observacoes || null,
      });
      setPreview(r.data);
      setStep(5);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao gerar preview.');
    } finally {
      setGerandoPreview(false);
    }
  };

  // ── Step 5: confirma criação ─────────────────────────────────────────────────
  const confirmar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await api.post('/corpos-nota', {
        condominio_id: condSelecionado!.condominio_id,
        tipo_nota: tipoNota,
        mes,
        ano,
        servico_id: servicoId || null,
        numero_os: numeroOs || null,
        data_servico: dataServico || null,
        descricao_servico: descricaoServico,
        valor_bruto: Number(valorBruto),
        data_vencimento: dataVencimento,
        observacoes: observacoes || null,
      });
      router.push(`/corpos-nota/${r.data.id}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao criar corpo de nota.');
    } finally {
      setLoading(false);
    }
  };

  const voltar = () => { setErro(null); setStep(s => s - 1); };

  const fmtValor = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const condsFiltrados = condsPendentes.filter(c =>
    filtroCond === '' || c.nome.toLowerCase().includes(filtroCond.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <div className="flex items-center gap-3">
            <Link href="/corpos-nota" className="text-slate-500 hover:text-violet-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Novo Corpo de Nota
              </h1>
              <p className="text-xs text-slate-500">Passo {step} de {TOTAL_STEPS}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
          <StepIndicator atual={step} />

          {/* ── STEP 1 — Tipo de nota + Período ──────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">Tipo de Nota</h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setTipoNota('MANUTENCAO')}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${
                    tipoNota === 'MANUTENCAO'
                      ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                  }`}
                >
                  <div className="text-2xl mb-2">🛠️</div>
                  <div className={`font-bold text-sm ${tipoNota === 'MANUTENCAO' ? 'text-violet-700 dark:text-violet-400' : 'text-slate-800 dark:text-white'}`}>
                    Manutenção
                  </div>
                  <div className="text-xs text-slate-500 mt-1">Serviços mensais de manutenção predial</div>
                </button>

                <div className="p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 opacity-50 cursor-not-allowed">
                  <div className="text-2xl mb-2">🔧</div>
                  <div className="font-bold text-sm text-slate-500">Serviço</div>
                  <div className="text-xs text-slate-400 mt-1">Em breve</div>
                </div>

                <div className="p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 opacity-50 cursor-not-allowed">
                  <div className="text-2xl mb-2">📦</div>
                  <div className="font-bold text-sm text-slate-500">Produto</div>
                  <div className="text-xs text-slate-400 mt-1">Em breve</div>
                </div>
              </div>

              {/* Período de referência */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                  Período de Referência
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <select
                    value={mes}
                    onChange={e => setMes(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {MESES_NOMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                  <input
                    type="number"
                    value={ano}
                    onChange={e => setAno(Number(e.target.value))}
                    min={2020}
                    max={2099}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <button
                onClick={avancarStep1}
                className="w-full py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors"
              >
                Próximo →
              </button>
            </div>
          )}

          {/* ── STEP 2 — Condomínio pendente ──────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-white">Selecionar Condomínio</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Com contrato ativo sem corpo em {MESES_NOMES[mes - 1]}/{ano}
                  </p>
                </div>
                {/* Alteração rápida de período */}
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={mes}
                    onChange={e => setMes(Number(e.target.value))}
                    className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {MESES_NOMES.map((m, i) => <option key={i + 1} value={i + 1}>{m.slice(0, 3)}</option>)}
                  </select>
                  <input
                    type="number"
                    value={ano}
                    onChange={e => setAno(Number(e.target.value))}
                    min={2020}
                    max={2099}
                    className="w-[5.5rem] px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Filtro por nome */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={filtroCond}
                  onChange={e => setFiltroCond(e.target.value)}
                  placeholder="Filtrar por nome do condomínio..."
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  autoFocus
                />
                {filtroCond && (
                  <button
                    onClick={() => setFiltroCond('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {buscandoConds ? (
                <div className="text-slate-400 text-sm animate-pulse py-8 text-center">Buscando condomínios pendentes...</div>
              ) : condsPendentes.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-3xl mb-3">✅</div>
                  <div className="font-semibold text-slate-700 dark:text-white mb-1">
                    Todos os condomínios já possuem corpo de nota em {MESES_NOMES[mes - 1]}/{ano}
                  </div>
                  <div className="text-sm text-slate-500">Ou não há contratos ativos cadastrados.</div>
                </div>
              ) : condsFiltrados.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  Nenhum condomínio encontrado para &quot;{filtroCond}&quot;
                </div>
              ) : (
                <>
                  <div className="text-xs text-slate-500 font-medium">
                    {condsFiltrados.length} de {condsPendentes.length} condomínio(s)
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {condsFiltrados.map(c => (
                      <button
                        key={c.condominio_id}
                        type="button"
                        onClick={() => avancarStep2(c)}
                        className="p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-400 dark:hover:border-violet-500 text-left transition-all group"
                      >
                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors">
                          {c.nome}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
                          {c.data_inicio_contrato && (
                            <span>Desde {c.data_inicio_contrato.slice(0, 7).split('-').reverse().join('/')}</span>
                          )}
                          {c.valor_fixo_mensal && (
                            <span className="text-violet-600 font-semibold">{fmtValor(c.valor_fixo_mensal)}</span>
                          )}
                          {c.dia_vencimento_padrao && (
                            <span>Vence dia {c.dia_vencimento_padrao}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="flex gap-3">
                <button onClick={voltar} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  ← Voltar
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3 — Ordem de Serviço ─────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">Ordem de Serviço</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {condSelecionado?.nome} · {MESES_NOMES[mes - 1]}/{ano}
                </p>
              </div>

              {buscandoOS && (
                <div className="text-slate-400 text-sm animate-pulse py-4 text-center">Buscando OSs do período...</div>
              )}

              {osResultado && !buscandoOS && (
                <>
                  {osResultado.lista.length === 0 ? (
                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                      <div className="font-bold text-slate-700 dark:text-slate-300 text-sm mb-1">Nenhuma OS sincronizada para este condomínio</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Digite o número da OS no campo abaixo e prossiga — os dados serão preenchidos manualmente no próximo passo.
                      </div>
                    </div>
                  ) : osResultado.lista.length === 1 ? (
                    <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800 rounded-xl p-4">
                      <div className="font-bold text-green-700 dark:text-green-400 text-sm mb-2">OS selecionada automaticamente</div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-white">
                        OS #{osResultado.lista[0].numero_os}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{osResultado.lista[0].descricao_preview}</div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                        {osResultado.lista.length} OSs encontradas — selecione uma:
                      </div>
                      {osResultado.lista.map(os => (
                        <button
                          key={os.numero_os ?? os.servico_id}
                          type="button"
                          onClick={() => selecionarOS(os)}
                          className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                            osSelecionada?.numero_os === os.numero_os
                              ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                              : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                          }`}
                        >
                          <div className="font-bold text-sm text-slate-900 dark:text-white">
                            OS #{os.numero_os ?? '—'}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 flex gap-3">
                            {os.data_servico && <span>{os.data_servico.split('-').reverse().join('/')}</span>}
                            <span>{os.descricao_preview}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  {osResultado?.lista.length === 0
                    ? 'Número da OS — digite para continuar'
                    : 'Número da OS (opcional)'}
                </label>
                <input
                  type="text"
                  value={numeroOs}
                  onChange={e => setNumeroOs(e.target.value)}
                  placeholder="Ex: 73787278"
                  className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white ${
                    osResultado?.lista.length === 0
                      ? 'border-violet-400 dark:border-violet-600 ring-2 ring-violet-100 dark:ring-violet-500/20'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                  autoFocus={osResultado?.lista.length === 0}
                />
                {osResultado?.lista.length === 0 && (
                  <p className="text-xs text-slate-500 mt-1">
                    Você pode prosseguir sem OS — os campos serão preenchidos no próximo passo.
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={voltar} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  ← Voltar
                </button>
                <button onClick={avancarStep3} className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors">
                  Próximo →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4 — Dados financeiros ────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">Dados do Corpo de Nota</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {condSelecionado?.nome} · {MESES_NOMES[mes - 1]}/{ano}
                  {condSelecionado?.valor_fixo_mensal
                    ? ` · Valor padrão: ${fmtValor(condSelecionado.valor_fixo_mensal)}`
                    : ''}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  Data do Serviço
                </label>
                <input
                  type="date"
                  value={dataServico}
                  onChange={e => setDataServico(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  Descrição do Serviço <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={descricaoServico}
                  onChange={e => setDescricaoServico(e.target.value)}
                  rows={3}
                  placeholder="Descreva os serviços prestados..."
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Valor Bruto (R$) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valorBruto}
                    onChange={e => setValorBruto(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Vencimento <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dataVencimento}
                    onChange={e => setDataVencimento(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Observações</label>
                <textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                />
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <div className="flex gap-3">
                <button onClick={voltar} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  ← Voltar
                </button>
                <button
                  onClick={gerarPreview}
                  disabled={gerandoPreview}
                  className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-50"
                >
                  {gerandoPreview ? 'Calculando...' : 'Prévia →'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 5 — Preview e confirmação ───────────────────────────────── */}
          {step === 5 && preview && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-800 dark:text-white">Confirmar Corpo de Nota</h2>
                {proximoNumero && (
                  <span className="px-3 py-1.5 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 text-xs font-black rounded-lg tracking-widest">
                    {proximoNumero}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">Valor Bruto</div>
                  <div className="text-xl font-black text-slate-900 dark:text-white">
                    {fmtValor(Number(valorBruto))}
                  </div>
                </div>
                <div className="bg-violet-50 dark:bg-violet-500/10 rounded-xl p-4">
                  <div className="text-xs text-violet-600 dark:text-violet-400 uppercase font-bold mb-1">Valor Líquido</div>
                  <div className="text-xl font-black text-violet-700 dark:text-violet-400">
                    {preview.impostos_calculados
                      ? fmtValor(preview.impostos_calculados.valor_liquido)
                      : '—'}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Corpo da Nota (prévia)
                </div>
                <pre className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                  {preview.conteudo_gerado}
                </pre>
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <div className="flex gap-3">
                <button onClick={voltar} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  ← Voltar
                </button>
                <button
                  onClick={confirmar}
                  disabled={loading}
                  className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-lg shadow-violet-600/20"
                >
                  {loading ? 'Criando...' : '✓ Confirmar e Criar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NovoCorpoNotaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">
        Carregando...
      </div>
    }>
      <NovoCorpoNotaContent />
    </Suspense>
  );
}
