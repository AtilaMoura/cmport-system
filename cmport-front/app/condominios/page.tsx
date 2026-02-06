import { api } from '@/lib/api'
import { CondominiosList } from '@/components/CondominiosList'

async function getCondominios() {
  try {
    const response = await api.get('/condominios/')
    return response.data
  } catch (error) {
    return []
  }
}

export default async function CondominiosPage() {
  const condominios = await getCondominios()
  
  // Dados para os cards de cima
  const total = condominios.length
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ativos = condominios.filter((c: any) => c.ativo).length
  const inativos = total - ativos

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold">Condomínios</h1>
          <p className="text-slate-500">Base de dados central do CMPort</p>
        </div>
        <button className="bg-brand text-white px-6 py-2 rounded-xl font-bold hover:brightness-110 transition shadow-lg shadow-brand/20">
          + Novo Condomínio
        </button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <p className="text-sm text-slate-500 font-medium">Total de Unidades</p>
          <p className="text-3xl font-black mt-1">{total}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm border-l-4 border-l-green-500">
          <p className="text-sm text-slate-500 font-medium">Ativos</p>
          <p className="text-3xl font-black mt-1 text-green-600">{ativos}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm border-l-4 border-l-red-500">
          <p className="text-sm text-slate-500 font-medium">Inativos</p>
          <p className="text-3xl font-black mt-1 text-red-600">{inativos}</p>
        </div>
      </div>

      {/* Lista com Filtro Funcional */}
      <CondominiosList initialData={condominios} />
    </div>
  )
}