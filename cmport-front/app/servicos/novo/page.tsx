"use client"

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Condominio {
  id: number;
  nome: string;
  ativo: boolean;
}

interface NotaFiscal {
  id: number;
  numero_nota: string;
  valor: number;
  status: string;
  tipo: string;
  condominio_id: number | null;
  data_vencimento: string | null;
  cnpj_emitente_efetivo: string | null;
  razao_social_emitente: string | null;
}

export default function NovoServicoPage() {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [notas, setNotas] = useState<NotaFiscal[]>([]);

  // Combobox de condomínio
  const [condominioId, setCondominioId] = useState('');
  const [condominioNome, setCondominioNome] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  const [tipo, setTipo] = useState<'manutencao' | 'assistencia'>('manutencao');
  const [dataServico, setDataServico] = useState(new Date().toISOString().split('T')[0]);
  const [descricao, setDescricao] = useState('');
  const [notaFiscalId, setNotaFiscalId] = useState('');
  const [filtroNota, setFiltroNota] = useState('');

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.get('/condominios').then(r => {
      setCondominios(r.data.filter((c: Condominio) => c.ativo));
    }).catch(() => {});
  }, []);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        if (!condominioId) setCondominioNome('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [condominioId]);

  // Busca notas sem serviço ao selecionar condomínio
  useEffect(() => {
    if (!condominioId) { setNotas([]); setNotaFiscalId(''); setFiltroNota(''); return; }
    api.get('/notas-fiscais', { params: { condominio_id: condominioId, sem_servico: true } })
      .then(r => setNotas(r.data))
      .catch(() => setNotas([]));
    setNotaFiscalId('');
    setFiltroNota('');
  }, [condominioId]);

  const condominiosFiltrados = condominios.filter(c =>
    c.nome.toLowerCase().includes(condominioNome.toLowerCase())
  );

  const notasFiltradas = notas.filter(n => {
    if (!filtroNota) return true;
    return n.numero_nota.toLowerCase().includes(filtroNota.toLowerCase());
  });

  // Auto-seleciona quando filtra para 1 resultado
  useEffect(() => {
    if (notasFiltradas.length === 1 && filtroNota) {
      setNotaFiscalId(String(notasFiltradas[0].id));
    }
  }, [notasFiltradas.length, filtroNota]); // eslint-disable-line react-hooks/exhaustive-deps

  function selecionarCondominio(c: Condominio) {
    setCondominioId(String(c.id));
    setCondominioNome(c.nome);
    setShowDropdown(false);
  }

  function limparCondominio() {
    setCondominioId('');
    setCondominioNome('');
    setNotas([]);
    setNotaFiscalId('');
    setFiltroNota('');
  }

  function selecionarNota(n: NotaFiscal) {
    setNotaFiscalId(String(n.id));
    // Auto-ajusta tipo com base na nota
    const tipoNota = n.tipo?.toLowerCase();
    if (tipoNota === 'assistencia' || tipoNota === 'manutencao') {
      setTipo(tipoNota);
    }
    // Auto-preenche data com vencimento da nota
    if (n.data_vencimento) {
      setDataServico(n.data_vencimento.split('T')[0]);
    }
  }

  const handleSubmit = async () => {
    if (!condominioId) { setErro('Selecione um condomínio.'); return; }
    setErro(null);
    setSalvando(true);

    try {
      if (notaFiscalId) {
        // Fluxo com nota: vincular condomínio → serviço criado automaticamente
        await api.patch(`/notas-fiscais/${notaFiscalId}/vincular-condominio`, {
          condominio_id: Number(condominioId),
        });
        const { data: servico } = await api.get(`/servicos/por-nota/${notaFiscalId}`);
        router.push(`/servicos/${servico.id}`);
      } else {
        // Fluxo sem nota: criação manual
        if (!dataServico) { setErro('Informe a data do serviço.'); setSalvando(false); return; }
        const payload: Record<string, unknown> = {
          condominio_id: Number(condominioId),
          tipo,
          data_servico: dataServico,
          descricao: descricao.trim() || null,
        };
        const { data } = await api.post('/servicos', payload);
        router.push(`/servicos/${data.id}`);
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao criar serviço.');
    } finally {
      setSalvando(false);
    }
  };

  const notaSelecionada = notaFiscalId
    ? notas.find(n => String(n.id) === notaFiscalId) ?? null
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6">
      <div className="max-w-xl mx-auto">

        {/* Cabeçalho */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/servicos" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
            ← Voltar
          </Link>
          <h1 className="text-xl font-black text-slate-800 dark:text-white">Novo Serviço</h1>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 space-y-5">

          {/* Condomínio — combobox com busca */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
              Condomínio <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={condominioNome}
                onChange={e => {
                  setCondominioNome(e.target.value);
                  setCondominioId('');
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Digite para buscar..."
                className="w-full px-4 py-3 pr-10 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400"
              />
              {condominioId ? (
                <button
                  type="button"
                  onClick={limparCondominio}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none"
                >
                  ✕
                </button>
              ) : (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">▾</span>
              )}
            </div>
            {showDropdown && condominiosFiltrados.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-56 overflow-y-auto">
                {condominiosFiltrados.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selecionarCondominio(c)}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors ${
                      String(c.id) === condominioId
                        ? 'text-violet-700 dark:text-violet-400 font-semibold bg-violet-50 dark:bg-violet-500/10'
                        : 'text-slate-800 dark:text-white'
                    }`}
                  >
                    {c.nome}
                  </button>
                ))}
              </div>
            )}
            {showDropdown && condominioNome && condominiosFiltrados.length === 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-4 py-3 text-sm text-slate-400">
                Nenhum condomínio encontrado.
              </div>
            )}
          </div>

          {/* Nota Fiscal — aparece após selecionar condomínio */}
          {condominioId && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                Vincular Nota Fiscal (opcional)
              </label>
              <input
                type="text"
                value={filtroNota}
                onChange={e => setFiltroNota(e.target.value)}
                placeholder="Buscar por número da nota..."
                className="w-full px-3 py-2 mb-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
              {notas.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Nenhuma nota fiscal disponível para este condomínio.</p>
              ) : notasFiltradas.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Nenhuma nota encontrada para &quot;{filtroNota}&quot;.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  <label className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <input
                      type="radio"
                      name="nota"
                      value=""
                      checked={notaFiscalId === ''}
                      onChange={() => setNotaFiscalId('')}
                      className="accent-violet-600"
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400">Sem nota vinculada</span>
                  </label>
                  {notasFiltradas.map(n => (
                    <label key={n.id} className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50">
                      <input
                        type="radio"
                        name="nota"
                        value={n.id}
                        checked={notaFiscalId === String(n.id)}
                        onChange={() => selecionarNota(n)}
                        className="accent-violet-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-800 dark:text-white">#{n.numero_nota}</span>
                          <span className="text-xs text-slate-400">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n.valor)}
                          </span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            n.status === 'IMPORTADA' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' :
                            n.status === 'PROCESSADA' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' :
                            'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}>{n.status}</span>
                          {n.cnpj_emitente_efetivo && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30">
                              <span className="w-1 h-1 rounded-full bg-blue-500 inline-block" />
                              {n.razao_social_emitente ?? n.cnpj_emitente_efetivo}
                            </span>
                          )}
                        </div>
                        {n.data_vencimento && (
                          <span className="text-xs text-slate-400">
                            Venc. {new Date(n.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Campos manuais — ocultados quando nota selecionada (serviço vem do XML) */}
          {!notaSelecionada && (
            <>
              {/* Tipo */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  Tipo <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  {(['manutencao', 'assistencia'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      className={`flex-1 py-2.5 text-sm font-bold rounded-xl border-2 transition-all ${
                        tipo === t
                          ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-violet-300'
                      }`}
                    >
                      {t === 'manutencao' ? 'Manutenção' : 'Assistência'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  Data do Serviço <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={dataServico}
                  onChange={e => setDataServico(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  Descrição (opcional)
                </label>
                <textarea
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                  rows={3}
                  placeholder="Descreva o serviço prestado..."
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                />
              </div>
            </>
          )}

          {/* Info quando nota selecionada */}
          {notaSelecionada && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 text-xs text-violet-700 dark:text-violet-400">
              <span className="shrink-0 mt-0.5">ℹ</span>
              <span>Os dados do serviço (tipo, data, valores) serão preenchidos automaticamente a partir da nota fiscal selecionada.</span>
            </div>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>
          )}

          <div className="flex gap-3 pt-2">
            <Link href="/servicos" className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-center hover:bg-slate-200 transition-colors text-sm">
              Cancelar
            </Link>
            <button
              onClick={handleSubmit}
              disabled={salvando}
              className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-50 text-sm"
            >
              {salvando ? 'Criando...' : 'Criar Serviço'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
