"use client"

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface ConfiguracaoInter {
  id: number;
  cnpj: string;
  razao_social: string | null;
  tipo_nota: string;
  ativo: boolean;
}

interface CondPendente {
  condominio_id: number;
  nome: string;
  data_inicio_contrato: string | null;
  valor_fixo_mensal: number | null;
  dia_vencimento_padrao: number | null;
  descricao_padrao_servico: string | null;
}

interface OSItem {
  servico_id: number | null;
  numero_os: string | null;
  data_servico: string | null;
  descricao_preview: string;
  descricao_completa: string | null;
}

interface OSResultado {
  lista: OSItem[];
  preenchimento_manual: boolean;
}

interface OrcamentoItem {
  tipo: string;
  nome: string | null;
  descricao: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

interface Orcamento {
  id: number;
  auvo_public_id: number;
  observations: string | null;
  request_date: string | null;
  current_stage_description: string | null;
  total_services: number;
  total_products: number;
  gross_total_value: number;
  task_ids: number[];
  itens: OrcamentoItem[];
}

const LABELS_STEP = ['Conta', 'Condomínio', 'Origem', 'Dados', 'Confirmar'];
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

  // Step 1 — Conta Inter + Tipo + Período
  const [configuracaosInter, setConfiguracaosInter] = useState<ConfiguracaoInter[]>([]);
  const [cnpjSelecionado, setCnpjSelecionado] = useState<ConfiguracaoInter | null>(null);
  const [carregandoInter, setCarregandoInter] = useState(false);
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

  // Step 3 — OS / Orçamento / Manual
  const [abaOS, setAbaOS] = useState<'OS' | 'ORCAMENTO' | 'MANUAL'>('OS');
  const [osResultado, setOsResultado] = useState<OSResultado | null>(null);
  const [buscandoOS, setBuscandoOS] = useState(false);
  const [osSelecionada, setOsSelecionada] = useState<OSItem | null>(null);
  const [servicoId, setServicoId] = useState<number | null>(null);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [buscandoOrcamentos, setBuscandoOrcamentos] = useState(false);
  const [orcamentoSelecionado, setOrcamentoSelecionado] = useState<Orcamento | null>(null);

