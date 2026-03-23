"use client"

import { useEffect, useState } from 'react';
import { useParams, notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { FormEditarCondominio } from '@/components/FormEditarCondominio';

export default function EditarPage() {
  const params = useParams();
  const id = params.id as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [condo, setCondo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);

  useEffect(() => {
    api.get(`/condominios/${id}`)
      .then(r => setCondo(r.data))
      .catch(() => setNotFoundState(true))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 dark:text-slate-400 font-semibold">Carregando...</div>
      </div>
    );
  }

  if (notFoundState || !condo) {
    notFound();
  }

  return (
    <div className="p-3 sm:p-6 lg:p-10 max-w-4xl mx-auto space-y-4 sm:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1 sm:gap-2">
        <h1 className="text-2xl sm:text-3xl font-black text-brand dark:text-white">Editar Condomínio</h1>
        <p className="text-slate-500 font-medium text-sm sm:text-base">Atualize as informações cadastrais e contatos</p>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-8 lg:p-10 shadow-sm">
        <FormEditarCondominio initialData={condo} />
      </div>
    </div>
  );
}
