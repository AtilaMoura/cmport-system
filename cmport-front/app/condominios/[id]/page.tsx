import { api } from '@/lib/api';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// 1. Função isolada para buscar os dados (fora do componente)
async function getCondominio(id: string) {
  try {
    const response = await api.get(`/condominios/${id}`);
    return response.data;
  } catch (error) {
    console.error("Erro ao buscar condomínio:", error);
    return null;
  }
}

// 2. O Componente principal fica limpo e sem o try/catch direto no JSX
export default async function DetalhesCondominio({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params;
  const condo = await getCondominio(id);

  // Se não encontrar o condomínio, redireciona para página 404
  if (!condo) {
    notFound();
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link href="/condominios" className="text-brand hover:underline mb-4 inline-block">
        ← Voltar para lista
      </Link>
      
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 rounded-3xl shadow-sm">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white">{condo.nome}</h1>
            <p className="text-slate-500">{condo.razao_social || 'Razão social não informada'}</p>
          </div>
          <span className={`px-4 py-1 rounded-full text-sm font-bold ${condo.ativo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {condo.ativo ? 'ATIVO' : 'INATIVO'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-slate-100 dark:border-slate-800 pt-8">
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-widest mb-4">Documentação</h3>
            <p className="text-sm font-medium">CNPJ</p>
            <p className="font-mono text-slate-600 dark:text-slate-300">{condo.cnpj || '---'}</p>
          </div>
          
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-widest mb-4">Observações</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 italic">
              {condo.observacao || 'Nenhuma observação cadastrada.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}