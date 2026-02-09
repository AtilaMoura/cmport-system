import { api } from '@/lib/api'
import { CondominiosList } from '@/components/CondominiosList'
import Link from 'next/link'

async function getCondominios() {
  try {
    const response = await api.get('/condominios/')
    return response.data
  } catch (error) {
    console.error('Erro ao buscar condomínios:', error)
    return []
  }
}

export default async function CondominiosPage() {
  const condominios = await getCondominios()

  const total = condominios.length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ativos = condominios.filter((c: any) => c.ativo).length
  const inativos = total - ativos

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header Section */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-8 py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-8 bg-blue-600 rounded-full" />
                <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
                  Condomínios
                </h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-lg ml-5">
                Gerencie todos os condomínios cadastrados no sistema
              </p>
            </div>
            <Link
              href="/condominios/novo"
              className="bg-brand text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-brand/20 hover:brightness-110 transition-all flex items-center gap-2"
            >
              <span className="text-xl">+</span> Novo Condomínio
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-8 -mt-8 relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Total Card */}
          <div className="group bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl group-hover:scale-110 transition-transform">
                <span className="text-2xl">🏢</span>
              </div>
              <div className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-full">
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400">TOTAL</span>
              </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mb-1">
              Total de Unidades
            </p>
            <p className="text-4xl font-black text-slate-900 dark:text-white">
              {total}
            </p>
          </div>

          {/* Ativos Card */}
          <div className="group bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-green-100 dark:bg-green-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <span className="text-2xl">✓</span>
              </div>
              <div className="px-3 py-1 bg-green-100 dark:bg-green-900/50 rounded-full">
                <span className="text-xs font-bold text-green-700 dark:text-green-400">ATIVOS</span>
              </div>
            </div>
            <p className="text-sm text-green-700 dark:text-green-400 font-semibold mb-1">
              Condomínios Ativos
            </p>
            <p className="text-4xl font-black text-green-700 dark:text-green-400">
              {ativos}
            </p>
          </div>

          {/* Inativos Card */}
          <div className="group bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 p-6 rounded-2xl border border-red-200 dark:border-red-800/50 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-500/20 rounded-xl group-hover:scale-110 transition-transform">
                <span className="text-2xl">⊘</span>
              </div>
              <div className="px-3 py-1 bg-red-100 dark:bg-red-900/50 rounded-full">
                <span className="text-xs font-bold text-red-700 dark:text-red-400">INATIVOS</span>
              </div>
            </div>
            <p className="text-sm text-red-700 dark:text-red-400 font-semibold mb-1">
              Condomínios Inativos
            </p>
            <p className="text-4xl font-black text-red-700 dark:text-red-400">
              {inativos}
            </p>
          </div>
        </div>

        {/* Lista de Condomínios */}
        <CondominiosList initialData={condominios} />
      </div>
    </div>
  )
}