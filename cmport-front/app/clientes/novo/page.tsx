"use client"

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Condominio { id: number; nome: string; }

function NovoClienteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('PF');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [apartamento, setApartamento] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [observacao, setObservacao] = useState('');

  // Vínculo opcional com condomínio — pré-seleciona se vier por query param
  const paramCondId = searchParams.get('condominio_id');
  const [vincularCond, setVincularCond] = useState(!!paramCondId);
  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [condSelecionado, setCondSelecionado] = useState<number | null>(paramCondId ? Number(paramCondId) : null);
  const [filtroCond, setFiltroCond] = useState('');
  const [carregandoCond, setCarregandoCond] = useState(false);

  useEffect(() => {
    if (!vincularCond || condominios.length > 0) return;
    setCarregandoCond(true);
    api.get('/condominios?ativo=true&limit=1000')
      .then(r => setCondominios(r.data))
      .catch(() => setCondominios([]))
      .finally(() => setCarregandoCond(false));
  }, [vincularCond]);

  const condsFiltrados = condominios.filter(c =>
    !filtroCond || c.nome.toLowerCase().includes(filtroCond.toLowerCase())
  );

  const salvar = async () => {
    if (!nome.trim()) { setErro('Nome é obrigatório.'); return; }
    if (vincularCond && !condSelecionado) { setErro('Selecione um condomínio ou desmarque o vínculo.'); return; }
    setLoading(true); setErro(null);
    try {
      await api.post('/clientes', {
        nome: nome.trim(),
        tipo,
        cpf_cnpj: cpfCnpj || null,
        apartamento: apartamento || null,
        email: email || null,
        telefone: telefone || null,
        observacao: observacao || null,
        condominio_id: vincularCond ? condSelecionado : null,
      });
      router.push('/clientes');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao salvar cliente.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/clientes" className="text-slate-500 hover:text-violet-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Novo Cliente</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">

          {/* Tipo */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">Tipo de Cliente</label>
            <div className="grid grid-cols-2 gap-3">
              {(['PF', 'PJ'] as const).map(t => (
                <button key={t} type="button" onClick={() => setTipo(t)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    tipo === t ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                  }`}>
                  <div className="text-2xl mb-1">{t === 'PF' ? '👤' : '🏢'}</div>
                  <div className={`font-bold text-sm ${tipo === t ? 'text-violet-700 dark:text-violet-400' : 'text-slate-800 dark:text-white'}`}>
                    {t === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{t === 'PF' ? 'Morador, inquilino' : 'Empresa, síndico PJ'}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
              {tipo === 'PJ' ? 'Razão Social / Nome Fantasia' : 'Nome Completo'} <span className="text-red-500">*</span>
            </label>
            <input type="text" value={nome} onChange={e => setNome(e.target.value)} autoFocus
              placeholder={tipo === 'PJ' ? 'Razão social ou nome fantasia' : 'Nome completo do cliente'}
              className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          </div>

          {/* CPF / CNPJ + Apartamento */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                {tipo === 'PJ' ? 'CNPJ' : 'CPF'}
              </label>
              <input type="text" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)}
                placeholder={tipo === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Apartamento</label>
              <input type="text" value={apartamento} onChange={e => setApartamento(e.target.value)}
                placeholder="Ex: 42 / Torre A"
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            </div>
          </div>

          {/* Email + Telefone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">E-mail</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Telefone</label>
              <input type="text" value={telefone} onChange={e => setTelefone(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
            </div>
          </div>

          {/* Observação */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Observação</label>
            <input type="text" value={observacao} onChange={e => setObservacao(e.target.value)}
              placeholder="Informações adicionais"
              className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          </div>

          {/* Vínculo condomínio (opcional) */}
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input type="checkbox" checked={vincularCond} onChange={e => { setVincularCond(e.target.checked); if (!e.target.checked) setCondSelecionado(null); }}
                className="w-4 h-4 rounded accent-violet-600" />
              <div>
                <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Vincular a um condomínio</span>
                <p className="text-xs text-slate-500">Opcional — permite usar o endereço do condomínio no recibo</p>
              </div>
            </label>

            {vincularCond && (
              <div className="space-y-2">
                <input type="text" value={filtroCond} onChange={e => setFiltroCond(e.target.value)}
                  placeholder="Buscar condomínio..."
                  className="w-full px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                {carregandoCond ? (
                  <div className="text-slate-400 text-sm animate-pulse text-center py-3">Carregando...</div>
                ) : (
                  <div className="max-h-52 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-700 rounded-xl p-2 bg-slate-50 dark:bg-slate-800">
                    {condsFiltrados.slice(0, 40).map(c => (
                      <button key={c.id} type="button" onClick={() => setCondSelecionado(c.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                          condSelecionado === c.id
                            ? 'bg-violet-600 text-white font-bold'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700'
                        }`}>
                        {c.nome}
                      </button>
                    ))}
                    {condsFiltrados.length === 0 && <p className="text-xs text-slate-400 text-center py-2">Nenhum encontrado.</p>}
                  </div>
                )}
                {condSelecionado && (
                  <p className="text-xs text-violet-600 dark:text-violet-400 font-semibold">
                    ✓ {condominios.find(c => c.id === condSelecionado)?.nome}
                  </p>
                )}
              </div>
            )}
          </div>

          {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

          <div className="flex gap-3 pt-2">
            <Link href="/clientes"
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-center hover:bg-slate-200 transition-colors">
              Cancelar
            </Link>
            <button onClick={salvar} disabled={loading}
              className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-lg shadow-violet-600/20">
              {loading ? 'Salvando...' : '✓ Salvar Cliente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NovoClientePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <NovoClienteContent />
    </Suspense>
  );
}
