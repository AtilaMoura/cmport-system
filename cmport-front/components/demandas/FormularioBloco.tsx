"use client"

import { useState } from 'react';
import { api } from '@/lib/api';
import {
  Autor, Formulario, Pergunta, TipoPergunta, RespostaValor,
  TIPO_PERGUNTA_LABEL, FORM_STATUS_LABEL, perguntaVazia, markdownLeve, ladoDoAutor,
  fmtDataHora,
} from '@/lib/demandas';

const TIPOS: TipoPergunta[] = [
  'texto_curto', 'texto_longo', 'numero', 'valor', 'data',
  'sim_nao', 'escolha_unica', 'escolha_multipla',
];

const STATUS_CLASSE: Record<string, string> = {
  RASCUNHO: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
  ENVIADO: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
  EM_PREENCHIMENTO: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300',
  RESPONDIDO: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
};

const inp = 'w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm';

export default function FormularioBloco({
  itemId, formulario, autor, onMudou,
}: {
  itemId: number;
  formulario: Formulario | null;
  autor: Autor;
  onMudou: () => void;
}) {
  const souAtila = ladoDoAutor(autor) === 'ATILA';
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const acao = async (fn: () => Promise<unknown>) => {
    setEnviando(true); setErro('');
    try { await fn(); setEditando(false); onMudou(); }
    catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro na operação.');
    } finally { setEnviando(false); }
  };

  // ── sem formulário ainda ─────────────────────────────────────────────────
  if (!formulario && !editando) {
    if (!souAtila) return null;
    return (
      <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-4 text-center">
        <button onClick={() => setEditando(true)}
          className="text-sm font-bold text-violet-600 hover:underline">
          + Formulário de pendência
        </button>
        <p className="text-xs text-slate-400 mt-1">Perguntas pra CMPort responder dentro do sistema</p>
      </div>
    );
  }

  if (editando) {
    return (
      <EditorFormulario
        inicial={formulario}
        enviando={enviando}
        erro={erro}
        onCancelar={() => { setEditando(false); setErro(''); }}
        onSalvar={(payload) => acao(() =>
          formulario
            ? api.patch(`/canal/formularios/${formulario.id}`, payload)
            : api.post(`/canal/${itemId}/formularios`, payload)
        )}
      />
    );
  }

  if (!formulario) return null;
  const f = formulario;
  const respondido = f.status === 'RESPONDIDO';
  const podePreencher = !souAtila && (f.status === 'ENVIADO' || f.status === 'EM_PREENCHIMENTO');

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-violet-600 uppercase tracking-wide">Formulário</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_CLASSE[f.status]}`}>
              {FORM_STATUS_LABEL[f.status]}
            </span>
          </div>
          <h3 className="text-base font-black text-slate-900 dark:text-white mt-0.5">{f.titulo}</h3>
          {respondido && f.respondido_em && (
            <p className="text-[11px] text-slate-400">respondido por {f.preenchido_por} em {fmtDataHora(f.respondido_em)}</p>
          )}
        </div>
        {souAtila && !respondido && (
          <div className="flex gap-2">
            <button onClick={() => setEditando(true)}
              className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              Editar
            </button>
            {f.status === 'RASCUNHO' && (
              <button onClick={() => acao(() => api.post(`/canal/formularios/${f.id}/enviar`, { autor }))}
                disabled={enviando}
                className="px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 disabled:opacity-50">
                Enviar pra CMPort
              </button>
            )}
            <button onClick={() => { if (confirm('Excluir o formulário?')) acao(() => api.delete(`/canal/formularios/${f.id}`)); }}
              className="px-3 py-1.5 text-red-500 text-xs font-bold rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10">
              Excluir
            </button>
          </div>
        )}
      </div>

      {f.contexto && (
        <div className="text-sm text-slate-700 dark:text-slate-300 prose-canal"
          dangerouslySetInnerHTML={{ __html: markdownLeve(f.contexto) }} />
      )}

      {podePreencher ? (
        <PreenchimentoFormulario form={f} autor={autor} enviando={enviando} erro={erro}
          onSalvar={(respostas, finalizar) => acao(() =>
            api.post(`/canal/formularios/${f.id}/responder`, { autor, respostas, finalizar }))} />
      ) : (
        <RespostasView form={f} />
      )}

      {erro && !podePreencher && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}
    </div>
  );
}

// ── Editor (Atila) ─────────────────────────────────────────────────────────

