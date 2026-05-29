"use client"

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Condominio { id: number; nome: string; }
interface Morador { id: number; nome: string; tipo: string; apartamento: string | null; cpf_cnpj: string | null; }

function NovoReciboContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const now = new Date();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Step 1 — Condomínio
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [buscandoCond, setBuscandoCond] = useState(false);
  const [filtroCond, setFiltroCond] = useState('');
  const [condSelecionado, setCondSelecionado] = useState<Condominio | null>(null);

  // Step 2 — Morador
  const [moradores, setMoradores] = useState<Morador[]>([]);
  const [buscandoMoradores, setBuscandoMoradores] = useState(false);
  const [moradorSelecionado, setMoradorSelecionado] = useState<Morador | null>(null);
  const [nomeAvulso, setNomeAvulso] = useState('');
  const [usarAvulso, setUsarAvulso] = useState(false);

  // Step 3 — Dados do serviço
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [dataEmissao, setDataEmissao] = useState(now.toISOString().slice(0, 10));
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacao, setObservacao] = useState('');

  // Pré-seleciona via query params (vindo da página do condomínio)
  useEffect(() => {
    const condId = searchParams.get('condominio_id');
    const clienteId = searchParams.get('cliente_id');
    if (condId) {
      api.get(`/condominios/${condId}`).then(r => {
        setCondSelecionado(r.data);
        setStep(2);
      }).catch(() => {});
    }
    if (clienteId) {
      api.get(`/clientes/${clienteId}`).then(r => {
        setMoradorSelecionado(r.data);
        setStep(3);
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega condomínios ativos
  useEffect(() => {
    if (step !== 1) return;
    setBuscandoCond(true);
    api.get('/condominios?ativo=true&limit=1000').then(r => setCondominios(r.data)).catch(() => setCondominios([])).finally(() => setBuscandoCond(false));
  }, [step]);

  // Carrega moradores do condomínio selecionado
  useEffect(() => {
    if (!condSelecionado || step !== 2) return;
    setBuscandoMoradores(true);
    api.get('/clientes', { params: { condominio_id: condSelecionado.id, apenas_ativos: true } })
      .then(r => setMoradores(r.data))
      .catch(() => setMoradores([]))
      .finally(() => setBuscandoMoradores(false));
  }, [condSelecionado, step]);

  const condsFiltrados = condominios.filter(c => !filtroCond || c.nome.toLowerCase().includes(filtroCond.toLowerCase()));

  const confirmar = async () => {
    if (!descricao || !valor) { setErro('Preencha descrição e valor.'); return; }
    setLoading(true); setErro(null);
    try {
      await api.post('/recibos', {
        cliente_id: moradorSelecionado?.id ?? null,
        condominio_id: condSelecionado?.id ?? null,
        cliente_nome_avulso: usarAvulso ? nomeAvulso : null,
        descricao_servico: descricao,
        valor: Number(valor),
        data_emissao: dataEmissao,
        data_vencimento: dataVencimento || null,
        observacao: observacao || null,
      });
      router.push('/recibos');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao criar recibo.');
    } finally { setLoading(false); }
  };

  const fmtValor = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
              <p className="text-xs text-slate-500">Passo {step} de 3</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">

          {/* Indicador de steps */}
          <div className="flex items-center gap-2 mb-6">
            {['Condomínio','Morador','Serviço'].map((label, i) => {
              const n = i + 1;
              return (
                <div key={n} className="flex items-center gap-2 flex-1">
                  <div className={`flex-1 flex flex-col items-center gap-1 ${i > 0 ? '' : ''}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                      n < step ? 'bg-violet-600 text-white' : n === step ? 'bg-violet-600 text-white ring-4 ring-violet-100 dark:ring-violet-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    }`}>{n < step ? '✓' : n}</div>
                    <span className={`text-[10px] font-semibold ${n === step ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'}`}>{label}</span>
                  </div>
                  {i < 2 && <div className={`h-0.5 w-8 mb-4 ${n < step ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                </div>
              );
            })}
          </div>

          {/* ── STEP 1 — Condomínio ── */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">Selecionar Condomínio</h2>
              <input type="text" value={filtroCond} onChange={e => setFiltroCond(e.target.value)}
                placeholder="Buscar condomínio..." autoFocus
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
              {buscandoCond ? (
                <div className="text-slate-400 text-sm animate-pulse text-center py-4">Carregando...</div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-1.5">
                  {condsFiltrados.slice(0, 50).map(c => (
                    <button key={c.id} type="button" onClick={() => { setCondSelecionado(c); setStep(2); }}
                      className="w-full text-left px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all text-sm font-semibold text-slate-800 dark:text-white">
                      {c.nome}
                    </button>
                  ))}
                  {condsFiltrados.length === 0 && <p className="text-center text-slate-400 text-sm py-4">Nenhum condomínio encontrado.</p>}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2 — Morador ── */}
          {step === 2 && condSelecionado && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">Selecionar Morador</h2>
                <p className="text-sm text-slate-500 mt-0.5">{condSelecionado.nome}</p>
              </div>

              {buscandoMoradores ? (
                <div className="text-slate-400 text-sm animate-pulse text-center py-4">Carregando moradores...</div>
              ) : moradores.length === 0 ? (
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-400">
                  Nenhum morador cadastrado neste condomínio.{' '}
                  <Link href={`/condominios/${condSelecionado.id}`} className="font-bold underline">Cadastrar agora</Link>
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {moradores.map(m => (
                    <button key={m.id} type="button" onClick={() => { setMoradorSelecionado(m); setUsarAvulso(false); setStep(3); }}
                      className={`w-full text-left px-4 py-3 border-2 rounded-xl transition-all ${
                        moradorSelecionado?.id === m.id ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                      }`}>
                      <div className="flex items-center gap-2">
                        <span className="text-base">{m.tipo === 'PJ' ? '🏢' : '👤'}</span>
                        <div>
                          <div className="font-bold text-sm text-slate-900 dark:text-white">{m.nome}</div>
                          <div className="text-xs text-slate-500">
                            {m.tipo}{m.apartamento ? ` · Apto ${m.apartamento}` : ''}{m.cpf_cnpj ? ` · ${m.cpf_cnpj}` : ''}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Opção avulso */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input type="checkbox" checked={usarAvulso} onChange={e => { setUsarAvulso(e.target.checked); if (e.target.checked) setMoradorSelecionado(null); }}
                    className="w-4 h-4 rounded accent-violet-600" />
                  <span className="text-sm text-slate-600 dark:text-slate-400">Digitar nome avulso (sem cadastro)</span>
                </label>
                {usarAvulso && (
                  <input type="text" value={nomeAvulso} onChange={e => setNomeAvulso(e.target.value)}
                    placeholder="Nome do cliente" autoFocus
                    className="w-full px-4 py-3 border border-violet-400 dark:border-violet-600 ring-2 ring-violet-100 dark:ring-violet-500/20 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">← Voltar</button>
                <button onClick={() => { if (!moradorSelecionado && !(usarAvulso && nomeAvulso)) { setErro('Selecione um morador ou digite o nome.'); return; } setErro(null); setStep(3); }}
                  className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors">Próximo →</button>
              </div>
              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}
            </div>
          )}

          {/* ── STEP 3 — Dados do serviço ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">Dados do Serviço</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {condSelecionado?.nome} · {moradorSelecionado?.nome || nomeAvulso}
                  {moradorSelecionado?.apartamento ? ` · Apto ${moradorSelecionado.apartamento}` : ''}
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

              {valor && descricao && (
                <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700 rounded-2xl p-4">
                  <div className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-2">Resumo</div>
                  <div className="text-sm text-slate-700 dark:text-slate-300 space-y-1">
                    <div><span className="font-semibold">Cliente:</span> {moradorSelecionado?.nome || nomeAvulso}</div>
                    {moradorSelecionado?.apartamento && <div><span className="font-semibold">Apto:</span> {moradorSelecionado.apartamento}</div>}
                    <div><span className="font-semibold">Serviço:</span> {descricao}</div>
                    <div><span className="font-semibold">Valor:</span> {fmtValor(Number(valor))}</div>
                  </div>
                </div>
              )}

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <div className="flex gap-3">
                <button onClick={() => { setErro(null); setStep(2); }} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">← Voltar</button>
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