  // Step 4 — Dados financeiros
  const [numeroOs, setNumeroOs] = useState('');
  const [dataServico, setDataServico] = useState('');
  const [descricaoServico, setDescricaoServico] = useState('');
  const [valorBruto, setValorBruto] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacoes, setObservacoes] = useState('');
  // Campos específicos SERVIÇO
  const [dataServicoTexto, setDataServicoTexto] = useState('');
  const [descricaoGarantia, setDescricaoGarantia] = useState('');
  const [valorNotaProduto, setValorNotaProduto] = useState('');

  // Step 5 — Preview
  const [preview, setPreview] = useState<{
    conteudo_gerado: string;
    impostos_calculados: { valor_liquido: number; percentual_iss?: number } | null;
  } | null>(null);
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [proximoNumero, setProximoNumero] = useState<string | null>(null);

  // Carrega contas Inter na montagem
  useEffect(() => {
    const carregarInter = async () => {
      setCarregandoInter(true);
      try {
        const r = await api.get('/configuracoes/inter');
        const ativas = (r.data as ConfiguracaoInter[]).filter(c => c.ativo);
        setConfiguracaosInter(ativas);
        if (ativas.length === 1) setCnpjSelecionado(ativas[0]);
      } catch {
        setConfiguracaosInter([]);
      } finally {
        setCarregandoInter(false);
      }
    };
    carregarInter();
  }, []);

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
    if (!cnpjSelecionado) {
      setErro('Selecione uma conta (CNPJ) para continuar.');
      return;
    }
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

    // Inicia com aba OS por padrão e busca as OSs
    setAbaOS('OS');
    await buscarOSsParaCond(cond);
    setStep(3);
  };

  const buscarOSsParaCond = async (cond: CondPendente) => {
    setBuscandoOS(true);
    setOsResultado(null);
    setOsSelecionada(null);
    setServicoId(null);
    try {
      const r = await api.get('/corpos-nota/buscar-os', {
        params: { condominio_id: cond.condominio_id, mes, ano, tipo_nota: tipoNota },
      });
      setOsResultado(r.data);
      if (r.data.lista?.length === 1) {
        const os = r.data.lista[0];
        setOsSelecionada(os);
        setServicoId(os.servico_id);
        if (os.numero_os) setNumeroOs(os.numero_os);
        if (os.data_servico) {
          setDataServico(os.data_servico);
          if (tipoNota === 'SERVICO' && !dataServicoTexto) {
            setDataServicoTexto(os.data_servico.split('-').reverse().join('.'));
          }
        }
        if (os.descricao_completa && !descricaoServico) setDescricaoServico(os.descricao_completa);
      }
    } catch {
      setOsResultado({ lista: [], preenchimento_manual: true });
    } finally {
      setBuscandoOS(false);
    }
  };

  const buscarOrcamentos = async (condId: number) => {
    setBuscandoOrcamentos(true);
    setOrcamentos([]);
    try {
      const r = await api.get('/corpos-nota/buscar-orcamentos', {
        params: { condominio_id: condId },
      });
      setOrcamentos(r.data);
    } catch {
      setOrcamentos([]);
    } finally {
      setBuscandoOrcamentos(false);
    }
  };

  const onAbaChange = (aba: 'OS' | 'ORCAMENTO' | 'MANUAL') => {
    setAbaOS(aba);
    if (aba === 'ORCAMENTO' && condSelecionado && orcamentos.length === 0 && !buscandoOrcamentos) {
      buscarOrcamentos(condSelecionado.condominio_id);
    }
  };

  // ── Step 3 — selecionar OS ──────────────────────────────────────────────────
  const selecionarOS = (os: OSItem) => {
    setOsSelecionada(os);
    setServicoId(os.servico_id);
    if (os.numero_os) setNumeroOs(os.numero_os);
    if (os.data_servico) {
      setDataServico(os.data_servico);
      if (tipoNota === 'SERVICO') {
        setDataServicoTexto(os.data_servico.split('-').reverse().join('.'));
      }
    }
    if (os.descricao_completa) setDescricaoServico(os.descricao_completa);
    setOrcamentoSelecionado(null);
  };

  // ── Step 3 — selecionar Orçamento ──────────────────────────────────────────
  const selecionarOrcamento = (orc: Orcamento) => {
    setOrcamentoSelecionado(orc);
    setOsSelecionada(null);

    // Pré-preenche campos
    if (orc.task_ids.length > 0) {
      setNumeroOs(orc.task_ids.map(id => `OS nº ${id}`).join(' e '));
    }
    const descItens = orc.itens
      .filter(i => i.tipo === 'SERVICO')
      .map(i => i.nome || i.descricao || '')
      .filter(Boolean)
      .join(', ');
    if (descItens) setDescricaoServico(descItens);
    if (orc.total_services > 0) setValorBruto(String(orc.total_services));
    if (orc.request_date) {
      const dt = orc.request_date.split('-').reverse().join('.');
      setDataServicoTexto(dt);
    }
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
        data_servico_texto: tipoNota === 'SERVICO' ? (dataServicoTexto || null) : null,
        descricao_garantia: tipoNota === 'SERVICO' ? (descricaoGarantia || null) : null,
        valor_nota_produto: tipoNota === 'SERVICO' && valorNotaProduto ? Number(valorNotaProduto) : null,
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
        configuracao_inter_id: cnpjSelecionado?.id ?? null,
        orcamento_id: orcamentoSelecionado?.id ?? null,
        data_servico_texto: tipoNota === 'SERVICO' ? (dataServicoTexto || null) : null,
        descricao_garantia: tipoNota === 'SERVICO' ? (descricaoGarantia || null) : null,
        valor_nota_produto: tipoNota === 'SERVICO' && valorNotaProduto ? Number(valorNotaProduto) : null,
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

          {/* ── STEP 1 — Conta Inter + Tipo de nota + Período ──────────────── */}
          {step === 1 && (
            <div className="space-y-6">

              {/* Seleção de CNPJ */}
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white mb-1">Conta (CNPJ)</h2>
                <p className="text-sm text-slate-500 mb-3">Selecione qual conta emitirá o boleto</p>

                {carregandoInter ? (
                  <div className="text-slate-400 text-sm animate-pulse">Carregando contas...</div>
                ) : configuracaosInter.length === 0 ? (
                  <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-400">
                    Nenhuma conta Inter cadastrada. Configure em Configurações → Banco Inter.
                  </div>
                ) : configuracaosInter.length === 1 ? (
                  <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700 rounded-xl p-4">
                    <div className="font-bold text-violet-700 dark:text-violet-400 text-sm">
                      {configuracaosInter[0].razao_social || 'Conta Inter'}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{configuracaosInter[0].cnpj}</div>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {configuracaosInter.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCnpjSelecionado(c)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          cnpjSelecionado?.id === c.id
                            ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                        }`}
                      >
                        <div className={`font-bold text-sm ${cnpjSelecionado?.id === c.id ? 'text-violet-700 dark:text-violet-400' : 'text-slate-800 dark:text-white'}`}>
                          {c.razao_social || 'Conta Inter'}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{c.cnpj}</div>
                        {c.tipo_nota === 'PRODUTO' && (
                          <span className="mt-1 inline-block px-2 py-0.5 bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 text-xs rounded-full font-bold">Produto</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tipo de Nota */}
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white mb-3">Tipo de Nota</h2>
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

                  <button
                    type="button"
                    onClick={() => setTipoNota('SERVICO')}
                    className={`p-5 rounded-2xl border-2 text-left transition-all ${
                      tipoNota === 'SERVICO'
                        ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                    }`}
                  >
                    <div className="text-2xl mb-2">🔧</div>
                    <div className={`font-bold text-sm ${tipoNota === 'SERVICO' ? 'text-violet-700 dark:text-violet-400' : 'text-slate-800 dark:text-white'}`}>
                      Serviço
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Serviços executados sob demanda</div>
                  </button>

                  <div className="p-5 rounded-2xl border-2 border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 opacity-50 cursor-not-allowed">
                    <div className="text-2xl mb-2">📦</div>
                    <div className="font-bold text-sm text-slate-500">Produto</div>
                    <div className="text-xs text-slate-400 mt-1">Em breve</div>
                  </div>
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

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

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

          {/* ── STEP 3 — Origem: OS / Orçamento / Manual ─────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">
                  {tipoNota === 'SERVICO' ? 'Origem dos Dados' : 'Ordem de Serviço'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {condSelecionado?.nome} · {MESES_NOMES[mes - 1]}/{ano}
                </p>
              </div>

              {/* Abas — somente para SERVIÇO */}
              {tipoNota === 'SERVICO' && (
                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  {(['OS', 'ORCAMENTO', 'MANUAL'] as const).map(aba => (
                    <button
                      key={aba}
                      type="button"
                      onClick={() => onAbaChange(aba)}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                        abaOS === aba
                          ? 'bg-white dark:bg-slate-700 text-violet-700 dark:text-violet-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {aba === 'OS' ? 'Via OS' : aba === 'ORCAMENTO' ? 'Via Orçamento' : 'Manual'}
                    </button>
                  ))}
                </div>
              )}

              {/* Conteúdo da aba OS (ou único conteúdo para MANUTENCAO) */}
              {(tipoNota === 'MANUTENCAO' || abaOS === 'OS') && (
                <>
                  {buscandoOS && (
                    <div className="text-slate-400 text-sm animate-pulse py-4 text-center">Buscando OSs...</div>
                  )}

                  {osResultado && !buscandoOS && (
                    <>
                      {osResultado.lista.length === 0 ? (
                        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                          <div className="font-bold text-slate-700 dark:text-slate-300 text-sm mb-1">Nenhuma OS sincronizada para este condomínio</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Digite o número da OS no campo abaixo e prossiga.
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
                            {osResultado.lista.length} OSs encontradas — selecione {tipoNota === 'SERVICO' ? 'uma ou mais' : 'uma'}:
                          </div>
                          {osResultado.lista.map(os => (
                            <button
                              key={os.numero_os ?? String(os.servico_id)}
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

                  {tipoNota === 'MANUTENCAO' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                        {osResultado?.lista.length === 0 ? 'Número da OS — digite para continuar' : 'Número da OS (opcional)'}
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
                    </div>
                  )}
                </>
              )}

              {/* Aba Orçamento — somente SERVIÇO */}
              {tipoNota === 'SERVICO' && abaOS === 'ORCAMENTO' && (
                <div className="space-y-3">
                  {buscandoOrcamentos && (
                    <div className="text-slate-400 text-sm animate-pulse py-4 text-center">Buscando orçamentos...</div>
                  )}
                  {!buscandoOrcamentos && orcamentos.length === 0 && (
                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm text-slate-500">
                      Nenhum orçamento encontrado para este condomínio.
                    </div>
                  )}
                  {orcamentos.map(orc => (
                    <button
                      key={orc.id}
                      type="button"
                      onClick={() => selecionarOrcamento(orc)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        orcamentoSelecionado?.id === orc.id
                          ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                          : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          Orç. #{orc.auvo_public_id}
                        </div>
                        <div className="text-sm font-black text-violet-700 dark:text-violet-400">
                          {fmtValor(orc.total_services)}
                        </div>
                      </div>
                      {orc.observations && (
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2">{orc.observations}</div>
                      )}
                      <div className="text-xs text-slate-400 mt-1 flex gap-3">
                        {orc.request_date && <span>{orc.request_date.split('-').reverse().join('/')}</span>}
                        {orc.current_stage_description && <span>{orc.current_stage_description}</span>}
                        {orc.task_ids.length > 0 && <span>{orc.task_ids.length} OS(s)</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Aba Manual — somente SERVIÇO */}
              {tipoNota === 'SERVICO' && abaOS === 'MANUAL' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Número(s) da OS — texto livre
                  </label>
                  <input
                    type="text"
                    value={numeroOs}
                    onChange={e => setNumeroOs(e.target.value)}
                    placeholder="Ex: OS nº 73787278 e OS nº 74220219"
                    className="w-full px-4 py-3 border border-violet-400 dark:border-violet-600 ring-2 ring-violet-100 dark:ring-violet-500/20 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    autoFocus
                  />
                  <p className="text-xs text-slate-500 mt-1">Você pode digitar múltiplos números separados por &quot;e&quot;.</p>
                </div>
              )}

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

              {/* Data do Serviço — MANUTENCAO usa date picker; SERVIÇO usa texto livre */}
              {tipoNota === 'SERVICO' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Data(s) do Serviço (texto)
                  </label>
                  <input
                    type="text"
                    value={dataServicoTexto}
                    onChange={e => setDataServicoTexto(e.target.value)}
                    placeholder="Ex: 06.05.2026 e 07.05.2026"
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              ) : (
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
              )}

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

              {/* Campos extras para SERVIÇO */}
              {tipoNota === 'SERVICO' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                      Garantia (opcional)
                    </label>
                    <input
                      type="text"
                      value={descricaoGarantia}
                      onChange={e => setDescricaoGarantia(e.target.value)}
                      placeholder="Ex: 06 meses · Motor: 3 meses / Placa: 1 ano"
                      className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                      Valor da Nota de Produto (R$) — opcional
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={valorNotaProduto}
                      onChange={e => setValorNotaProduto(e.target.value)}
                      placeholder="0,00 — deixe em branco se não houver"
                      className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                    <p className="text-xs text-slate-500 mt-1">Preencha quando a nota de serviço vier acompanhada de uma nota de produto para o mesmo boleto.</p>
                  </div>
                </>
              )}

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

              {/* Conta selecionada */}
              {cnpjSelecionado && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Conta Inter</div>
                    <div className="font-semibold text-sm text-slate-800 dark:text-white">{cnpjSelecionado.razao_social || 'Conta Inter'}</div>
                    <div className="text-xs text-slate-500">{cnpjSelecionado.cnpj}</div>
                  </div>
                </div>
              )}

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
