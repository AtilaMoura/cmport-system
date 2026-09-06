"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import FormularioBloco from '@/components/demandas/FormularioBloco';
import {
  Autor, AUTORES, Prioridade, StatusItem, Item, Anexo,
  STATUS_LABEL, STATUS_CLASSE, STATUS_ESCOLHIVEIS, PRIORIDADE_LABEL, PRIORIDADE_CLASSE,
  AUTOR_EMOJI, ENCERRADOS, ladoDoAutor, getAutorAtual, setAutorAtual,
  fmtDataHora, fmtTamanho,
} from '@/lib/demandas';

export default function DemandaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [autor, setAutor] = useState<Autor>('ATILA');
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  // formulários
  const [novoComentario, setNovoComentario] = useState('');
  const [arquivosComentario, setArquivosComentario] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [painel, setPainel] = useState<null | 'resolver' | 'descartar' | 'promover' | 'editar'>(null);
  const inputComentario = useRef<HTMLInputElement>(null);
  const inputAnexoItem = useRef<HTMLInputElement>(null);

  useEffect(() => { setAutor(getAutorAtual()); }, []);

  const carregar = useCallback(async (marcarVisto = false) => {
    try {
      const r = await api.get(`/canal/${id}`);
      const it: Item = r.data;
      setItem(it);
      if (marcarVisto) {
        const lado = ladoDoAutor(getAutorAtual());
        const jaVisto = lado === 'ATILA' ? it.visto_atila : it.visto_cmport;
        if (!jaVisto) {
          await api.post(`/canal/${id}/visto`, { lado });
        }
      }
    } catch {
      setErro('Demanda não encontrada.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { carregar(true); }, [carregar]);

  const trocarAutor = (a: Autor) => { setAutor(a); setAutorAtual(a); };

  const acao = async (fn: () => Promise<unknown>) => {
    setEnviando(true); setErro('');
    try {
      await fn();
      setPainel(null);
      await carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro na operação.');
    } finally {
      setEnviando(false);
    }
  };

  const comentar = async (reacao?: string) => {
    if (!reacao && !novoComentario.trim() && arquivosComentario.length === 0) return;
    setEnviando(true); setErro('');
    try {
      if (novoComentario.trim() || reacao) {
        await api.post(`/canal/${id}/comentarios`, {
          autor, texto: novoComentario.trim() || null, reacao: reacao || null,
        });
      }
      // anexos do comentário vão soltos no item (comentario_id é opcional no backend)
      for (const f of arquivosComentario) {
        const fd = new FormData();
        fd.append('arquivo', f);
        fd.append('enviado_por', autor);
        await api.post(`/canal/${id}/anexos`, fd);
      }
      setNovoComentario('');
      setArquivosComentario([]);
      if (inputComentario.current) inputComentario.current.value = '';
      await carregar();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao comentar.');
    } finally {
      setEnviando(false);
    }
  };

  const uploadAnexoItem = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setEnviando(true); setErro('');
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append('arquivo', f);
        fd.append('enviado_por', autor);
        await api.post(`/canal/${id}/anexos`, fd);
      }
      if (inputAnexoItem.current) inputAnexoItem.current.value = '';
      await carregar();
    } catch {
      setErro('Erro ao subir anexo.');
    } finally {
      setEnviando(false);
    }
  };

  const baixarAnexo = async (a: Anexo) => {
    try {
      const r = await api.get(`/canal/anexos/${a.id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = a.nome_arquivo;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      setErro('Erro ao baixar anexo.');
    }
  };

  const removerAnexo = async (a: Anexo) => {
    if (!confirm(`Remover "${a.nome_arquivo}"?`)) return;
    await acao(() => api.delete(`/canal/anexos/${a.id}`));
  };

  const excluir = async () => {
    if (!confirm('Excluir este item? (fica só oculto, não some do banco)')) return;
    await api.delete(`/canal/${id}`);
    router.push('/demandas-dev');
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-400 animate-pulse">Carregando...</div>;
  if (!item) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-500">
      <p>{erro || 'Não encontrado.'}</p>
      <Link href="/demandas-dev" className="text-violet-600 font-bold text-sm">← Voltar</Link>
    </div>
  );

  const encerrado = ENCERRADOS.includes(item.status);
  const anexosItem = item.anexos.filter(a => a.comentario_id === null);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href="/demandas-dev" className="text-slate-500 hover:text-violet-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-slate-400">{item.codigo}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLASSE[item.status]}`}>
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
              <h1 className="text-lg font-black text-slate-900 dark:text-white">
                {item.titulo || (item.tipo === 'NOTA' ? 'Nota' : '(sem título)')}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
            <span className="text-[11px] font-bold text-slate-400 px-2">estou como</span>
            {AUTORES.map(a => (
              <button key={a} onClick={() => trocarAutor(a)}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                  autor === a ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500'
                }`}>
                {a.charAt(0) + a.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Meta + descrição */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              item.tipo === 'DEMANDA'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}>{item.tipo === 'DEMANDA' ? 'Demanda' : 'Nota'}</span>
            {item.tipo === 'DEMANDA' && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PRIORIDADE_CLASSE[item.prioridade]}`}>
                {PRIORIDADE_LABEL[item.prioridade]}
              </span>
            )}
            <span>Aberto por {AUTOR_EMOJI[item.autor]} {item.autor.charAt(0) + item.autor.slice(1).toLowerCase()}</span>
            <span>· {fmtDataHora(item.data_abertura)}</span>
            {item.arquivado && <span className="font-bold">· arquivado</span>}
          </div>
          {item.descricao && (
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{item.descricao}</p>
          )}

          {/* Anexos do item */}
          {anexosItem.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {anexosItem.map(a => (
                <AnexoChip key={a.id} anexo={a} onBaixar={() => baixarAnexo(a)} onRemover={() => removerAnexo(a)} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <input ref={inputAnexoItem} type="file" multiple className="hidden"
              onChange={e => uploadAnexoItem(e.target.files)} />
            <button onClick={() => inputAnexoItem.current?.click()} disabled={enviando}
              className="text-xs font-bold text-slate-500 hover:text-violet-600 disabled:opacity-50">
              📎 Anexar documento
            </button>
          </div>
        </div>

        {/* Resolução / descarte já registrados */}
        {item.status === 'RESOLVIDA' && item.resolucao_texto && (
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-700 rounded-2xl p-4">
            <div className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase mb-1">O que foi feito</div>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{item.resolucao_texto}</p>
            {item.commit_ref && <p className="text-xs text-slate-500 mt-1 font-mono">commit: {item.commit_ref}</p>}
            <p className="text-[11px] text-slate-400 mt-1">{fmtDataHora(item.data_resolucao)}</p>
          </div>
        )}
        {item.status === 'DESCARTADA' && item.motivo_descarte && (
          <div className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
            <div className="text-xs font-bold text-slate-500 uppercase mb-1">Descartada</div>
            <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{item.motivo_descarte}</p>
          </div>
        )}

        {/* Formulário de pendência (só em demanda) */}
        {item.tipo === 'DEMANDA' && (
          <FormularioBloco
            itemId={item.id}
            formulario={item.formularios[0] ?? null}
            autor={autor}
            onMudou={() => carregar()}
          />
        )}

        {/* Ações */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            {item.tipo === 'DEMANDA' && !encerrado && (
              <select value=""
                onChange={e => e.target.value && acao(() => api.post(`/canal/${id}/status`, { autor, status: e.target.value }))}
                className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-300">
                <option value="">Mudar status...</option>
                {STATUS_ESCOLHIVEIS.filter(s => s !== item.status).map(s => (
                  <option key={s} value={s}>{STATUS_LABEL[s as StatusItem]}</option>
                ))}
              </select>
            )}
            {item.tipo === 'DEMANDA' && !encerrado && (
              <>
                <button onClick={() => setPainel(painel === 'resolver' ? null : 'resolver')}
                  className="px-3 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-colors">
                  ✓ Resolver
                </button>
                <button onClick={() => setPainel(painel === 'descartar' ? null : 'descartar')}
                  className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  Descartar
                </button>
              </>
            )}
            {item.tipo === 'NOTA' && (
              <button onClick={() => setPainel(painel === 'promover' ? null : 'promover')}
                className="px-3 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors">
                ⬆ Virar demanda
              </button>
            )}
            <button onClick={() => setPainel(painel === 'editar' ? null : 'editar')}
              className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              Editar
            </button>
            <button onClick={() => acao(() => api.post(`/canal/${id}/arquivar`, { autor, arquivado: !item.arquivado }))}
              className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              {item.arquivado ? 'Desarquivar' : 'Arquivar'}
            </button>
            <button onClick={excluir}
              className="px-3 py-2 text-red-500 text-sm font-bold rounded-xl hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors ml-auto">
              Excluir
            </button>
          </div>

          {painel === 'resolver' && (
            <PainelResolver enviando={enviando} onConfirmar={(txt, commit) =>
              acao(() => api.post(`/canal/${id}/resolver`, { autor, resolucao_texto: txt, commit_ref: commit || null }))
            } />
          )}
          {painel === 'descartar' && (
            <PainelTexto label="Motivo do descarte" botao="Descartar" enviando={enviando}
              onConfirmar={txt => acao(() => api.post(`/canal/${id}/descartar`, { autor, motivo_descarte: txt }))} />
          )}
          {painel === 'promover' && (
            <PainelPromover enviando={enviando} tituloInicial={item.titulo ?? ''}
              onConfirmar={(titulo, prio) =>
                acao(() => api.post(`/canal/${id}/promover`, { autor, titulo, prioridade: prio }))
              } />
          )}
          {painel === 'editar' && (
            <PainelEditar enviando={enviando} item={item}
              onConfirmar={(patch) => acao(() => api.patch(`/canal/${id}`, patch))} />
          )}

          {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}
        </div>

        {/* Thread */}
        <div className="space-y-3">
          {item.comentarios.map(c => (
            <div key={c.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-1">
                <span className="font-bold text-slate-600 dark:text-slate-300">
                  {AUTOR_EMOJI[c.autor]} {c.autor.charAt(0) + c.autor.slice(1).toLowerCase()}
                </span>
                <span>· {fmtDataHora(c.criado_em)}</span>
              </div>
              {c.texto && <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{c.texto}</p>}
              {c.reacao && <p className="text-lg">{c.reacao}</p>}
              {c.anexos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {c.anexos.map(a => (
                    <AnexoChip key={a.id} anexo={a} onBaixar={() => baixarAnexo(a)} onRemover={() => removerAnexo(a)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Novo comentário */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3">
          <textarea value={novoComentario} onChange={e => setNovoComentario(e.target.value)} rows={3}
            placeholder="Escrever um recado..."
            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm resize-none" />
          <input ref={inputComentario} type="file" multiple
            onChange={e => setArquivosComentario(Array.from(e.target.files ?? []))}
            className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-violet-50 file:text-violet-700 dark:file:bg-violet-500/10 dark:file:text-violet-300" />
          {arquivosComentario.length > 0 && (
            <ul className="text-xs text-slate-500 space-y-0.5">
              {arquivosComentario.map((f, i) => <li key={i}>📎 {f.name}</li>)}
            </ul>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => comentar()} disabled={enviando}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50">
              {enviando ? 'Enviando...' : 'Enviar'}
            </button>
            <button onClick={() => comentar('👍')} disabled={enviando}
              className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-sm font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              👍
            </button>
            <button onClick={() => comentar('✅ Recebido')} disabled={enviando}
              className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              ✅ Recebido
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AnexoChip({ anexo, onBaixar, onRemover }: { anexo: Anexo; onBaixar: () => void; onRemover: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg pl-2.5 pr-1 py-1 text-xs">
      <button onClick={onBaixar} className="font-semibold text-slate-700 dark:text-slate-300 hover:text-violet-600 max-w-[220px] truncate">
        📎 {anexo.nome_arquivo}
      </button>
      {anexo.tamanho ? <span className="text-slate-400">{fmtTamanho(anexo.tamanho)}</span> : null}
      <button onClick={onRemover} className="text-slate-400 hover:text-red-500 px-1" title="Remover">×</button>
    </span>
  );
}

function PainelResolver({ enviando, onConfirmar }: { enviando: boolean; onConfirmar: (txt: string, commit: string) => void }) {
  const [txt, setTxt] = useState('');
  const [commit, setCommit] = useState('');
  return (
    <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
      <textarea value={txt} onChange={e => setTxt(e.target.value)} rows={3} autoFocus placeholder="O que foi feito para resolver..."
        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm resize-none" />
      <input type="text" value={commit} onChange={e => setCommit(e.target.value)} placeholder="commit / referência (opcional)"
        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-mono" />
      <button onClick={() => txt.trim() && onConfirmar(txt.trim(), commit.trim())} disabled={enviando || !txt.trim()}
        className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50">
        Marcar como resolvida
      </button>
    </div>
  );
}

function PainelTexto({ label, botao, enviando, onConfirmar }: { label: string; botao: string; enviando: boolean; onConfirmar: (txt: string) => void }) {
  const [txt, setTxt] = useState('');
  return (
    <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
      <textarea value={txt} onChange={e => setTxt(e.target.value)} rows={2} autoFocus placeholder={label}
        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm resize-none" />
      <button onClick={() => txt.trim() && onConfirmar(txt.trim())} disabled={enviando || !txt.trim()}
        className="px-4 py-2 bg-slate-700 text-white text-sm font-bold rounded-lg hover:bg-slate-800 disabled:opacity-50">
        {botao}
      </button>
    </div>
  );
}

function PainelPromover({ enviando, tituloInicial, onConfirmar }: { enviando: boolean; tituloInicial: string; onConfirmar: (titulo: string, prio: Prioridade) => void }) {
  const [titulo, setTitulo] = useState(tituloInicial);
  const [prio, setPrio] = useState<Prioridade>('NORMAL');
  return (
    <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
      <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus placeholder="Título da demanda"
        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm" />
      <select value={prio} onChange={e => setPrio(e.target.value as Prioridade)}
        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
        {(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as Prioridade[]).map(p => <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>)}
      </select>
      <button onClick={() => titulo.trim() && onConfirmar(titulo.trim(), prio)} disabled={enviando || !titulo.trim()}
        className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-lg hover:bg-violet-700 disabled:opacity-50">
        Virar demanda
      </button>
    </div>
  );
}

function PainelEditar({ enviando, item, onConfirmar }: { enviando: boolean; item: Item; onConfirmar: (patch: Record<string, string>) => void }) {
  const [titulo, setTitulo] = useState(item.titulo ?? '');
  const [descricao, setDescricao] = useState(item.descricao ?? '');
  const [prio, setPrio] = useState<Prioridade>(item.prioridade);
  return (
    <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
      {item.tipo === 'DEMANDA' && (
        <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título"
          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm" />
      )}
      <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} placeholder="Descrição"
        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm resize-none" />
      {item.tipo === 'DEMANDA' && (
        <select value={prio} onChange={e => setPrio(e.target.value as Prioridade)}
          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm">
          {(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as Prioridade[]).map(p => <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>)}
        </select>
      )}
      <button onClick={() => onConfirmar({ titulo, descricao, prioridade: prio })} disabled={enviando}
        className="px-4 py-2 bg-slate-700 text-white text-sm font-bold rounded-lg hover:bg-slate-800 disabled:opacity-50">
        Salvar
      </button>
    </div>
  );
}
