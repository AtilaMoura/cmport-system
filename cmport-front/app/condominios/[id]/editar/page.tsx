import { api } from '@/lib/api';
import { notFound } from 'next/navigation';
import { FormEditarCondominio } from '@/components/FormEditarCondominio';

async function getCondominio(id: string) {
  try {
    const response = await api.get(`/condominios/${id}`);
    return response.data;
  } catch (error) {
    return null;
  }
}

export default async function EditarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const condo = await getCondominio(id);

  if (!condo) notFound();

  return (
    <div className="p-10 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-brand dark:text-white">Editar Condomínio</h1>
        <p className="text-slate-500 font-medium">Atualize as informações cadastrais e contatos</p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-10 shadow-sm">
        <FormEditarCondominio initialData={condo} />
      </div>
    </div>
  );
}