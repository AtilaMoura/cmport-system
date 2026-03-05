"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

// Interface para NotaFiscal, definindo a estrutura dos dados da nota fiscal
interface NotaFiscal {
  id: number;
  numero_nota: string;
  tipo: 'ASSISTENCIA' | 'MANUTENCAO' | 'OUTROS';
  parcelas: number;
  valor: number;
  data_vencimento: string;
  data_pagamento: string | null;
  cliente_nome: string | null;
  condominio_id: number | null;
  observacao: string | null;
  criado_em: string;
}

// Interface para Condominio, definindo a estrutura dos dados do condomínio
interface Condominio {
  id: number;
  nome: string;
  cnpj: string;
}

// Componente principal da página de detalhes da nota fiscal
export default function NotaDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  
  // Estados para gerenciar os dados da nota, condomínio, loading e edição
  const [nota, setNota] = useState<NotaFiscal | null>(null);
  const [condominio, setCondominio] = useState<Condominio | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [motivo, setMotivo] = useState('');
  
  // Estados para o formulário de edição
  const [dataVencimento, setDataVencimento] = useState('');
  const [dataPagamento, setDataPagamento] = useState('');
  const [observacao, setObservacao] = useState('');
  const [clienteNome, setClienteNome] = useState('');

  // Estado para armazenar o ID da nota, resolvido a partir dos params
  const [id, setId] = useState<string | null>(null);

  // Efeito para resolver o ID dos params assíncronos
  useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
    });
  }, [params]);

  // Efeito para carregar os dados quando o ID estiver disponível
  useEffect(() => {
    if (id) {
      carregarDados();
    }
  }, [id]);

  // Função assíncrona para carregar os dados da nota e condomínio via API
  const carregarDados = async () => {
    if (!id) return;
    
    try {
      const response = await api.get(`/notas-fiscais/${id}`);
      const notaData = response.data;
      setNota(notaData);
      
      // Preencher os campos do formulário de edição com os dados da nota
      setDataVencimento(notaData.data_vencimento);
      setDataPagamento(notaData.data_pagamento || '');
      setObservacao(notaData.observacao || '');
      setClienteNome(notaData.cliente_nome || '');
      
      // Carregar dados do condomínio se houver ID associado
      if (notaData.condominio_id) {
        const condoRes = await api.get(`/condominios/${notaData.condominio_id}`);
        setCondominio(condoRes.data);
      }
    } catch (error) {
      console.error('Erro ao carregar nota:', error);
      alert('Nota fiscal não encontrada');
      router.push('/notas');
    } finally {
      setLoading(false);
    }
  };

  // Função para salvar as alterações na nota via API PUT
  const handleSalvar = async () => {
    if (!id) return;
    
    try {
      await api.put(`/notas-fiscais/${id}`, {
        data_vencimento: dataVencimento,
        data_pagamento: dataPagamento || null,
        observacao: observacao || null,
        cliente_nome: clienteNome || null
      });
      
      alert('✅ Nota fiscal atualizada com sucesso!');
      setEditando(false);
      carregarDados(); // Recarregar dados após atualização
    } catch (error) {
      console.error('Erro ao atualizar:', error);
      alert('❌ Erro ao atualizar nota fiscal');
    }
  };

  // Função para lidar com a exclusão da nota, incluindo confirmação de serviços vinculados
  const handleExcluir = async () => {
    if (!motivo.trim()) {
      alert("Informe o motivo da exclusão");
      return;
    }

    // Confirmação para deletar serviços associados
    const deletarServicos = confirm(
      "Esta nota está vinculada a serviços. Deseja deletar também todos os serviços associados?"
    );

    try {
      await api.delete(`/notas-fiscais/${nota?.id}?motivo=${encodeURIComponent(motivo)}&deletar_servicos=${deletarServicos}`);
      alert("Nota excluída com sucesso!");
      router.push("/notas"); // Redireciona para a lista após exclusão
    } catch (error) {
      console.error("Erro ao excluir nota:", error);
      
    }
  };

  // Renderiza tela de loading se dados estiverem carregando ou nota não existir
  if (loading || !nota) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando nota...</p>
        </div>
      </div>
    );
  }

  // Função para obter a cor de fundo baseada no tipo da nota
  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'ASSISTENCIA': return 'from-blue-500 to-blue-600';
      case 'MANUTENCAO': return 'from-purple-500 to-purple-600';
      default: return 'from-slate-500 to-slate-600';
    }
  };

  // Função para obter o ícone baseado no tipo da nota
  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'ASSISTENCIA': return '🔧';
      case 'MANUTENCAO': return '🛠️';
      default: return '📄';
    }
  };

  // Renderização principal da página
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header fixo no topo */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            {/* Link para voltar à lista de notas */}
            <Link
              href="/notas"
              className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 font-semibold transition-colors group"
            >
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Voltar para lista
            </Link>

            {/* Botões de ação: Editar ou Excluir */}
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
                    Editar Nota
                  </button>
                  <button
                    onClick={() => setModalExcluir(true)}
                    className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold shadow-sm hover:brightness-110 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Excluir Nota
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      setEditando(false);
                      carregarDados(); // Resetar formulário ao cancelar
                    }}
                    className="px-5 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
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

      {/* Conteúdo principal da página */}
      <div className="max-w-7xl mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Seção principal com detalhes da nota */}
        <div className="lg:col-span-3 space-y-6">
          {/* Card principal da nota */}
          <div className={`bg-gradient-to-r ${getTipoColor(nota.tipo)} rounded-3xl p-8 text-white shadow-xl`}>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-2xl font-black">
                  {getTipoIcon(nota.tipo)}
                  {nota.tipo}
                </div>
                <h1 className="text-4xl font-black">Nota #{nota.numero_nota}</h1>
              </div>
              <div className="text-right space-y-1">
                <p className="text-3xl font-black">R$ {nota.valor.toFixed(2)}</p>
                <p className="text-sm opacity-80">Parcelas: {nota.parcelas}</p>
              </div>
            </div>
          </div>

          {/* Formulário de edição ou visualização */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-xl">📝</span>
                Detalhes Editáveis
              </h3>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Campo Data de Vencimento */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Data de Vencimento
                </label>
                {editando ? (
                  <input
                    type="date"
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                ) : (
                  <p className="px-4 py-3 bg-slate-50 dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium">
                    {new Date(nota.data_vencimento).toLocaleDateString('pt-BR')}
                  </p>
                )}
              </div>

              {/* Campo Data de Pagamento */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Data de Pagamento
                </label>
                {editando ? (
                  <input
                    type="date"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                ) : (
                  <p className="px-4 py-3 bg-slate-50 dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium">
                    {nota.data_pagamento ? new Date(nota.data_pagamento).toLocaleDateString('pt-BR') : 'Não pago'}
                  </p>
                )}
              </div>

              {/* Campo Nome do Cliente */}
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Nome do Cliente
                </label>
                {editando ? (
                  <input
                    type="text"
                    value={clienteNome}
                    onChange={(e) => setClienteNome(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                ) : (
                  <p className="px-4 py-3 bg-slate-50 dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium">
                    {nota.cliente_nome || 'Não informado'}
                  </p>
                )}
              </div>

              {/* Campo Observação */}
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                  Observação
                </label>
                {editando ? (
                  <textarea
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                ) : (
                  <p className="px-4 py-3 bg-slate-50 dark:bg-slate-950 rounded-xl text-slate-900 dark:text-white font-medium whitespace-pre-wrap">
                    {nota.observacao || 'Sem observações'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Seção de Condomínio Associado */}
          {condominio && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">🏢</span>
                  Condomínio Associado
                </h3>
              </div>
              <div className="p-6">
                <Link
                  href={`/condominios/${condominio.id}`}
                  className="group flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-orange-600 flex items-center justify-center text-white shadow-sm">
                    <span className="text-sm font-bold">{condominio.nome.substring(0, 2).toUpperCase()}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {condominio.nome}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">
                      CNPJ: {condominio.cnpj || 'Não informado'}
                    </p>
                  </div>
                  <svg className="w-6 h-6 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar com status e metadados */}
        <div className="space-y-6">
          {/* Card de Status */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                <span className="text-xl">📊</span>
                Status
              </h3>
            </div>
            <div className="p-6">
              <div className={`p-4 rounded-xl text-center ${
                nota.data_pagamento
                  ? 'bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800'
                  : 'bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-800'
              }`}>
                <span className="text-3xl mb-2 block">
                  {nota.data_pagamento ? '✅' : '⏳'}
                </span>
                <p className={`text-lg font-black ${
                  nota.data_pagamento
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-orange-700 dark:text-orange-400'
                }`}>
                  {nota.data_pagamento ? 'PAGO' : 'PENDENTE'}
                </p>
              </div>
            </div>
          </div>

          {/* Card de Metadados */}
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
                <span className="font-mono font-bold text-slate-900 dark:text-white">#{nota.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Criado em</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {new Date(nota.criado_em).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de confirmação de exclusão */}
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
                Esta ação não pode ser desfeita. A nota será arquivada no histórico de exclusões.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Motivo da exclusão (obrigatório)
              </label>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                placeholder="Ex: Nota emitida incorretamente..."
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
                Excluir Nota
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}