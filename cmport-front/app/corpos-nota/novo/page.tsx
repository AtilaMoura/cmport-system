"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Condominio {
  id: number;
  nome: string;
}

interface OSResultado {
  numero_os: string | null;
  data_servico: string | null;
  descricao_servico: string | null;
  valor_bruto: number | null;
  preenchimento_manual: boolean;
}

const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function StepIndicator({ atual, total }: { atual: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <div key={n} className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black transition-colors ${
            n < atual ? 'bg-violet-600 text-white' :
            n === atual ? 'bg-violet-600 text-white ring-4 ring-violet-100 dark:ring-violet-500/20' :
            'bg-slate-100 dark:bg-slate-800 text-slate-400'
          }`}>
            {n < atual ? '✓' : n}
          </div>
          {n < total && <div className={`h-0.5 w-8 ${n < atual ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'}`} />}
        </div>
      ))}
    </div>
  );
}

export default function NovoCorpoNotaPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Dados do formulário
  const now = new Date();
  const [condominioId, setCondominioId] = useState('');
  const [tipoNota, setTipoNota] = useState('MANUTENCAO');
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());

  const [osResultado, setOsResultado] = useState<OSResultado | null>(null);
  const [buscandoOS, setBuscandoOS] = useState(false);

  const [numeroOs, setNumeroOs] = useState('');
  const [dataServico, setDataServico] = useState('');
  const [descricaoServico, setDescricaoServico] = useState('');
  const [valorBruto, setValorBruto] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const [preview, setPreview] = useState<{ conteudo_gerado: string; impostos_calculados: { valor_liquido: number } | null } | null>(null);
  const [gerandoPreview, setGerandoPreview] = useState(false);

  useEffect(() => {
    api.get('/condominios').then(r => setCondominios(r.data)).catch(() => {});
  }, []);

  const buscarOS = async () => {
    if (!condominioId) return;
    setBuscandoOS(true);
    setOsResultado(null);
    try {
      const r = await api.get('/corpos-nota/buscar-os', {
        params: { condominio_id: condominioId, mes, ano },
      });
      setOsResultado(r.data);
      if (r.data.numero_os) setNumeroOs(r.data.numero_os);
      if (r.data.data_servico) setDataServico(r.data.data_servico);
      if (r.data.descricao_servico) setDescricaoServico(r.data.descricao_servico);
      if (r.data.valor_bruto) setValorBruto(String(r.data.valor_bruto));
    } catch {
      setOsResultado({ numero_os: null, data_servico: null, descricao_servico: null, valor_bruto: null, preenchimento_manual: true });
    } finally {
      setBuscandoOS(false);
    }
  };

  const avancarParaStep2 = () => {
    if (!condominioId) { setErro('Selecione um condomínio.'); return; }
    setErro(null);
    buscarOS();
    setStep(2);
  };

  const avancarParaStep3 = () => {
    setErro(null);
    setStep(3);
  };

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
        condominio_id: Number(condominioId),
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
      setStep(4);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao gerar preview.');
    } finally {
      setGerandoPreview(false);
    }
  };

  const confirmar = async () => {
    setLoading(true);
    setErro(null);
    try {
      const r = await api.post('/corpos-nota', {
        condominio_id: Number(condominioId),
        tipo_nota: tipoNota,
        mes,
        ano,
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

  const nomeCondominio = condominios.find(c => c.id === Number(condominioId))?.nome ?? '';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8 py-4 lg:py-6">
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
              <p className="text-xs text-slate-500">Passo {step} de 4</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-3 sm:px-6 lg:px-8 py-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
          <StepIndicator atual={step} total={4} />

          {/* Step 1 — Condomínio + Tipo + Período */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">Selecionar Condomínio e Período</h2>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Condomínio</label>
                <select
                  value={condominioId}
                  onChange={e => setCondominioId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                >
                  <option value="">Selecione...</option>
                  {condominios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Tipo de Nota</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['MANUTENCAO', 'SERVICO', 'PRODUTO'] as const).map(tipo => (
                    <button
                      key={tipo}
                      type="button"
                      onClick={() => setTipoNota(tipo)}
                      className={`py-3 px-2 rounded-xl border-2 text-xs font-bold transition-all ${
                        tipoNota === tipo
                          ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                      }`}
                    >
                      {tipo === 'MANUTENCAO' ? '🛠️ Manutenção' : tipo === 'SERVICO' ? '🔧 Serviço' : '📦 Produto'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Mês</label>
                  <select
                    value={mes}
                    onChange={e => setMes(Number(e.target.value))}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {MESES_NOMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Ano</label>
                  <input
                    type="number"
                    value={ano}
                    onChange={e => setAno(Number(e.target.value))}
                    min={2020}
                    max={2099}
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <button
                onClick={avancarParaStep2}
                className="w-full py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors"
              >
                Próximo →
              </button>
            </div>
          )}

          {/* Step 2 — OS encontrada / preenchimento manual */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">Ordem de Serviço</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {nomeCondominio} · {MESES_NOMES[mes - 1]}/{ano} · {tipoNota}
              </p>

              {buscandoOS && <div className="text-slate-400 text-sm animate-pulse">Buscando OS...</div>}

              {osResultado && !buscandoOS && (
                osResultado.numero_os ? (
                  <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800 rounded-xl p-4">
                    <div className="font-bold text-green-700 dark:text-green-400 text-sm mb-1">OS encontrada automaticamente</div>
                    <div className="text-xs text-green-600 dark:text-green-500">
                      OS #{osResultado.numero_os}{osResultado.valor_bruto ? ` · R$ ${osResultado.valor_bruto.toFixed(2)}` : ''}
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                    <div className="font-bold text-amber-700 dark:text-amber-400 text-sm mb-1">Preenchimento manual</div>
                    <div className="text-xs text-amber-600 dark:text-amber-500">
                      Nenhuma OS encontrada para este período. Preencha os dados manualmente no próximo passo.
                    </div>
                  </div>
                )
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Número da OS (opcional)</label>
                <input
                  type="text"
                  value={numeroOs}
                  onChange={e => setNumeroOs(e.target.value)}
                  placeholder="Ex: 73787278"
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  ← Voltar
                </button>
                <button onClick={avancarParaStep3} className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors">
                  Próximo →
                </button>
              </div>
            </div>
          )}

          {/* Step 3 — Dados financeiros */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">Dados do Corpo de Nota</h2>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Data do Serviço</label>
                <input
                  type="date"
                  value={dataServico}
                  onChange={e => setDataServico(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
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
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
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
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
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
                    className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Observações</label>
                <textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                />
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  ← Voltar
                </button>
                <button
                  onClick={gerarPreview}
                  disabled={gerandoPreview}
                  className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-50"
                >
                  {gerandoPreview ? 'Calculando...' : 'Preview →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — Preview e confirmação */}
          {step === 4 && preview && (
            <div className="space-y-5">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">Confirmar Corpo de Nota</h2>

              {/* Resumo financeiro */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">Valor Bruto</div>
                  <div className="text-xl font-black text-slate-900 dark:text-white">
                    {Number(valorBruto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
                <div className="bg-violet-50 dark:bg-violet-500/10 rounded-xl p-4">
                  <div className="text-xs text-violet-600 dark:text-violet-400 uppercase font-bold mb-1">Valor Líquido</div>
                  <div className="text-xl font-black text-violet-700 dark:text-violet-400">
                    {preview.impostos_calculados
                      ? preview.impostos_calculados.valor_liquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : '—'}
                  </div>
                </div>
              </div>

              {/* Preview do conteúdo */}
              <div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Corpo da Nota (preview)
                </div>
                <pre className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono">
                  {preview.conteudo_gerado}
                </pre>
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
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
