"use client"

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Condominio { id: number; nome: string; cnpj: string | null; }
interface Cliente { id: number; nome: string; tipo: string; apartamento: string | null; cpf_cnpj: string | null; auvo_id: number | null; }
interface ContaInter { id: number; cnpj: string; razao_social: string | null; ativo: boolean; }
interface OsDisponivel { servico_id: number | null; numero_os: string; data_servico: string | null; descricao_preview?: string; descricao_completa: string | null; task_id?: number; }

type TipoRecibo = 'ENTRADA' | 'SAIDA';
type ContraparteTipo = 'CONDOMINIO' | 'MORADOR' | 'CLIENTE_EXTERNO' | 'AVULSO';

const TOTAL_STEPS = 5;
const STEP_LABELS = ['Tipo', 'Vínculo', 'Contraparte', 'OS', 'Financeiro'];

function NovoReciboContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const now = new Date();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Step 1 — Tipo
  const [tipoRecibo, setTipoRecibo] = useState<TipoRecibo>('ENTRADA');

  // Step 2 — Vínculo (condomínio ou fora do condomínio)
  const [temCondominio, setTemCondominio] = useState<boolean | null>(null);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [buscandoCond, setBuscandoCond] = useState(false);
  const [filtroCond, setFiltroCond] = useState('');
  const [condSelecionado, setCondSelecionado] = useState<Condominio | null>(null);

  // Step 3 — Contraparte
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

  // Step 4 — OS (opcional, reaproveita OS existente no Auvo)
  const [ossDisponiveis, setOssDisponiveis] = useState<OsDisponivel[]>([]);
  const [buscandoOs, setBuscandoOs] = useState(false);
  const [osSelecionada, setOsSelecionada] = useState<OsDisponivel | null>(null);
  const [semOs, setSemOs] = useState(false);

  // Step 5 — Financeiro
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [dataEmissao, setDataEmissao] = useState(now.toISOString().slice(0, 10));
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacao, setObservacao] = useState('');
  const [contasInter, setContasInter] = useState<ContaInter[]>([]);
  const [contaInterSelecionada, setContaInterSelecionada] = useState<ContaInter | null>(null);
  const [gerarServico, setGerarServico] = useState(false);
  const [tipoServico, setTipoServico] = useState<'ASSISTENCIA' | 'MANUTENCAO'>('ASSISTENCIA');

  // Pré-seleciona via query params (vindo da página do condomínio)
  useEffect(() => {
    const condId = searchParams.get('condominio_id');
    const clienteId = searchParams.get('cliente_id');
    if (condId) {
      api.get(`/condominios/${condId}`).then(r => {
        setTemCondominio(true);
        setCondSelecionado(r.data);
        setStep(3);
      }).catch(() => {});
    }
    if (clienteId) {
      api.get(`/clientes/${clienteId}`).then(r => {
        setClienteSelecionado(r.data);
        setContraparteTipo(r.data.condominio_id ? 'MORADOR' : 'CLIENTE_EXTERNO');
        setStep(4);
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega condomínios ativos (Step 2)
  useEffect(() => {
    if (step !== 2 || !temCondominio) return;
    setBuscandoCond(true);
    api.get('/condominios?ativo=true&limit=700').then(r => setCondominios(r.data)).catch(() => setCondominios([])).finally(() => setBuscandoCond(false));
  }, [step, temCondominio]);

  // Carrega moradores do condomínio selecionado ou clientes externos (Step 3)
  useEffect(() => {
    if (step !== 3) return;
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

  // Busca OS disponíveis pra reaproveitar (Step 4)
  useEffect(() => {
    if (step !== 4) return;
    const condId = temCondominio ? condSelecionado?.id : undefined;
    const cliId = !temCondominio && contraparteTipo === 'CLIENTE_EXTERNO' ? clienteSelecionado?.id : undefined;
    if (!condId && !cliId) { setOssDisponiveis([]); return; }
    setBuscandoOs(true);
    api.get('/recibos/buscar-os', { params: { condominio_id: condId, cliente_id: cliId } })
      .then(r => setOssDisponiveis(r.data?.lista ?? []))
      .catch(() => setOssDisponiveis([]))
      .finally(() => setBuscandoOs(false));
  }, [step, temCondominio, condSelecionado, contraparteTipo, clienteSelecionado]);

  // Carrega contas Inter (Step 5)
  useEffect(() => {
    if (step !== 5) return;
    api.get('/configuracoes/inter').then(r => setContasInter((r.data ?? []).filter((c: ContaInter) => c.ativo))).catch(() => setContasInter([]));
  }, [step]);

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
      setStep(4);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao cadastrar cliente.');
    } finally { setSalvandoCliente(false); }
  };

  const selecionarOs = (os: OsDisponivel) => {
    setOsSelecionada(os);
    setSemOs(false);
    if (os.descricao_completa) setDescricao(os.descricao_completa);
    setStep(5);
  };

  const pularOs = () => {
    setOsSelecionada(null);
    setSemOs(true);
    setStep(5);
  };

  const confirmar = async () => {
    if (!descricao || !valor) { setErro('Preencha descrição e valor.'); return; }
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
        cnpj_emitente: contaInterSelecionada?.cnpj ?? null,
        cnpj_cliente: cnpjCliente,
        descricao_servico: descricao,
        valor: Number(valor),
        data_emissao: dataEmissao,
        data_vencimento: dataVencimento || null,
        observacao: observacao || null,
        gerar_servico: tipoRecibo === 'SAIDA' ? (!osSelecionada && gerarServico) : true,
        tipo_servico: tipoServico,
        numero_os: osSelecionada?.numero_os ?? null,
        data_servico: osSelecionada?.data_servico ?? null,
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

          {/* ── STEP 1 — Tipo ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">Tipo do Recibo</h2>
              <p className="text-sm text-slate-500">O recibo é uma entrada (cliente pagou a CMPort) ou uma saída (CMPort pagou um subcontratado)?</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => { setTipoRecibo('ENTRADA'); setStep(2); }}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${tipoRecibo === 'ENTRADA' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300'}`}>
                  <div className="text-2xl mb-1">⬇️</div>
                  <div className="font-black text-slate-900 dark:text-white">Entrada</div>
                  <div className="text-xs text-slate-500 mt-1">Cliente pagou a CMPort</div>
                </button>
                <button type="button" onClick={() => { setTipoRecibo('SAIDA'); setStep(2); }}
                  className={`p-5 rounded-2xl border-2 text-left transition-all ${tipoRecibo === 'SAIDA' ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'}`}>
                  <div className="text-2xl mb-1">⬆️</div>
                  <div className="font-black text-slate-900 dark:text-white">Saída</div>
                  <div className="text-xs text-slate-500 mt-1">CMPort pagou um subcontratado</div>
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2 — Vínculo (condomínio ou fora) ── */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">O serviço tem um condomínio?</h2>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => { setTemCondominio(true); setCondSelecionado(null); }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${temCondominio === true ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'}`}>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">🏢 Sim, tem condomínio</div>
                </button>
                <button type="button" onClick={() => { setTemCondominio(false); setCondSelecionado(null); setContraparteTipo(null); setStep(3); }}
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
                        <button key={c.id} type="button" onClick={() => { setCondSelecionado(c); setStep(3); }}
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

          {/* ── STEP 3 — Contraparte ── */}
          {step === 3 && (
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
                <button onClick={() => { setErro(null); setStep(2); }} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">← Voltar</button>
                <button onClick={() => {
                  const contraparteOk = contraparteTipo === 'CONDOMINIO' || clienteSelecionado || (contraparteTipo === 'AVULSO' && nomeAvulso);
                  if (!contraparteOk) { setErro('Selecione a contraparte ou digite o nome.'); return; }
                  setErro(null); setStep(4);
                }} className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors">Próximo →</button>
              </div>
              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}
            </div>
          )}

          {/* ── STEP 4 — OS (opcional) ── */}
          {step === 4 && (
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
                <button onClick={() => { setErro(null); setStep(3); }} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">← Voltar</button>
                <button onClick={pularOs} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">Sem OS →</button>
              </div>
            </div>
          )}

          {/* ── STEP 5 — Financeiro ── */}
          {step === 5 && (
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

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Vencimento (opcional)</label>
                <input type="date" value={dataVencimento} onChange={e => setDataVencimento(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Observação (opcional)</label>
                <input type="text" value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Informações adicionais"
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">CNPJ / Conta Inter (CMPort)</label>
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
              </div>

              {/* ENTRADA: serviço é sempre criado automaticamente — sem checkbox, só o tipo é escolhido.
                  SAIDA: continua opcional via checkbox (pagamento a terceiro, não serviço ao cliente). */}
              {!osSelecionada && tipoRecibo === 'ENTRADA' && (
                <div className="border border-violet-200 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-500/5 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-bold text-violet-700 dark:text-violet-400">
                    ✓ Um serviço será criado automaticamente vinculado a este recibo
                  </p>
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
                </div>
              )}

              {!osSelecionada && tipoRecibo === 'SAIDA' && (
                <div className={`border rounded-xl p-4 space-y-3 transition-colors ${gerarServico ? 'border-violet-400 dark:border-violet-600 bg-violet-50/50 dark:bg-violet-500/5' : 'border-slate-200 dark:border-slate-700'}`}>
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={gerarServico}
                      onChange={e => setGerarServico(e.target.checked)}
                      disabled={!temCondominio}
                      className="w-4 h-4 rounded accent-violet-600 disabled:opacity-40"
                    />
                    <div>
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Gerar OS vinculada ao recibo</span>
                      {!temCondominio && (
                        <span className="block text-xs text-slate-400 mt-0.5">Só disponível quando há condomínio</span>
                      )}
                    </div>
                  </label>
                  {gerarServico && (
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

              {valor && descricao && (
                <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700 rounded-2xl p-4">
                  <div className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-2">Resumo</div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <div><span className="font-semibold">Tipo:</span> {tipoRecibo === 'ENTRADA' ? 'Entrada' : 'Saída'}</div>
                    <div><span className="font-semibold">Contraparte:</span> {nomeContraparte}</div>
                    {clienteSelecionado?.apartamento && <div><span className="font-semibold">Apto:</span> {clienteSelecionado.apartamento}</div>}
                    <div><span className="font-semibold">Serviço:</span> {descricao}</div>
                    <div><span className="font-semibold">Valor:</span> {fmtValor(Number(valor))}</div>
                    {osSelecionada && (
                      <div className="pt-1 mt-1 border-t border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-400 font-semibold">
                        OS nº {osSelecionada.numero_os} será reaproveitada
                      </div>
                    )}
                    {!osSelecionada && tipoRecibo === 'ENTRADA' && (
                      <div className="pt-1 mt-1 border-t border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-400 font-semibold">
                        Serviço de {tipoServico === 'ASSISTENCIA' ? 'Assistência' : 'Manutenção'} será criado automaticamente
                      </div>
                    )}
                    {!osSelecionada && tipoRecibo === 'SAIDA' && gerarServico && temCondominio && (
                      <div className="pt-1 mt-1 border-t border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-400 font-semibold">
                        OS {tipoServico === 'ASSISTENCIA' ? 'Assistência' : 'Manutenção'} será criada automaticamente
                      </div>
                    )}
                  </div>
                </div>
              )}

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <div className="flex gap-3">
                <button onClick={() => { setErro(null); setStep(4); }} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">← Voltar</button>
                <button onClick={confirmar} disabled={loading}
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
