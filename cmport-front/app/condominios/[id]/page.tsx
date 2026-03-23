/* eslint-disable @typescript-eslint/no-explicit-any */
import { api } from '@/lib/api';
import Link from 'next/link';
import { notFound } from 'next/navigation';

async function getCondominio(id: string) {
  try {
    const response = await api.get(`/condominios/${id}`);
    return response.data;
  } catch (error) {
    return null;
  }
}

export default async function DetalhesCondominio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const condo = await getCondominio(id);

  if (!condo) notFound();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 lg:py-6">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/condominios"
              className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 font-semibold transition-colors group shrink-0"
            >
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Voltar para lista</span>
            </Link>

            <div className="flex gap-2">
              <Link
                href={`/condominios/${id}/editar`}
                className="px-3 py-2 sm:px-5 sm:py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm font-bold shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
              >
                Editar Cadastro
              </Link>
              <button className="px-3 py-2 sm:px-4 sm:py-2 bg-red-500 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-red-600 transition-colors">
                Desativar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 lg:py-8">
        {/* Hero Card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-4 sm:p-8 mb-4 lg:mb-8 shadow-2xl shadow-blue-500/20 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full -ml-24 -mb-24" />

          <div className="relative">
            {/* Nome + badge: empilha no mobile */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 sm:mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                  <span className="text-2xl sm:text-3xl">🏢</span>
                </div>
                <div>
                  <h1 className="text-xl sm:text-3xl lg:text-4xl font-black mb-1 sm:mb-2 tracking-tight leading-tight">
                    {condo.nome}
                  </h1>
                  <p className="text-blue-100 text-sm sm:text-lg font-medium">
                    {condo.razao_social || 'Sem razão social cadastrada'}
                  </p>
                </div>
              </div>

              <span className={`self-start shrink-0 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-bold shadow-lg ${
                condo.ativo ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
              }`}>
                {condo.ativo ? '✓ ATIVO' : '⊘ INATIVO'}
              </span>
            </div>

            {/* 3 mini-cards: 1 col mobile → 3 cols sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border border-white/20">
                <p className="text-blue-100 text-xs sm:text-sm font-semibold mb-1">CNPJ</p>
                <p className="font-mono text-sm sm:text-lg font-bold">
                  {condo.cnpj || 'Não informado'}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border border-white/20">
                <p className="text-blue-100 text-xs sm:text-sm font-semibold mb-1">ID do Sistema</p>
                <p className="font-mono text-sm sm:text-lg font-bold">
                  #{condo.id.toString().padStart(6, '0')}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border border-white/20">
                <p className="text-blue-100 text-xs sm:text-sm font-semibold mb-1">Cadastrado em</p>
                <p className="text-sm sm:text-lg font-bold">
                  {new Date().toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Endereço */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">📍</span>
                  Endereço Completo
                </h2>
              </div>
              <div className="p-4 sm:p-6">
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed mb-4">
                  {condo.endereco?.rua || 'Endereço não informado'}
                </p>

                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 sm:p-4 border border-slate-200 dark:border-slate-700">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-400 mb-2">
                    <span className="font-semibold">Coordenadas GPS:</span>
                    <span className="font-mono text-xs sm:text-sm">{condo.endereco?.latitude}, {condo.endereco?.longitude}</span>
                  </div>
                  <p className="text-xs text-slate-500 italic">
                    🗺️ Integração com Google Maps em breve
                  </p>
                </div>
              </div>
            </div>

            {/* Observações */}
            {condo.observacao && (
              <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/50 overflow-hidden shadow-sm">
                <div className="px-4 sm:px-6 py-4 bg-amber-100 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-900/50">
                  <h2 className="font-bold text-base sm:text-lg text-amber-900 dark:text-amber-200 flex items-center gap-2">
                    <span className="text-xl">📝</span>
                    Observações Importantes
                  </h2>
                </div>
                <div className="p-4 sm:p-6">
                  <p className="text-amber-900 dark:text-amber-100 leading-relaxed">
                    {condo.observacao}
                  </p>
                </div>
              </div>
            )}

            {/* Tabs Section */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="flex overflow-x-auto border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <button className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold border-b-2 border-blue-600 text-blue-600 bg-white dark:bg-slate-900 flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <span className="text-base sm:text-lg">📋</span>
                  Contatos
                </button>
                <button className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <span className="text-base sm:text-lg">🛠️</span>
                  Manutenções
                </button>
                <button className="px-3 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <span className="text-base sm:text-lg">📄</span>
                  Notas Fiscais
                </button>
              </div>

              <div className="p-4 sm:p-6">
                {condo.contatos && condo.contatos.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {condo.contatos.map((contato: any) => (
                      <div
                        key={contato.id}
                        className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all bg-slate-50 dark:bg-slate-800/50"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-800 rounded-lg flex items-center justify-center">
                              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                {contato.nome.substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                            <p className="font-bold text-slate-900 dark:text-white">
                              {contato.nome}
                            </p>
                          </div>
                          <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-bold rounded-md">
                            {contato.funcao}
                          </span>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <span>📞</span>
                            <span className="font-medium">{contato.telefone || 'Sem telefone'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                            <span>📧</span>
                            <span className="font-medium truncate">{contato.email || 'Sem email'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
                      <span className="text-3xl">👥</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                      Nenhum contato cadastrado
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400 mb-4">
                      Adicione contatos para facilitar a comunicação
                    </p>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                      Adicionar Contato
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 lg:space-y-6">
            {/* Ações Rápidas */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-4 sm:p-6 shadow-xl shadow-blue-500/20 text-white">
              <h3 className="font-bold text-base sm:text-lg mb-3 sm:mb-4 flex items-center gap-2">
                <span className="text-xl">⚡</span>
                Ações Rápidas
              </h3>
              <div className="space-y-2 sm:space-y-3">
                <button className="w-full py-2.5 sm:py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-bold transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2">
                  <span>📄</span>
                  Gerar Nota Fiscal
                </button>
                <button className="w-full py-2.5 sm:py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-bold transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2">
                  <span>🛠️</span>
                  Nova Manutenção
                </button>
                <button className="w-full py-2.5 sm:py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-xl text-sm font-bold transition-all hover:scale-105 shadow-lg flex items-center justify-center gap-2">
                  <span>👥</span>
                  Adicionar Contato
                </button>
              </div>
            </div>

            {/* Estatísticas */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-4 sm:px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">📊</span>
                  Estatísticas
                </h3>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Contatos</span>
                  <span className="font-bold text-lg text-slate-900 dark:text-white">
                    {condo.contatos?.length || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Manutenções</span>
                  <span className="font-bold text-lg text-slate-900 dark:text-white">0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Notas Fiscais</span>
                  <span className="font-bold text-lg text-slate-900 dark:text-white">0</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}