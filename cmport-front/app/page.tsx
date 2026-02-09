export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-8 bg-blue-600 rounded-full" />
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              Dashboard
            </h1>
          </div>
          <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">
            Bem-vindo ao CMPort - Sistema de Gestão de Condomínios
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8">
        {/* Hero Section */}
        <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 rounded-3xl p-12 mb-8 shadow-2xl shadow-blue-500/20 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -mr-48 -mt-48" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full -ml-32 -mb-32" />
          
          <div className="relative">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-4xl">👋</span>
              </div>
              <div>
                <h2 className="text-3xl font-black mb-2">Olá, Administrador!</h2>
                <p className="text-blue-100 text-lg">
                  {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
            
            <p className="text-xl text-blue-100 max-w-2xl leading-relaxed">
              Aqui você tem acesso rápido a todas as funcionalidades do sistema de gestão. 
              Escolha uma opção abaixo para começar.
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                <span className="text-2xl">🏢</span>
              </div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">TOTAL</span>
            </div>
            <p className="text-3xl font-black text-slate-900 dark:text-white mb-1">0</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Condomínios</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-50 dark:bg-green-500/10 rounded-xl">
                <span className="text-2xl">✓</span>
              </div>
              <span className="text-xs font-bold text-green-600 dark:text-green-400">ATIVO</span>
            </div>
            <p className="text-3xl font-black text-green-600 dark:text-green-400 mb-1">0</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Ativos</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-xl">
                <span className="text-2xl">🛠️</span>
              </div>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400">SERVIÇOS</span>
            </div>
            <p className="text-3xl font-black text-purple-600 dark:text-purple-400 mb-1">0</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Cadastrados</p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl">
                <span className="text-2xl">📄</span>
              </div>
              <span className="text-xs font-bold text-orange-600 dark:text-orange-400">NOTAS</span>
            </div>
            <p className="text-3xl font-black text-orange-600 dark:text-orange-400 mb-1">0</p>
            <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold">Emitidas</p>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <a 
            href="/condominios"
            className="group bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-blue-300 dark:hover:border-blue-700 transition-all hover:-translate-y-2"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                <span className="text-4xl">🏢</span>
              </div>
              <svg className="w-6 h-6 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Gerenciar Condomínios
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Visualize, cadastre e edite informações dos condomínios
            </p>
          </a>

          <a 
            href="/servicos"
            className="group bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-purple-300 dark:hover:border-purple-700 transition-all hover:-translate-y-2"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-4 bg-purple-50 dark:bg-purple-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                <span className="text-4xl">🛠️</span>
              </div>
              <svg className="w-6 h-6 text-slate-400 group-hover:text-purple-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Serviços
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Controle e gerencie os serviços prestados
            </p>
          </a>

          <a 
            href="/notas"
            className="group bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-orange-300 dark:hover:border-orange-700 transition-all hover:-translate-y-2"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-4 bg-orange-50 dark:bg-orange-500/10 rounded-2xl group-hover:scale-110 transition-transform">
                <span className="text-4xl">📄</span>
              </div>
              <svg className="w-6 h-6 text-slate-400 group-hover:text-orange-600 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              Notas Fiscais
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Emita e gerencie notas fiscais de serviços
            </p>
          </a>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
              <span className="text-xl">📊</span>
              Atividades Recentes
            </h2>
          </div>
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full">
              <span className="text-3xl">📋</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
              Nenhuma atividade recente
            </h3>
            <p className="text-slate-500 dark:text-slate-400">
              Comece cadastrando um novo condomínio
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}