function EditorFormulario({
  inicial, enviando, erro, onCancelar, onSalvar,
}: {
  inicial: Formulario | null;
  enviando: boolean;
  erro: string;
  onCancelar: () => void;
  onSalvar: (p: { titulo: string; contexto: string | null; perguntas: Pergunta[] }) => void;
}) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '');
  const [contexto, setContexto] = useState(inicial?.contexto ?? '');
  const [perguntas, setPerguntas] = useState<Pergunta[]>(inicial?.perguntas ?? []);
  const [jsonAberto, setJsonAberto] = useState(false);
  const [jsonTxt, setJsonTxt] = useState('');
  const [jsonErro, setJsonErro] = useState('');

  const setP = (i: number, patch: Partial<Pergunta>) =>
    setPerguntas(ps => ps.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const addP = () => setPerguntas(ps => [...ps, perguntaVazia(`p${ps.length + 1}_${Date.now().toString(36)}`)]);
  const rmP = (i: number) => setPerguntas(ps => ps.filter((_, idx) => idx !== i));
  const mover = (i: number, d: -1 | 1) => setPerguntas(ps => {
    const j = i + d;
    if (j < 0 || j >= ps.length) return ps;
    const c = [...ps]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  const importarJson = () => {
    setJsonErro('');
    try {
      const o = JSON.parse(jsonTxt);
      if (o.titulo) setTitulo(String(o.titulo));
      if (o.contexto != null) setContexto(String(o.contexto));
      const arr = Array.isArray(o.perguntas) ? o.perguntas : [];
      setPerguntas(arr.map((p: Record<string, unknown>, i: number) => ({
        id: String(p.id ?? `p${i + 1}`),
        enunciado: String(p.enunciado ?? ''),
        tipo: (TIPOS.includes(p.tipo as TipoPergunta) ? p.tipo : 'texto_curto') as TipoPergunta,
        obrigatoria: !!p.obrigatoria,
        ajuda: p.ajuda != null ? String(p.ajuda) : null,
        opcoes: Array.isArray(p.opcoes) ? (p.opcoes as unknown[]).map(String) : [],
        sugestao: p.sugestao ?? null,
      })));
      setJsonAberto(false);
    } catch {
      setJsonErro('JSON inválido.');
    }
  };

  const salvar = () => {
    if (!titulo.trim()) return;
    onSalvar({ titulo: titulo.trim(), contexto: contexto.trim() || null, perguntas });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-violet-300 dark:border-violet-700 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-black text-slate-900 dark:text-white">
          {inicial ? 'Editar formulário' : 'Novo formulário'}
        </h3>
        <button onClick={() => setJsonAberto(v => !v)}
          className="text-xs font-bold text-violet-600 hover:underline">
          {jsonAberto ? 'fechar' : 'Importar JSON'}
        </button>
      </div>

      {jsonAberto && (
        <div className="space-y-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
          <textarea value={jsonTxt} onChange={e => setJsonTxt(e.target.value)} rows={6}
            placeholder='{"titulo":"...","contexto":"...","perguntas":[{"id":"p1","enunciado":"...","tipo":"escolha_unica","obrigatoria":true,"opcoes":["A","B"],"sugestao":"A"}]}'
            className={`${inp} font-mono text-xs`} />
          {jsonErro && <p className="text-xs text-red-600">{jsonErro}</p>}
          <button onClick={importarJson} className="px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg">
            Preencher com esse JSON
          </button>
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Título</label>
        <input value={titulo} onChange={e => setTitulo(e.target.value)} className={inp} placeholder="Ex: Confirmar 3 pontos da folha" />
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Contexto (markdown leve: # título, **negrito**, - lista)</label>
        <textarea value={contexto} onChange={e => setContexto(e.target.value)} rows={4} className={inp} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase">Perguntas ({perguntas.length})</span>
          <button onClick={addP} className="text-xs font-bold text-violet-600 hover:underline">+ pergunta</button>
        </div>
        {perguntas.map((p, i) => (
          <div key={p.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-start gap-2">
              <input value={p.enunciado} onChange={e => setP(i, { enunciado: e.target.value })}
                placeholder="Enunciado da pergunta" className={`${inp} flex-1`} />
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => mover(i, -1)} className="text-slate-400 hover:text-slate-700 text-xs px-1">▲</button>
                <button onClick={() => mover(i, 1)} className="text-slate-400 hover:text-slate-700 text-xs px-1">▼</button>
              </div>
              <button onClick={() => rmP(i)} className="text-red-400 hover:text-red-600 text-sm px-1 shrink-0">✕</button>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={p.tipo} onChange={e => setP(i, { tipo: e.target.value as TipoPergunta })}
                className="px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                {TIPOS.map(t => <option key={t} value={t}>{TIPO_PERGUNTA_LABEL[t]}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={p.obrigatoria} onChange={e => setP(i, { obrigatoria: e.target.checked })} />
                obrigatória
              </label>
            </div>
            <input value={p.ajuda ?? ''} onChange={e => setP(i, { ajuda: e.target.value || null })}
              placeholder="Texto de ajuda (opcional)" className={`${inp} text-xs`} />
            {(p.tipo === 'escolha_unica' || p.tipo === 'escolha_multipla') && (
              <input value={p.opcoes.join(' | ')} onChange={e => setP(i, { opcoes: e.target.value.split('|').map(s => s.trim()).filter(Boolean) })}
                placeholder="Opções separadas por | (ex: Erro, remover | Real, manter)" className={`${inp} text-xs`} />
            )}
            <input
              value={p.sugestao == null ? '' : String(p.sugestao)}
              onChange={e => setP(i, { sugestao: e.target.value || null })}
              placeholder="Resposta sugerida / default (opcional)" className={`${inp} text-xs`} />
          </div>
        ))}
      </div>

      {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}
      <div className="flex gap-3">
        <button onClick={onCancelar} className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
          Cancelar
        </button>
        <button onClick={salvar} disabled={enviando || !titulo.trim()}
          className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-700 disabled:opacity-50">
          {enviando ? 'Salvando...' : 'Salvar formulário'}
        </button>
      </div>
    </div>
  );
}

// ── Preenchimento (cliente) ────────────────────────────────────────────────

function PreenchimentoFormulario({
  form, enviando, erro, onSalvar,
}: {
  form: Formulario;
  autor: Autor;
  enviando: boolean;
  erro: string;
  onSalvar: (respostas: Record<string, RespostaValor>, finalizar: boolean) => void;
}) {
  const [resp, setResp] = useState<Record<string, RespostaValor>>(() => {
    const base: Record<string, RespostaValor> = {};
    for (const p of form.perguntas) {
      base[p.id] = form.respostas[p.id] ?? (p.sugestao ?? (p.tipo === 'escolha_multipla' ? [] : ''));
    }
    return base;
  });
  const set = (id: string, v: RespostaValor) => setResp(r => ({ ...r, [id]: v }));

  return (
    <div className="space-y-4">
      {form.perguntas.map(p => (
        <div key={p.id}>
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
            {p.enunciado} {p.obrigatoria && <span className="text-red-500">*</span>}
          </label>
          {p.ajuda && <p className="text-xs text-slate-400 mb-1">{p.ajuda}</p>}
          <CampoResposta pergunta={p} valor={resp[p.id]} onChange={v => set(p.id, v)} />
        </div>
      ))}
      {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}
      <div className="flex gap-3">
        <button onClick={() => onSalvar(resp, false)} disabled={enviando}
          className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm disabled:opacity-50">
          Salvar rascunho
        </button>
        <button onClick={() => onSalvar(resp, true)} disabled={enviando}
          className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 disabled:opacity-50">
          {enviando ? 'Enviando...' : 'Enviar respostas'}
        </button>
      </div>
    </div>
  );
}

function CampoResposta({
  pergunta, valor, onChange,
}: {
  pergunta: Pergunta;
  valor: RespostaValor;
  onChange: (v: RespostaValor) => void;
}) {
  const p = pergunta;
  if (p.tipo === 'texto_longo')
    return <textarea value={valor ?? ''} onChange={e => onChange(e.target.value)} rows={3} className={inp} />;
  if (p.tipo === 'numero' || p.tipo === 'valor')
    return <input type="number" step={p.tipo === 'valor' ? '0.01' : '1'} value={valor ?? ''} onChange={e => onChange(e.target.value)} className={inp} />;
  if (p.tipo === 'data')
    return <input type="date" value={valor ?? ''} onChange={e => onChange(e.target.value)} className={inp} />;
  if (p.tipo === 'sim_nao')
    return (
      <div className="flex gap-2">
        {[['Sim', true], ['Não', false]].map(([l, v]) => (
          <button key={l as string} type="button" onClick={() => onChange(v)}
            className={`px-4 py-2 rounded-lg text-sm font-bold border-2 ${
              valor === v ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-500'
            }`}>
            {l as string}
          </button>
        ))}
      </div>
    );
  if (p.tipo === 'escolha_unica')
    return (
      <div className="space-y-1.5">
        {p.opcoes.map(o => (
          <button key={o} type="button" onClick={() => onChange(o)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm border-2 ${
              valor === o ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}>
            {o}
          </button>
        ))}
      </div>
    );
  if (p.tipo === 'escolha_multipla') {
    const arr: string[] = Array.isArray(valor) ? valor : [];
    return (
      <div className="space-y-1.5">
        {p.opcoes.map(o => (
          <label key={o} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 px-3 py-2 border-2 border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer">
            <input type="checkbox" checked={arr.includes(o)}
              onChange={e => onChange(e.target.checked ? [...arr, o] : arr.filter(x => x !== o))} />
            {o}
          </label>
        ))}
      </div>
    );
  }
  return <input value={valor ?? ''} onChange={e => onChange(e.target.value)} className={inp} />;
}

// ── Respostas lado a lado (Atila vê / cliente depois de enviar) ────────────

function RespostasView({ form }: { form: Formulario }) {
  const fmt = (p: Pergunta, v: RespostaValor) => {
    if (v == null || v === '') return null;
    if (p.tipo === 'sim_nao') return v === true ? 'Sim' : v === false ? 'Não' : String(v);
    if (p.tipo === 'valor') return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  };
  return (
    <div className="space-y-3">
      {form.perguntas.map(p => {
        const r = fmt(p, form.respostas[p.id]);
        return (
          <div key={p.id} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{p.enunciado}</div>
            {p.ajuda && <div className="text-xs text-slate-400">{p.ajuda}</div>}
            <div className={`text-sm mt-0.5 ${r ? 'text-slate-900 dark:text-white font-medium' : 'text-slate-400 italic'}`}>
              {r ?? 'sem resposta'}
              {p.sugestao != null && String(p.sugestao) !== '' && !r && (
                <span className="text-slate-400"> · sugestão: {String(p.sugestao)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
