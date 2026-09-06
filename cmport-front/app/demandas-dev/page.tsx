"use client"

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Autor, AUTORES, TipoItem, Prioridade, ItemLista, Resumo,
  STATUS_LABEL, STATUS_CLASSE, PRIORIDADE_LABEL, PRIORIDADE_CLASSE, AUTOR_EMOJI,
  ladoDoAutor, getAutorAtual, setAutorAtual, fmtDataHora,
} from '@/lib/demandas';

type Aba = 'ABERTAS' | 'NOTAS' | 'RESOLVIDAS' | 'TUDO' | 'ARQUIVADAS';

const ABAS: { id: Aba; label: string }[] = [
  { id: 'ABERTAS', label: 'Abertas' },
  { id: 'NOTAS', label: 'Notas' },
  { id: 'RESOLVIDAS', label: 'Resolvidas' },
  { id: 'TUDO', label: 'Tudo' },
  { id: 'ARQUIVADAS', label: 'Arquivadas' },
];

export default function DemandasDevPage() {
  const router = useRouter();
  const [autor, setAutor] = useState<Autor>('ATILA');
  const [aba, setAba] = useState<Aba>('ABERTAS');
  const [busca, setBusca] = useState('');
  const [filtroAutor, setFiltroAutor] = useState<string>('');
  const [itens, setItens] = useState<ItemLista[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);

  const [modalAberto, setModalAberto] = useState<null | TipoItem>(null);
  const [soNovidades, setSoNovidades] = useState(false);

  useEffect(() => { setAutor(getAutorAtual()); }, []);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | boolean> = {};
      if (aba === 'NOTAS') params.tipo = 'NOTA';
      if (aba === 'ABERTAS') { params.tipo = 'DEMANDA'; params.incluir_encerrados = false; }
      if (aba === 'RESOLVIDAS') { params.tipo = 'DEMANDA'; params.status = 'RESOLVIDA'; }
      if (aba === 'ARQUIVADAS') { params.incluir_arquivados = true; }
      if (filtroAutor) params.autor = filtroAutor;
      if (busca.trim()) params.busca = busca.trim();

      const [rLista, rResumo] = await Promise.all([
        api.get('/canal', { params }),
        api.get('/canal/resumo'),
      ]);
      let lista: ItemLista[] = rLista.data.itens ?? [];
      if (aba === 'ARQUIVADAS') lista = lista.filter(i => i.arquivado);
      setItens(lista);
      setResumo(rResumo.data);
    } catch {
      setItens([]);
    } finally {
      setLoading(false);
    }
  }, [aba, filtroAutor, busca]);

  useEffect(() => { carregar(); }, [carregar]);

  const trocarAutor = (a: Autor) => { setAutor(a); setAutorAtual(a); };

  const meuLado = ladoDoAutor(autor);
  const temNovidade = (i: ItemLista) => (meuLado === 'ATILA' ? !i.visto_atila : !i.visto_cmport);

  const contadorNovidades = meuLado === 'ATILA' ? resumo?.novidades_atila : resumo?.novidades_cmport;

  const itensVisiveis = soNovidades ? itens.filter(temNovidade) : itens;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="px-4 sm:px-6 lg:px-8 py-4 lg:py-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Demandas Dev</h1>
            <p className="text-xs text-slate-500 mt-0.5">Canal entre a CMPort e o desenvolvimento — pendências, recados e documentos</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Estou como */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <span className="text-[11px] font-bold text-slate-400 px-2">estou como</span>
              {AUTORES.map(a => (
                <button key={a} onClick={() => trocarAutor(a)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                    autor === a
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}>
                  {AUTOR_EMOJI[a]} {a.charAt(0) + a.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <Link href="/demandas-dev/relatorio"
              className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              📄 Relatório
            </Link>
            <button onClick={() => setModalAberto('NOTA')}
              className="px-3 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              + Nota / documento
            </button>
            <button onClick={() => setModalAberto('DEMANDA')}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-bold rounded-xl hover:bg-violet-700 transition-colors shadow-sm">
              + Nova demanda
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Resumo */}
        {resumo && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card titulo="Novidades pra você" valor={contadorNovidades ?? 0} destaque={(contadorNovidades ?? 0) > 0} />
            <Card titulo="Demandas abertas" valor={resumo.demandas_abertas} />
            <Card titulo="Aguardando Atila" valor={resumo.aguardando_atila} />
            <Card titulo="Aguardando CMPort" valor={resumo.aguardando_cmport} />
          </div>
        )}

        {/* Abas */}
        <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          {ABAS.map(t => (
            <button key={t.id} onClick={() => setAba(t.id)}
              className={`px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                aba === t.id
                  ? 'border-violet-600 text-violet-700 dark:text-violet-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 items-center">
          <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por título, texto ou código..."
            className="flex-1 min-w-48 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
          <select value={filtroAutor} onChange={e => setFiltroAutor(e.target.value)}
            className="px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
            <option value="">Todos os autores</option>
            {AUTORES.map(a => <option key={a} value={a}>{a.charAt(0) + a.slice(1).toLowerCase()}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
            <input type="checkbox" checked={soNovidades} onChange={e => setSoNovidades(e.target.checked)}
              className="w-4 h-4 rounded accent-violet-600" />
            só novidades
          </label>
        </div>

        {/* Lista */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
          ) : itensVisiveis.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              {soNovidades && itens.length > 0 ? 'Nenhuma novidade — você está em dia.' : 'Nada aqui ainda.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {itensVisiveis.map(i => (
                <button key={i.id} onClick={() => router.push(`/demandas-dev/${i.id}`)}
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="pt-1 shrink-0 w-2">
                    {temNovidade(i) && <span className="block w-2 h-2 rounded-full bg-violet-600" title="Novidade" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-slate-400">{i.codigo}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        i.tipo === 'DEMANDA'
                          ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>{i.tipo === 'DEMANDA' ? 'Demanda' : 'Nota'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLASSE[i.status]}`}>
                        {STATUS_LABEL[i.status]}
                      </span>
                      {i.tipo === 'DEMANDA' && i.prioridade !== 'NORMAL' && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PRIORIDADE_CLASSE[i.prioridade]}`}>
                          {PRIORIDADE_LABEL[i.prioridade]}
                        </span>
                      )}
                      {i.arquivado && <span className="text-[10px] font-bold text-slate-400">arquivado</span>}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white mt-1 truncate">
                      {i.titulo || i.descricao_preview || <span className="text-slate-400 font-normal">(sem título)</span>}
                    </div>
                    {i.titulo && i.descricao_preview && (
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{i.descricao_preview}</div>
                    )}
                    <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                      <span>{AUTOR_EMOJI[i.autor]} {i.autor.charAt(0) + i.autor.slice(1).toLowerCase()}</span>
                      <span>·</span>
                      <span>{fmtDataHora(i.ultima_atividade)}</span>
                      {i.qtd_comentarios > 0 && <span>· 💬 {i.qtd_comentarios}</span>}
                      {i.qtd_anexos > 0 && <span>· 📎 {i.qtd_anexos}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalAberto && (
        <ModalNovo
          tipo={modalAberto}
          autor={autor}
          onFechar={() => setModalAberto(null)}
          onCriado={(id) => { setModalAberto(null); router.push(`/demandas-dev/${id}`); }}
        />
      )}
    </div>
  );
}

function Card({ titulo, valor, destaque }: { titulo: string; valor: number; destaque?: boolean }) {
  return (
    <div className={`border rounded-2xl p-4 ${
      destaque
        ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-700'
        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
    }`}>
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">{titulo}</div>
      <div className={`text-2xl font-black ${destaque ? 'text-violet-700 dark:text-violet-300' : 'text-slate-900 dark:text-white'}`}>
        {valor}
      </div>
    </div>
  );
}

function ModalNovo({
  tipo, autor, onFechar, onCriado,
}: {
  tipo: TipoItem;
  autor: Autor;
  onFechar: () => void;
  onCriado: (id: number) => void;
}) {
  const [autorLocal, setAutorLocal] = useState<Autor>(autor);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prioridade, setPrioridade] = useState<Prioridade>('NORMAL');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const inputFile = useRef<HTMLInputElement>(null);

  const salvar = async () => {
    if (tipo === 'DEMANDA' && !titulo.trim()) { setErro('A demanda precisa de um título.'); return; }
    if (tipo === 'NOTA' && !descricao.trim() && arquivos.length === 0) {
      setErro('Escreva algo ou anexe um documento.'); return;
    }
    setSalvando(true); setErro('');
    try {
      const r = await api.post('/canal', {
        tipo,
        autor: autorLocal,
        titulo: titulo.trim() || null,
        descricao: descricao.trim() || null,
        prioridade,
      });
      const id = r.data.id as number;
      for (const f of arquivos) {
        const fd = new FormData();
        fd.append('arquivo', f);
        fd.append('enviado_por', autorLocal);
        await api.post(`/canal/${id}/anexos`, fd);
      }
      onCriado(id);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao criar.');
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" onClick={onFechar}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 my-8" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-black text-slate-900 dark:text-white mb-4">
          {tipo === 'DEMANDA' ? 'Nova demanda' : 'Nota rápida / documento'}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">De quem é</label>
            <div className="flex gap-2">
              {AUTORES.map(a => (
                <button key={a} type="button" onClick={() => setAutorLocal(a)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold border-2 transition-colors ${
                    autorLocal === a
                      ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-500'
                  }`}>
                  {a.charAt(0) + a.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          {tipo === 'DEMANDA' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Título</label>
              <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus
                placeholder="Ex: OS finalizada aparece como Com Pendência"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm" />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">
              {tipo === 'DEMANDA' ? 'Descrição' : 'Mensagem'}
            </label>
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={4} autoFocus={tipo === 'NOTA'}
              placeholder={tipo === 'DEMANDA' ? 'O que precisa ser feito, como reproduzir...' : 'Segue a planilha de agosto...'}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm resize-none" />
          </div>

          {tipo === 'DEMANDA' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Prioridade</label>
              <select value={prioridade} onChange={e => setPrioridade(e.target.value as Prioridade)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm">
                {(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as Prioridade[]).map(p => (
                  <option key={p} value={p}>{PRIORIDADE_LABEL[p]}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Anexos (opcional)</label>
            <input ref={inputFile} type="file" multiple
              onChange={e => setArquivos(Array.from(e.target.files ?? []))}
              className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-violet-50 file:text-violet-700 dark:file:bg-violet-500/10 dark:file:text-violet-300" />
            {arquivos.length > 0 && (
              <ul className="mt-2 text-xs text-slate-500 space-y-0.5">
                {arquivos.map((f, i) => <li key={i}>📎 {f.name}</li>)}
              </ul>
            )}
          </div>

          {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onFechar}
            className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 transition-colors disabled:opacity-50">
            {salvando ? 'Salvando...' : tipo === 'DEMANDA' ? 'Abrir demanda' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
