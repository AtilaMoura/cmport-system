"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Servico {
  id: number;
  condominio_id: number;
  tipo: 'manutencao' | 'assistencia';
  data_servico: string;
  descricao: string | null;
  nota_fiscal_id: number | null;
  criado_em: string;
  atualizado_em: string;
}

interface Condominio {
  id: number;
  nome: string;
  cnpj: string;
}

interface NotaFiscal {
  id: number;
  numero_nota: string;
  valor: number;
}

export default function ServicoDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [servico, setServico] = useState<Servico | null>(null);
  const [condominio, setCondominio] = useState<Condominio | null>(null);
  const [notaFiscal, setNotaFiscal] = useState<NotaFiscal | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [motivo, setMotivo] = useState('');
  
  // Estados do formulário de edição
  const [tipo, setTipo] = useState('');
  const [dataServico, setDataServico] = useState('');
  const [descricao, setDescricao] = useState('');

  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
    });
  }, [params]);

  useEffect(() => {
    if (id) {
      carregarDados();
    }
  }, [id]);

  const carregarDados = async () => {
    if (!id) return;
    
    try {
      const response = await api.get(`/servicos/${id}`);
      const servicoData = response.data;
      setServico(servicoData);
      
      // Preencher formulário
      setTipo(servicoData.tipo);
      setDataServico(servicoData.data_servico);
      setDescricao(servicoData.descricao || '');
      
      // Carregar condomínio
      const condoRes = await api.get(`/condominios/${servicoData.condominio_id}`);
      setCondominio(condoRes.data);
      
      // Carregar nota fiscal se existir
      if (servicoData.nota_fiscal_id) {
        const notaRes = await api.get(`/notas-fiscais/${servicoData.nota_fiscal_id}`);
        setNotaFiscal(notaRes.data);
      }
    } catch (error) {
      console.error('Erro ao carregar serviço:', error);
      alert('Serviço não encontrado');
      router.push('/servicos');
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async () => {
    if (!id) return;
    
    try {
      await api.put(`/servicos/${id}`, {
        tipo: tipo,
        data_servico: dataServico,
        descricao: descricao || null
      });
      
      alert('✅ Serviço atualizado com sucesso!');
      setEditando(false);
      carregarDados();
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      alert('❌ Erro ao atualizar serviço');
    }
  };

  const handleExcluir = async () => {
    if (!id) return;
    
    try {
      await api.delete(`/servicos/${id}`, {
        params: { motivo: motivo || 'Exclusão solicitada pelo usuário' }
      });
      
      alert('✅ Serviço excluído com sucesso!');
      router.push('/servicos');
    } catch (error) {
      console.error('Erro ao excluir:', error);
      alert('❌ Erro ao excluir serviço');
    }
  };

  if (loading || !servico) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando serviço...</p>
        </div>
      </div>
    );
  }

  const getTipoColor = (tipo: string) => {
    return tipo === 'manutencao'
      ? 'from-purple-500 to-purple-600'
      : 'from-blue-500 to-blue-600';
  };

  const getTipoIcon = (tipo: string) => {
    return tipo === 'manutencao' ? '🛠️' : '🔧';
  };

  const getTipoNome = (tipo: string) => {
    return tipo === 'manutencao' ? 'Manutenção Preventiva' : 'Assistência Técnica';
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <Link
              href="/servicos"
              className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 font-semibold transition-colors group"
            >
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Voltar para lista
            </Link>

            <div className="flex gap-3">
              {!editando ? (
                <>
                  <button
                    onClick={() => setEditando(true)}
                    className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-sm hover:brightness-110 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar
                  </button>
                  <button
                    onClick={() => setModalExcluir(true)}
                    className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold shadow-sm hover:brightness-110 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Excluir
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditando(false)}
                    className="px-5 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSalvar}
                    className="px-5 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold shadow-sm hover:brightness-110 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Salvar Alterações
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Hero Card */}
        <div className={`bg-gradient-to-br ${getTipoColor(servico.tipo)} rounded-3xl p-8 mb-8 shadow-2xl text-white relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-24 -mb-24" />

          <div className="relative">
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-3xl">{getTipoIcon(servico.tipo)}</span>
                </div>
                <div>
                  <p className="text-sm opacity-90 mb-1">Serviço #{servico.id}</p>
                  <h1 className="text-4xl font-black mb-2 tracking-tight">
                    {getTipoNome(servico.tipo)}
                  </h1>
                  <p className="text-lg opacity-90">
                    Realizado em {new Date(servico.data_servico).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <p className="text-sm opacity-90 mb-1">Condomínio</p>
                <p className="text-lg font-bold">
                  {condominio?.nome || 'Carregando...'}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/20">
                <p className="text-sm opacity-90 mb-1">Nota Fiscal</p>
                <p className="text-lg font-bold">
                  {notaFiscal ? notaFiscal.numero_nota : 'Sem nota vinculada'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Formulário de Edição ou Visualização */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">📋</span>
                  {editando ? 'Editar Serviço' : 'Detalhes do Serviço'}
                </h2>
              </div>
              <div className="p-6 space-y-4">
                {editando ? (
                  <>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        Tipo de Serviço
                      </label>
                      <select
                        value={tipo}
                        onChange={(e) => setTipo(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none"
                      >
                        <option value="manutencao">🛠️ Manutenção Preventiva</option>
                        <option value="assistencia">🔧 Assistência Técnica</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        Data do Serviço
                      </label>
                      <input
                        type="date"
                        value={dataServico}
                        onChange={(e) => setDataServico(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                        Descrição do Serviço
                      </label>
                      <textarea
                        value={descricao}
                        onChange={(e) => setDescricao(e.target.value)}
                        rows={6}
                        placeholder="Descreva os serviços realizados..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-purple-50 dark:bg-purple-500/10 rounded-lg">
                        <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2">Descrição</p>
                        <p className="text-slate-900 dark:text-white leading-relaxed">
                          {servico.descricao || 'Sem descrição cadastrada'}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Condomínio */}
            {condominio && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xl">🏢</span>
                    Condomínio
                  </h2>
                </div>
                <div className="p-6">
                  <Link
                    href={`/condominios/${condominio.id}`}
                    className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
                      <span className="text-sm font-bold">{condominio.nome.substring(0, 2).toUpperCase()}</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                        {condominio.nome}
                      </p>
                      <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                        CNPJ: {condominio.cnpj || 'Não informado'}
                      </p>
                    </div>
                    <svg className="w-6 h-6 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            )}

            {/* Nota Fiscal Vinculada */}
            {notaFiscal && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xl">📄</span>
                    Nota Fiscal Vinculada
                  </h2>
                </div>
                <div className="p-6">
                  <Link
                    href={`/notas/${notaFiscal.id}`}
                    className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-all group"
                  >
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-sm">
                      <span className="text-lg">📄</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                        {notaFiscal.numero_nota}
                      </p>
                      <p className="text-sm text-green-600 dark:text-green-400 font-bold">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(notaFiscal.valor)}
                      </p>
                    </div>
                    <svg className="w-6 h-6 text-slate-400 group-hover:text-orange-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Tipo Badge */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="p-6 text-center">
                <div className={`inline-flex items-center gap-2 px-6 py-3 rounded-full text-lg font-black ${
                  servico.tipo === 'manutencao'
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                }`}>
                  <span className="text-2xl">{getTipoIcon(servico.tipo)}</span>
                  {servico.tipo === 'manutencao' ? 'MANUTENÇÃO' : 'ASSISTÊNCIA'}
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">ℹ️</span>
                  Metadados
                </h3>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">ID do Sistema</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">#{servico.id}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Criado em</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {new Date(servico.criado_em).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Última alteração</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {new Date(servico.atualizado_em).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Exclusão */}
      {modalExcluir && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8 animate-fadeIn">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full mb-4">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">
                Confirmar Exclusão
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                Esta ação não pode ser desfeita. O serviço será arquivado no histórico de exclusões.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Motivo da exclusão (opcional)
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ex: Serviço registrado incorretamente..."
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModalExcluir(false)}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleExcluir}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:brightness-110 transition-all"
              >
                Excluir Serviço
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}