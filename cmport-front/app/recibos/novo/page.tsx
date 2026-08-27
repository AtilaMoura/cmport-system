"use client"

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Condominio { id: number; nome: string; cnpj: string | null; }
interface Cliente { id: number; nome: string; tipo: string; apartamento: string | null; cpf_cnpj: string | null; auvo_id: number | null; }
interface ContaInter { id: number; cnpj: string; razao_social: string | null; ativo: boolean; }
interface OsDisponivel { servico_id: number | null; numero_os: string; data_servico: string | null; descricao_preview?: string; descricao_completa: string | null; task_id?: number; }
interface CategoriaFin { id: number; nome: string; grupo: string; }

type TipoRecibo = 'ENTRADA' | 'SAIDA';
type ContraparteTipo = 'CONDOMINIO' | 'MORADOR' | 'CLIENTE_EXTERNO' | 'AVULSO';

const TOTAL_STEPS = 6;
const STEP_LABELS = ['CNPJ', 'Tipo', 'Vínculo', 'Contraparte', 'OS', 'Financeiro'];

const CNPJ_OPCOES = [
  { label: 'CMPORT', value: '22761557000188' },
  { label: 'CMPORT TEC', value: '65756913000188' },
];

// Mesmo cálculo do backend (_calcular_valores_parcelas): divide igual, última parcela
// absorve o resto do arredondamento — usado como sugestão inicial editável.
function splitIgual(total: number, n: number): string[] {
  if (!total || n <= 1) return [total ? total.toFixed(2) : ''];
  const base = Math.round((total / n) * 100) / 100;
  const valores = Array(n - 1).fill(base);
  const ultima = Math.round((total - base * (n - 1)) * 100) / 100;
  return [...valores, ultima].map(v => v.toFixed(2));
}

function NovoReciboContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const now = new Date();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Step 1 — CNPJ emitente (qual empresa está emitindo o recibo)
  const [cnpjEmpresa, setCnpjEmpresa] = useState<string>(CNPJ_OPCOES[0].value);

  // Step 2 — Tipo
  const [tipoRecibo, setTipoRecibo] = useState<TipoRecibo>('ENTRADA');

  // Step 3 — Vínculo (condomínio ou fora do condomínio)
  const [temCondominio, setTemCondominio] = useState<boolean | null>(null);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [buscandoCond, setBuscandoCond] = useState(false);
  const [filtroCond, setFiltroCond] = useState('');
  const [condSelecionado, setCondSelecionado] = useState<Condominio | null>(null);

  // Step 4 — Contraparte
  const [contraparteTipo, setContraparteTipo] = useState<ContraparteTipo | null>(null);
  const [moradores, setMoradores] = useState<Cliente[]>([]);
  const [buscandoMoradores, setBuscandoMoradores] = useState(false);
  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [nomeAvulso, setNomeAvulso] = useState('');
  // Cadastro rápido de cliente externo (fora do condomínio)
  const [novoClienteNome, setNovoClienteNome] = useState('');
  const [novoClienteTipo, setNovoClienteTipo] = useState<'PF' | 'PJ'>('PF');
  const [novoClienteCpfCnpj, setNovoClienteCpfCnpj] = useState('');
  const [novoClienteAuvoId, setNovoClienteAuvoId] = useState('');
  const [mostrarCadastroCliente, setMostrarCadastroCliente] = useState(false);
  const [salvandoCliente, setSalvandoCliente] = useState(false);

  // Step 5 — OS (opcional, reaproveita OS existente no Auvo)
  const [ossDisponiveis, setOssDisponiveis] = useState<OsDisponivel[]>([]);
  const [buscandoOs, setBuscandoOs] = useState(false);
  const [osSelecionada, setOsSelecionada] = useState<OsDisponivel | null>(null);
  const [semOs, setSemOs] = useState(false);

  // Step 6 — Financeiro
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [dataEmissao, setDataEmissao] = useState(now.toISOString().slice(0, 10));
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacao, setObservacao] = useState('');
  const [contasInter, setContasInter] = useState<ContaInter[]>([]);
  const [contaInterSelecionada, setContaInterSelecionada] = useState<ContaInter | null>(null);
  const [bancos, setBancos] = useState<any[]>([]);
  const [bancoSelecionado, setBancoSelecionado] = useState<any | null>(null);
  const [gerarServico, setGerarServico] = useState(true);
  const [tipoServico, setTipoServico] = useState<'ASSISTENCIA' | 'MANUTENCAO'>('ASSISTENCIA');
  const [parcelas, setParcelas] = useState('1');
  const [valoresParcelas, setValoresParcelas] = useState<string[]>([]);
  const [parcelasCustomizadas, setParcelasCustomizadas] = useState(false);
  const [categorias, setCategorias] = useState<CategoriaFin[]>([]);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);

  // Pré-seleciona via query params (vindo da página do condomínio)
  useEffect(() => {
    const condId = searchParams.get('condominio_id');
    const clienteId = searchParams.get('cliente_id');
    if (condId) {
      api.get(`/condominios/${condId}`).then(r => {
        setTemCondominio(true);
        setCondSelecionado(r.data);
        setStep(4);
      }).catch(() => {});
    }
    if (clienteId) {
      api.get(`/clientes/${clienteId}`).then(r => {
        setClienteSelecionado(r.data);
        setContraparteTipo(r.data.condominio_id ? 'MORADOR' : 'CLIENTE_EXTERNO');
        setStep(5);
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega condomínios ativos (Step 3)
  useEffect(() => {
    if (step !== 3 || !temCondominio) return;
    setBuscandoCond(true);
    api.get('/condominios?ativo=true&limit=700').then(r => setCondominios(r.data)).catch(() => setCondominios([])).finally(() => setBuscandoCond(false));
  }, [step, temCondominio]);

  // Carrega moradores do condomínio selecionado ou clientes externos (Step 4)
  useEffect(() => {
    if (step !== 4) return;
    if (temCondominio && condSelecionado) {
      setBuscandoMoradores(true);
      api.get('/clientes', { params: { condominio_id: condSelecionado.id, apenas_ativos: true } })
        .then(r => setMoradores(r.data))
        .catch(() => setMoradores([]))
        .finally(() => setBuscandoMoradores(false));
    } else if (temCondominio === false) {
      setBuscandoMoradores(true);
      api.get('/clientes', { params: { sem_condominio: true, apenas_ativos: true } })
        .then(r => setMoradores(r.data))
        .catch(() => setMoradores([]))
        .finally(() => setBuscandoMoradores(false));
    }
  }, [step, temCondominio, condSelecionado]);

  // Busca OS disponíveis pra reaproveitar (Step 5)
  useEffect(() => {
    if (step !== 5) return;
    const condId = temCondominio ? condSelecionado?.id : undefined;
    const cliId = !temCondominio && contraparteTipo === 'CLIENTE_EXTERNO' ? clienteSelecionado?.id : undefined;
    if (!condId && !cliId) { setOssDisponiveis([]); return; }
    setBuscandoOs(true);
    api.get('/recibos/buscar-os', { params: { condominio_id: condId, cliente_id: cliId } })
      .then(r => setOssDisponiveis(r.data?.lista ?? []))
      .catch(() => setOssDisponiveis([]))
      .finally(() => setBuscandoOs(false));
  }, [step, temCondominio, condSelecionado, contraparteTipo, clienteSelecionado]);

  // Carrega contas Inter e Bancos (Step 6)
  useEffect(() => {
    if (step !== 6) return;
    api.get('/configuracoes/inter').then(r => setContasInter((r.data ?? []).filter((c: ContaInter) => c.ativo))).catch(() => setContasInter([]));
    api.get('/configuracoes/bancos').then(r => setBancos((r.data ?? []).filter((b: any) => b.ativo))).catch(() => setBancos([]));
  }, [step]);

  // Carrega categorias de despesa/fornecedor pra SAIDA (Step 6)
  useEffect(() => {
    if (step !== 6 || tipoRecibo !== 'SAIDA') return;
    api.get('/categorias-financeiras/', { params: { ativo: true } })
      .then(r => setCategorias((r.data ?? []).filter((c: CategoriaFin) => c.grupo === 'DESPESA' || c.grupo === 'FORNECEDOR')))
      .catch(() => setCategorias([]));
  }, [step, tipoRecibo]);

  // Recalcula o split igual quando o número de parcelas muda (sempre) ou quando o valor
  // muda e o usuário ainda não customizou manualmente nenhuma parcela.
  useEffect(() => {
    const n = Math.max(1, parseInt(parcelas, 10) || 1);
    setValoresParcelas(prev => {
      if (!parcelasCustomizadas || prev.length !== n) return splitIgual(Number(valor), n);
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcelas, valor]);

  const dividirIgualmente = () => {
    const n = Math.max(1, parseInt(parcelas, 10) || 1);
    setValoresParcelas(splitIgual(Number(valor), n));
    setParcelasCustomizadas(false);
  };

  const alterarValorParcela = (index: number, novoValor: string) => {
    setValoresParcelas(prev => prev.map((v, i) => (i === index ? novoValor : v)));
    setParcelasCustomizadas(true);
  };

  const somaParcelas = valoresParcelas.reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const parcelasBatem = Math.abs(somaParcelas - Number(valor || 0)) < 0.01;

  const condsFiltrados = condominios.filter(c => !filtroCond || c.nome.toLowerCase().includes(filtroCond.toLowerCase()));

  const cadastrarClienteExterno = async () => {
    if (!novoClienteNome) { setErro('Informe o nome do cliente.'); return; }
    setSalvandoCliente(true); setErro(null);
    try {
      const r = await api.post('/clientes', {
        condominio_id: null,
        nome: novoClienteNome,
        tipo: novoClienteTipo,
        cpf_cnpj: novoClienteCpfCnpj || null,
        auvo_id: novoClienteAuvoId ? Number(novoClienteAuvoId) : null,
      });
      setClienteSelecionado(r.data);
      setContraparteTipo('CLIENTE_EXTERNO');
      setMostrarCadastroCliente(false);
      setStep(5);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao cadastrar cliente.');
    } finally { setSalvandoCliente(false); }
  };

  const selecionarOs = (os: OsDisponivel) => {
    setOsSelecionada(os);
    setSemOs(false);
    if (os.descricao_completa) setDescricao(os.descricao_completa);
    setStep(6);
  };

  const pularOs = () => {
    setOsSelecionada(null);
    setSemOs(true);
    setStep(6);
  };

  const confirmar = async () => {
    if (!descricao || !valor) { setErro('Preencha descrição e valor.'); return; }
    if (tipoRecibo === 'SAIDA' && !categoriaId) { setErro('Selecione a categoria da despesa.'); return; }
    const nParcelas = Math.max(1, parseInt(parcelas, 10) || 1);
    if (nParcelas > 1 && !parcelasBatem) { setErro('A soma das parcelas precisa bater com o valor total.'); return; }
    setLoading(true); setErro(null);
    try {
      const contraparteNome = clienteSelecionado?.nome || nomeAvulso || condSelecionado?.nome;
      const cnpjCliente = contraparteTipo === 'CONDOMINIO' ? (condSelecionado?.cnpj ?? null) : (clienteSelecionado?.cpf_cnpj ?? null);
      await api.post('/recibos', {
        tipo: tipoRecibo,
        cliente_id: clienteSelecionado?.id ?? null,
        condominio_id: temCondominio ? (condSelecionado?.id ?? null) : null,
        cliente_nome_avulso: contraparteTipo === 'AVULSO' ? nomeAvulso : (contraparteTipo === 'CONDOMINIO' ? contraparteNome : null),
        configuracao_inter_id: contaInterSelecionada?.id ?? null,
        cnpj_emitente: cnpjEmpresa,
        banco_id: bancoSelecionado?.id ?? null,
        cnpj_cliente: cnpjCliente,
        descricao_servico: descricao,
        valor: Number(valor),
        data_emissao: dataEmissao,
        data_vencimento: dataVencimento || null,
        observacao: observacao || null,
        gerar_servico: tipoRecibo === 'ENTRADA' ? gerarServico : false,
        tipo_servico: tipoServico,
        numero_os: osSelecionada?.numero_os ?? null,
        data_servico: osSelecionada?.data_servico ?? null,
        parcelas: nParcelas,
        valores_parcelas: nParcelas > 1 ? valoresParcelas.map(Number) : null,
        categoria_id: tipoRecibo === 'SAIDA' ? categoriaId : null,
      });
      router.push('/recibos');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao criar recibo.');
    } finally { setLoading(false); }
  };

  const fmtValor = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const nomeContraparte = clienteSelecionado?.nome || nomeAvulso || (contraparteTipo === 'CONDOMINIO' ? condSelecionado?.nome : '');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/recibos" className="text-slate-500 hover:text-violet-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Novo Recibo</h1>
              <p className="text-xs text-slate-500">Passo {step} de {TOTAL_STEPS}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">

          {/* Indicador de steps */}
          <div className="flex items-center gap-2 mb-6">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1;
              return (
                <div key={n} className="flex items-center gap-2 flex-1">
                  <div className="flex-1 flex flex-col items-center gap-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                      n < step ? 'bg-violet-600 text-white' : n === step ? 'bg-violet-600 text-white ring-4 ring-violet-100 dark:ring-violet-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}>{n < step ? '✓' : n}</div>
                    <span className={`text-[10px] font-semibold ${n === step ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`}>{label}</span>
                  </div>
                  {i < STEP_LABELS.length - 1 && <div className={`h-0.5 w-8 mb-4 ${n < step ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                </div>
              );
            })}
          </div>

          {/* ── STEP 1 — CNPJ emitente ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">Qual empresa está emitindo?</h2>
              <p className="text-sm text-slate-500">Define o CNPJ do recibo — precisa ser escolhido explicitamente pra aparecer certo no Fluxo Financeiro depois.</p>
              <div className="grid grid-cols-2 gap-3">
                {CNPJ_OPCOES.map(o => (
                  <button key={o.value} type="button" onClick={() => { setCnpjEmpresa(o.value); setStep(2); }}
                    className={`p-5 rounded-2xl border-2 text-left transition-all ${cnpjEmpresa === o.value ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'}`}>
                    <div className="font-black text-slate-900 dark:text-white">{o.label}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP 2 — Tipo ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">Tipo do Recibo</h2>
              <p className="text-sm text-slate-500">O recibo é uma entrada (cliente pagou a CMPort) ou uma saída (CMPort pagou um subcontratado)?</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => { setTipoRecibo('ENTRADA'); setStep(3); }}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${tipoRecibo === 'ENTRADA' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300'}`}>
                  <div className="text-2xl mb-1">⬇️</div>
                  <div className="font-black text-slate-900 dark:text-white">Entrada</div>
                  <div className="text-xs text-slate-500 mt-1">Cliente pagou a CMPort</div>
                </button>
                <button type="button" onClick={() => { setTipoRecibo('SAIDA'); setStep(3); }}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${tipoRecibo === 'SAIDA' ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'}`}>
                  <div className="text-2xl mb-1">⬆️</div>
                  <div className="font-black text-slate-900 dark:text-white">Saída</div>
                  <div className="text-xs text-slate-500 mt-1">CMPort pagou um subcontratado</div>
                </button>
              </div>
              <button onClick={() => setStep(1)} className="text-sm font-bold text-slate-500 hover:text-violet-600 transition-colors">← Voltar</button>
            </div>
          )}

          {/* ── STEP 3 — Vínculo (condomínio ou fora) ── */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">O serviço tem um condomínio?</h2>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => { setTemCondominio(true); setCondSelecionado(null); }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${temCondominio === true ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'}`}>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">🏢 Sim, tem condomínio</div>
                </button>
                <button type="button" onClick={() => { setTemCondominio(false); setCondSelecionado(null); setContraparteTipo(null); setStep(4); }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${temCondominio === false ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'}`}>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">🏠 Fora do condomínio (PF/comércio)</div>
                </button>
              </div>

              {temCondominio && (
                <div className="space-y-3 pt-2">
                  <input type="text" value={filtroCond} onChange={e => setFiltroCond(e.target.value)}
                    placeholder="Buscar condomínio..." autoFocus
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                  {buscandoCond ? (
                    <div className="text-slate-400 text-sm animate-pulse text-center py-4">Carregando...</div>
                  ) : (
                    <div className="max-h-72 overflow-y-auto space-y-1.5">
                      {condsFiltrados.slice(0, 50).map(c => (
                        <button key={c.id} type="button" onClick={() => { setCondSelecionado(c); setStep(4); }}
                          className="w-full text-left px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all text-sm font-semibold text-slate-800 dark:text-white">
                          {c.nome}
                        </button>
                      ))}
                      {condsFiltrados.length === 0 && <p className="text-center text-slate-400 text-sm py-4">Nenhum condomínio encontrado.</p>}
                    </div>
                  )}
                </div>
              )}

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}
            </div>
          )}

          {/* ── STEP 4 — Contraparte ── */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">
                  {temCondominio ? 'Quem é a contraparte?' : 'Selecionar cliente'}
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {temCondominio ? `${condSelecionado?.nome} — quem paga (entrada) ou recebe (saída)` : 'Cliente fora do condomínio (PF/PJ)'}
                </p>
              </div>

              {temCondominio && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => { setContraparteTipo('CONDOMINIO'); setClienteSelecionado(null); }}
                    className={`p-3 rounded-xl border-2 text-sm font-bold transition-all ${contraparteTipo === 'CONDOMINIO' ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-violet-300'}`}>
                    🏢 O próprio condomínio
                  </button>
                  <button type="button" onClick={() => setContraparteTipo('MORADOR')}
                    className={`p-3 rounded-xl border-2 text-sm font-bold transition-all ${contraparteTipo === 'MORADOR' ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-violet-300'}`}>
                    👤 Morador cadastrado
                  </button>
                </div>
              )}

              {(contraparteTipo === 'MORADOR' || contraparteTipo === 'CLIENTE_EXTERNO' || (!temCondominio && contraparteTipo !== 'AVULSO')) && (
                <>
                  {buscandoMoradores ? (
                    <div className="text-slate-400 text-sm animate-pulse text-center py-4">Carregando...</div>
                  ) : moradores.length === 0 ? (
                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-400">
                      Nenhum cliente cadastrado{temCondominio ? ' neste condomínio' : ''}.
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {moradores.map(m => (
                        <button key={m.id} type="button" onClick={() => { setClienteSelecionado(m); setContraparteTipo(temCondominio ? 'MORADOR' : 'CLIENTE_EXTERNO'); }}
                          className={`w-full text-left px-4 py-3 border-2 rounded-xl transition-all ${
                            clienteSelecionado?.id === m.id ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                          }`}>
                          <div className="flex items-center gap-2">
                            <span className="text-base">{m.tipo === 'PJ' ? '🏢' : '👤'}</span>
                            <div>
                              <div className="font-bold text-sm text-slate-900 dark:text-white">{m.nome}</div>
                              <div className="text-xs text-slate-500">
                                {m.tipo}{m.apartamento ? ` · Apto ${m.apartamento}` : ''}{m.cpf_cnpj ? ` · ${m.cpf_cnpj}` : ''}{m.auvo_id ? ' · Auvo ✓' : ''}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {!temCondominio && (
                <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                  {!mostrarCadastroCliente ? (
                    <button type="button" onClick={() => setMostrarCadastroCliente(true)}
                      className="text-sm font-bold text-violet-600 hover:underline">+ Cadastrar novo cliente</button>
                  ) : (
                    <div className="space-y-3 border border-violet-200 dark:border-violet-700 rounded-xl p-4 bg-violet-50/50 dark:bg-violet-500/5">
                      <div className="flex gap-2">
                        {(['PF', 'PJ'] as const).map(t => (
                          <button key={t} type="button" onClick={() => setNovoClienteTipo(t)}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 ${novoClienteTipo === t ? 'border-violet-600 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}>
                            {t === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                          </button>
                        ))}
                      </div>
                      <input type="text" value={novoClienteNome} onChange={e => setNovoClienteNome(e.target.value)} placeholder="Nome"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                      <input type="text" value={novoClienteCpfCnpj} onChange={e => setNovoClienteCpfCnpj(e.target.value)} placeholder="CPF/CNPJ (opcional)"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                      <input type="number" value={novoClienteAuvoId} onChange={e => setNovoClienteAuvoId(e.target.value)} placeholder="ID do Customer no Auvo (opcional — habilita busca de OS)"
                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                      <button type="button" onClick={cadastrarClienteExterno} disabled={salvandoCliente}
                        className="w-full py-2.5 bg-violet-600 text-white rounded-lg font-bold text-sm hover:bg-violet-700 disabled:opacity-50">
                        {salvandoCliente ? 'Salvando...' : 'Cadastrar e continuar'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Opção avulso */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={contraparteTipo === 'AVULSO'}
                    onChange={e => { if (e.target.checked) { setContraparteTipo('AVULSO'); setClienteSelecionado(null); } else { setContraparteTipo(null); } }}
                    className="w-4 h-4 rounded accent-violet-600" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Digitar nome avulso (sem cadastro, sem OS)</span>
                </label>
                {contraparteTipo === 'AVULSO' && (
                  <input type="text" value={nomeAvulso} onChange={e => setNomeAvulso(e.target.value)}
                    placeholder="Nome do cliente" autoFocus
                    className="w-full px-4 py-3 border border-violet-400 dark:border-violet-600 ring-2 ring-violet-100 dark:ring-violet-500/20 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => { setErro(null); setStep(3); }} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">← Voltar</button>
                <button onClick={() => {
                  const contraparteOk = contraparteTipo === 'CONDOMINIO' || clienteSelecionado || (contraparteTipo === 'AVULSO' && nomeAvulso);
                  if (!contraparteOk) { setErro('Selecione a contraparte ou digite o nome.'); return; }
                  setErro(null); setStep(5);
                }} className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors">Próximo →</button>
              </div>
              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}
            </div>
          )}

          {/* ── STEP 5 — OS (opcional) ── */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">Vincular OS existente?</h2>
                <p className="text-sm text-slate-500 mt-0.5">Reaproveita descrição, data e número da OS já registrada no Auvo.</p>
              </div>

              {buscandoOs ? (
                <div className="text-slate-400 text-sm animate-pulse text-center py-4">Buscando OS...</div>
              ) : ossDisponiveis.length === 0 ? (
                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm text-slate-500">
                  Nenhuma OS disponível para reaproveitar. Pode seguir com preenchimento manual.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {ossDisponiveis.map(os => (
                    <button key={os.numero_os} type="button" onClick={() => selecionarOs(os)}
                      className={`w-full text-left px-4 py-3 border-2 rounded-xl transition-all ${
                        osSelecionada?.numero_os === os.numero_os ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                      }`}>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">OS nº {os.numero_os}</div>
                      <div className="text-xs text-slate-500">
                        {os.data_servico ? os.data_servico.split('-').reverse().join('/') : '—'}
                        {os.descricao_preview ? ` · ${os.descricao_preview}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => { setErro(null); setStep(4); }} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">← Voltar</button>
                <button onClick={pularOs} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">Sem OS →</button>
              </div>
            </div>
          )}

          {/* ── STEP 6 — Financeiro ── */}
          {step === 6 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">Dados Financeiros</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {temCondominio ? condSelecionado?.nome + ' · ' : ''}{nomeContraparte}
                  {clienteSelecionado?.apartamento ? ` · Apto ${clienteSelecionado.apartamento}` : ''}
                  {osSelecionada ? ` · OS nº ${osSelecionada.numero_os}` : ''}
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Descrição do Serviço *</label>
                <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} autoFocus
                  placeholder="Ex: Serviço de manutenção elétrica no apartamento..."
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Valor (R$) *</label>
                  <input type="number" step="0.01" min="0" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00"
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Data de Emissão *</label>
                  <input type="date" value={dataEmissao} onChange={e => setDataEmissao(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Vencimento (opcional)</label>
                  <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Parcelas</label>
                  <input type="number" min="1" step="1" value={parcelas} onChange={e => setParcelas(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                </div>
              </div>
              {Number(parcelas) > 1 && valor && (
                <div className={`rounded-xl border p-4 space-y-2 -mt-2 ${parcelasBatem ? 'border-slate-200 dark:border-slate-700' : 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-500/5'}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Valor de cada parcela</p>
                    <button type="button" onClick={dividirIgualmente}
                      className="text-xs font-bold text-violet-600 hover:underline">Dividir igualmente</button>
                  </div>
                  <div className="space-y-1.5">
                    {valoresParcelas.map((v, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-16 shrink-0">Parcela {i + 1}</span>
                        <input type="number" step="0.01" min="0" value={v}
                          onChange={e => alterarValorParcela(i, e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                      </div>
                    ))}
                  </div>
                  <p className={`text-xs font-semibold ${parcelasBatem ? 'text-slate-500' : 'text-red-600 dark:text-red-400'}`}>
                    Soma: {fmtValor(somaParcelas)} {parcelasBatem ? '✓ bate com o valor total' : `— precisa bater com ${fmtValor(Number(valor))}`}
                  </p>
                  <p className="text-xs text-slate-400">Vencimentos a cada 30 dias a partir de {dataVencimento ? 'vencimento informado' : 'data de emissão'}.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Observação (opcional)</label>
                <input type="text" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Informações adicionais"
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Conta Bancária (Banco)</label>
                <div className="flex flex-wrap gap-2">
                  {bancos.map(b => (
                    <button key={b.id} type="button" onClick={() => {
                      setBancoSelecionado(b);
                      if (b.configuracao_inter_id) {
                        const matchingInter = contasInter.find(c => c.id === b.configuracao_inter_id);
                        if (matchingInter) setContaInterSelecionada(matchingInter);
                      } else {
                        setContaInterSelecionada(null);
                      }
                    }}
                      className={`px-3 py-2 rounded-lg text-xs font-bold border-2 transition-all ${
                        bancoSelecionado?.id === b.id ? 'border-violet-600 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-violet-300'
                      }`}>
                      {b.nome} ({b.razao_social_titular}){b.agencia ? ` — Ag ${b.agencia} / CC ${b.conta_corrente}` : ''}
                    </button>
                  ))}
                  {bancos.length === 0 && <p className="text-xs text-slate-400">Nenhum banco cadastrado.</p>}
                </div>
              </div>

              {/* ENTRADA: gera serviço opcionalmente — editável, default marcado, mesmo com OS selecionada.
                  SAIDA: nunca gera serviço — exige categoria pra lançar despesa quando marcado como pago. */}
              {tipoRecibo === 'ENTRADA' && (
                <div className={`border rounded-xl p-4 space-y-3 transition-colors ${gerarServico ? 'border-violet-400 dark:border-violet-600 bg-violet-50/50 dark:bg-violet-500/5' : 'border-slate-200 dark:border-slate-700'}`}>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={gerarServico}
                      onChange={e => setGerarServico(e.target.checked)}
                      className="w-4 h-4 rounded accent-violet-600"
                    />
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {osSelecionada ? `Vincular à OS nº ${osSelecionada.numero_os} (gerar/reaproveitar serviço)` : 'Gerar serviço vinculado a este recibo'}
                    </span>
                  </label>
                  {gerarServico && !osSelecionada && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Tipo de Serviço</p>
                      <div className="flex gap-2">
                        {(['ASSISTENCIA', 'MANUTENCAO'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTipoServico(t)}
                            className={`flex-1 py-2.5 rounded-lg text-sm font-bold border-2 transition-all ${
                              tipoServico === t
                                ? 'border-violet-600 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-violet-300'
                            }`}
                          >
                            {t === 'ASSISTENCIA' ? 'Assistência' : 'Manutenção'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tipoRecibo === 'SAIDA' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Categoria da Despesa *</label>
                  <select
                    value={categoriaId ?? ''}
                    onChange={e => setCategoriaId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="">Selecione...</option>
                    {categorias.map(c => (
                      <option key={c.id} value={c.id}>{c.nome} ({c.grupo === 'FORNECEDOR' ? 'Fornecedor' : 'Despesa'})</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Não gera serviço. A despesa é lançada no Fluxo Financeiro quando a parcela for marcada como paga.</p>
                </div>
              )}

              {valor && descricao && (
                <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700 rounded-2xl p-4">
                  <div className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-2">Resumo</div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <div><span className="font-semibold">Tipo:</span> {tipoRecibo === 'ENTRADA' ? 'Entrada' : 'Saída'}</div>
                    <div><span className="font-semibold">Contraparte:</span> {nomeContraparte}</div>
                    {clienteSelecionado?.apartamento && <div><span className="font-semibold">Apto:</span> {clienteSelecionado.apartamento}</div>}
                    <div><span className="font-semibold">Serviço:</span> {descricao}</div>
                    <div><span className="font-semibold">Valor:</span> {fmtValor(Number(valor))}</div>
                    {Number(parcelas) > 1 && (
                      <div><span className="font-semibold">Parcelas:</span> {valoresParcelas.map(v => fmtValor(Number(v) || 0)).join(' + ')}</div>
                    )}
                    {osSelecionada && tipoRecibo === 'ENTRADA' && gerarServico && (
                      <div className="pt-1 mt-1 border-t border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-400 font-semibold">
                        OS nº {osSelecionada.numero_os} será reaproveitada
                      </div>
                    )}
                    {osSelecionada && tipoRecibo === 'ENTRADA' && !gerarServico && (
                      <div className="pt-1 mt-1 border-t border-violet-200 dark:border-violet-700 text-slate-500 font-semibold">
                        OS nº {osSelecionada.numero_os} não será vinculada — nenhum serviço será criado
                      </div>
                    )}
                    {!osSelecionada && tipoRecibo === 'ENTRADA' && gerarServico && (
                      <div className="pt-1 mt-1 border-t border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-400 font-semibold">
                        Serviço de {tipoServico === 'ASSISTENCIA' ? 'Assistência' : 'Manutenção'} será criado automaticamente
                      </div>
                    )}
                    {tipoRecibo === 'SAIDA' && osSelecionada && (
                      <div className="pt-1 mt-1 border-t border-violet-200 dark:border-violet-700 text-slate-500 font-semibold">
                        OS nº {osSelecionada.numero_os} não gera vínculo — SAÍDA nunca cria serviço
                      </div>
                    )}
                    {tipoRecibo === 'SAIDA' && categoriaId && (
                      <div className="pt-1 mt-1 border-t border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-400 font-semibold">
                        Despesa em {categorias.find(c => c.id === categoriaId)?.nome} ao marcar como pago
                      </div>
                    )}
                  </div>
                </div>
              )}

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <div className="flex gap-3">
                <button onClick={() => { setErro(null); setStep(5); }} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">← Voltar</button>
                <button onClick={confirmar} disabled={loading || (Number(parcelas) > 1 && !parcelasBatem)}
                  className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-lg shadow-violet-600/20">
                  {loading ? 'Salvando...' : '✓ Criar Recibo'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function NovoReciboPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <NovoReciboContent />
    </Suspense>
  );
}
