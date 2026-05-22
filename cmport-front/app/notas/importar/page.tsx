/* eslint-disable @typescript-eslint/no-explicit-any */
"use client"

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface CandidatoCorpoNota {
  corpo_nota_id: number;
  condominio_id: number;
  tipo_nota: string;
  mes: number;
  ano: number;
  numero_os: string | null;
  nota_fiscal_id: number;
  candidatos: Array<{ id: number; numero_os: string | null; mes_referencia: string | null }>;
}

export default function ImportarNotasPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [tipo, setTipo] = useState<string>('');
  const [resultado, setResultado] = useState<any>(null);
  const [pendentesVinculo, setPendentesVinculo] = useState<CandidatoCorpoNota[]>([]);
  const [vinculandoIdx, setVinculandoIdx] = useState<number | null>(null);
  const [vinculando, setVinculando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!files || files.length === 0) {
      alert('Selecione pelo menos um arquivo');
      return;
    }

    setLoading(true);
    setResultado(null);

    try {
      const formData = new FormData();
      
      // Adiciona os arquivos
      for (let i = 0; i < files.length; i++) {
        formData.append('arquivos', files[i]);
      }
      
      // Adiciona o tipo se selecionado
      if (tipo) {
        formData.append('tipo', tipo);
      }

      const response = await api.post('/notas-fiscais/importar-xml', formData);

      setResultado(response.data);

      // Extrai erros que precisam de vínculo manual de corpo de nota
      const multiplos = (response.data.erros ?? []).filter(
        (e: any) => e.tipo_erro === 'corpo_nota_multiplos_candidatos'
      );
      if (multiplos.length > 0) {
        setPendentesVinculo(multiplos);
      } else if (response.data.processados > 0 || response.data.ja_existentes > 0) {
        setTimeout(() => {
          router.push('/notas');
        }, 3000);
      }
    } catch (error: any) {
      console.error('Erro ao importar:', error);
      alert('Erro ao importar notas fiscais');
    } finally {
      setLoading(false);
    }
  };

  const vincularCorpoManual = async (corpoId: number, notaId: number) => {
    setVinculando(true);
    try {
      await api.post(`/corpos-nota/${corpoId}/vincular-nota`, { nota_fiscal_id: notaId });
      setPendentesVinculo(prev => prev.filter(p => p.corpo_nota_id !== corpoId));
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Erro ao vincular nota ao corpo.');
    } finally {
      setVinculando(false);
      setVinculandoIdx(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-3 sm:p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
              <span className="text-xl sm:text-2xl">📤</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight uppercase">
                Importar Notas Fiscais
              </h1>
              <p className="text-slate-500 font-medium italic text-sm">
                Envie XMLs de NFe individual ou em pacote ZIP
              </p>
            </div>
          </div>
        </div>

        {/* Formulário */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] sm:rounded-[2.5rem] shadow-sm p-4 sm:p-8 md:p-12">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {/* Seleção de Tipo */}
            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-600/10 text-orange-600 text-xs font-black">01</span>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                  Tipo de Serviço
                </h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => setTipo('ASSISTENCIA')}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    tipo === 'ASSISTENCIA'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-blue-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-3xl mb-2">🔧</div>
                    <div className="font-bold text-slate-900 dark:text-white">Assistência</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">NFe</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTipo('MANUTENCAO')}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    tipo === 'MANUTENCAO'
                      ? 'border-purple-600 bg-purple-50 dark:bg-purple-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-purple-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-3xl mb-2">🛠️</div>
                    <div className="font-bold text-slate-900 dark:text-white">Manutenção</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">NFSe</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTipo('')}
                  className={`p-6 rounded-2xl border-2 transition-all ${
                    tipo === ''
                      ? 'border-green-600 bg-green-50 dark:bg-green-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-green-300'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-3xl mb-2">✨</div>
                    <div className="font-bold text-slate-900 dark:text-white">Auto-detectar</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Recomendado</div>
                  </div>
                </button>
              </div>
            </section>

            {/* Upload de Arquivos */}
            <section className="space-y-4">
              <div className="flex items-center gap-3 mb-4">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-600/10 text-orange-600 text-xs font-black">02</span>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                  Selecionar Arquivos
                </h3>
              </div>

              <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-12 text-center hover:border-orange-400 dark:hover:border-orange-600 transition-colors">
                <input
                  type="file"
                  multiple
                  accept=".xml,.zip"
                  onChange={(e) => setFiles(e.target.files)}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="text-6xl mb-4">📁</div>
                  <div className="font-bold text-lg text-slate-900 dark:text-white mb-2">
                    Clique para selecionar
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    XMLs individuais ou arquivo ZIP
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                    Formatos aceitos: .xml, .zip
                  </div>
                </label>
              </div>

              {files && files.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800">
                  <div className="font-semibold text-sm text-slate-700 dark:text-slate-300 mb-2">
                    Arquivos selecionados: {files.length}
                  </div>
                  <div className="space-y-1">
                    {Array.from(files).map((file, i) => (
                      <div key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        {file.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Botão de Envio */}
            <div className="pt-6 flex gap-4">
              <button
                type="button"
                onClick={() => router.push('/notas')}
                className="flex-1 py-5 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-[1.5rem] font-black text-lg text-center hover:bg-slate-300 dark:hover:bg-slate-700 transition-all"
              >
                CANCELAR
              </button>
              <button
                type="submit"
                disabled={loading || !files || files.length === 0}
                className="flex-1 py-5 bg-orange-600 text-white rounded-[1.5rem] font-black text-lg shadow-xl shadow-orange-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? '📤 IMPORTANDO...' : '🚀 IMPORTAR NOTAS'}
              </button>
            </div>
          </form>
        </div>

        {/* Modal: vínculo manual de corpo de nota com múltiplos candidatos */}
        {pendentesVinculo.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-amber-100 dark:bg-amber-500/20 rounded-full flex items-center justify-center text-xl">⚠️</div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">Vínculo Manual Necessário</h2>
                  <p className="text-xs text-slate-500">{pendentesVinculo.length} nota(s) com múltiplos candidatos</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">
                As notas abaixo correspondem a múltiplos corpos de nota. Selecione o corpo correto para cada uma.
              </p>
              {pendentesVinculo.map((p, idx) => (
                <div key={p.nota_fiscal_id} className="mb-6 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 uppercase">
                    Nota #{p.nota_fiscal_id} · {p.tipo_nota} · {p.mes}/{p.ano}
                  </div>
                  <div className="p-3 space-y-2">
                    {p.candidatos.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setVinculandoIdx(c.id); vincularCorpoManual(c.id, p.nota_fiscal_id); }}
                        disabled={vinculando}
                        className="w-full text-left px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors group disabled:opacity-50"
                      >
                        <div className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-amber-700 dark:group-hover:text-amber-400">
                          Corpo #{c.id}{c.numero_os ? ` · OS ${c.numero_os}` : ''}
                        </div>
                        {c.mes_referencia && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">{c.mes_referencia}</div>
                        )}
                        {vinculandoIdx === c.id && <div className="text-xs text-amber-600 animate-pulse mt-1">Vinculando...</div>}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setPendentesVinculo(prev => prev.filter((_, i) => i !== idx))}
                    className="w-full py-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors border-t border-slate-100 dark:border-slate-800"
                  >
                    Ignorar esta nota
                  </button>
                </div>
              ))}
              {pendentesVinculo.length === 0 && (
                <button
                  onClick={() => router.push('/notas')}
                  className="w-full py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors"
                >
                  Concluir e ir para notas
                </button>
              )}
            </div>
          </div>
        )}

        {/* Resultado da Importação */}
        {resultado && (() => {
          const errosCanceladas = resultado.erros.filter((e: any) => e.tipo_erro === 'cancelada');
          const errosReais = resultado.erros.filter((e: any) => e.tipo_erro !== 'cancelada' && e.tipo_erro !== 'corpo_nota_multiplos_candidatos');
          const temErro = errosReais.length > 0;
          return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 shadow-lg">
            <div className="flex items-center gap-3 mb-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                !temErro ? 'bg-green-100 dark:bg-green-500/20' : 'bg-orange-100 dark:bg-orange-500/20'
              }`}>
                <span className="text-2xl">{!temErro ? '✅' : '⚠️'}</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Importação Concluída
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {resultado.processados} nova(s) · {resultado.ja_existentes ?? 0} já existia(m)
                </p>
              </div>
            </div>

            {(resultado.processados > 0 || resultado.ja_existentes > 0) && (
              <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-4">
                {resultado.processados > 0 && (
                  <div className="font-bold text-green-700 dark:text-green-400 mb-1">
                    ✨ {resultado.processados} nota(s) importada(s) com sucesso
                  </div>
                )}
                {resultado.ja_existentes > 0 && (
                  <div className="font-bold text-blue-700 dark:text-blue-400 mb-1">
                    🔁 {resultado.ja_existentes} nota(s) já existiam no sistema
                  </div>
                )}
                <div className="text-xs text-green-600 dark:text-green-500 mt-1">
                  Redirecionando para a lista de notas...
                </div>
              </div>
            )}

            {errosCanceladas.length > 0 && (
              <div className="mb-3">
                <div className="font-bold text-sm text-amber-700 dark:text-amber-400 mb-2">
                  🚫 {errosCanceladas.length} nota(s) cancelada(s) — não importadas:
                </div>
                {errosCanceladas.map((erro: any, i: number) => (
                  <div key={i} className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-1">
                    <div className="text-xs font-bold text-amber-700 dark:text-amber-400">{erro.numero || erro.arquivo}</div>
                  </div>
                ))}
              </div>
            )}

            {errosReais.length > 0 && (
              <div>
                <div className="font-bold text-sm text-red-700 dark:text-red-400 mb-2">
                  ❌ {errosReais.length} erro(s) encontrado(s):
                </div>
                {errosReais.map((erro: any, i: number) => (
                  <div key={i} className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-1">
                    <div className="text-xs font-bold text-red-700 dark:text-red-400 mb-1">{erro.arquivo}</div>
                    <div className="text-xs text-red-600 dark:text-red-500">{erro.erro}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })()}
      </div>
    </div>
  );
}