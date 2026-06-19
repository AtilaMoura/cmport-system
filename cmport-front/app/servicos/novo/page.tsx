"use client"

import { useState, useEffect } from 'react';
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
  condominio_id: number | null;
}

export default function NovoServicoPage() {
  const router = useRouter();

  const [condominios, setCondominios] = useState<Condominio[]>([]);
  const [notas, setNotas] = useState<NotaFiscal[]>([]);

  const [condominioId, setCondominioId] = useState('');
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

  // Busca notas sem serviço vinculado ao selecionar condomínio
  useEffect(() => {
    if (!condominioId) { setNotas([]); setNotaFiscalId(''); return; }
    api.get('/notas-fiscais', { params: { condominio_id: condominioId } })
      .then(r => {
        // Mostra notas sem nota_fiscal_id em serviço (sem filtro extra — usuário escolhe)
        setNotas(r.data);
      }).catch(() => setNotas([]));
    setNotaFiscalId('');
  }, [condominioId]);

  const notasFiltradas = notas.filter(n => {
    if (!filtroNota) return true;
    return n.numero_nota.toLowerCase().includes(filtroNota.toLowerCase());
  });

  const handleSubmit = async () => {
    if (!condominioId) { setErro('Selecione um condomínio.'); return; }
    if (!dataServico) { setErro('Informe a data do serviço.'); return; }
    setErro(null);
    setSalvando(true);
    try {
      const payload: Record<string, unknown> = {
        condominio_id: Number(condominioId),
        tipo,
        data_servico: dataServico,
        descricao: descricao.trim() || null,
      };
      if (notaFiscalId) payload.nota_fiscal_id = Number(notaFiscalId);
      const { data } = await api.post('/servicos', payload);
      router.push(`/servicos/${data.id}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao criar serviço.');
    } finally {
      setSalvando(false);
    }
  };

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

          {/* Condomínio */}
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
              Condomínio <span className="text-red-500">*</span>
            </label>
            <select
              value={condominioId}
              onChange={e => setCondominioId(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
            >
              <option value="">Selecione...</option>
              {condominios.map(c => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>

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

          {/* Nota Fiscal — só aparece se condomínio selecionado */}
          {condominioId && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                Vincular Nota Fiscal (opcional)
              </label>
              {notas.length > 5 && (
                <input
                  type="text"
                  value={filtroNota}
                  onChange={e => setFiltroNota(e.target.value)}
                  placeholder="Filtrar por número..."
                  className="w-full px-3 py-2 mb-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              )}
              {notas.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Nenhuma nota fiscal encontrada para este condomínio.</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {/* Opção nenhuma */}
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
                        onChange={() => setNotaFiscalId(String(n.id))}
                        className="accent-violet-600"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-slate-800 dark:text-white">#{n.numero_nota}</span>
                        <span className="text-xs text-slate-400 ml-2">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n.valor)}
                        </span>
                        <span className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded ${
                          n.status === 'IMPORTADA' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' :
                          n.status === 'PROCESSADA' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300' :
                          'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}>{n.status}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
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
