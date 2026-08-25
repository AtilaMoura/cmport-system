"use client"

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { api } from '@/lib/api';
import { useFiltrosFluxo } from '@/lib/useFiltrosFluxo';
import { FiltrosFluxo } from '@/components/fluxo-financeiro/FiltrosFluxo';
import {
  type CategoriaFinanceira, type Despesa, type DespesaParcela,
  fmtValor, fmtData, FORMAS_PAGAMENTO, FORMA_LABEL,
} from '@/lib/fluxoFinanceiro';

interface BancoOpcao {
  id: number;
  nome: string;
  razao_social_titular: string | null;
  ativo: boolean;
}

interface LinhaParcela {
  numero_parcela: number;
  valor: string;
  data_vencimento: string;
}

interface ModalPagarState {
  parcelaId: number;
  descricaoDespesa: string;
  numeroParcela: number;
  totalParcelas: number;
  banco_id: string;
  data_pagamento: string;
  forma_pagamento: string;
}

interface EdicaoParcelaState {
  parcelaId: number;
  valor: string;
  data_vencimento: string;
}

interface LinhaComMeta {
  despesa: Despesa;
  parcela: DespesaParcela;
  categoriaNome: string;
  bancoNome: string;
}

interface EdicaoDespesaForm {
  descricao: string;
  categoria_id: string;
  banco_previsto_id: string;
  observacao: string;
}

const CNPJ_OPCOES = [
  { label: 'CMPORT', value: '22761557000188' },
  { label: 'CMPORT TEC', value: '65756913000188' },
];

const TIPOS_PAGAMENTO = [
  { v: 'UNICO', l: 'Pagamento único' },
  { v: 'PARCELADO', l: 'Parcelado' },
  { v: 'RECORRENTE', l: 'Recorrente' },
];

const NOVA_DESPESA_VAZIA = {
  descricao: '',
  categoria_id: '',
  cnpj: CNPJ_OPCOES[0].value,
  banco_previsto_id: '',
  tipo_pagamento: 'UNICO',
  observacao: '',
  // UNICO
  valor_total: '',
  data_primeira_parcela: '',
  // PARCELADO — usados só pra sugerir a tabela editável abaixo
  valor_total_sugerido: '',
  numero_parcelas_sugerido: '2',
  data_primeira_parcela_parcelado: '',
  // RECORRENTE
  valor_recorrente: '',
  dia_vencimento: '10',
  data_inicio: '',
};

const LABEL_CURTO_CNPJ: Record<string, string> = {
  '22761557000188': 'CMPORT',
  '65756913000188': 'CMPORT TEC',
};
const ORDEM_CNPJ = ['22761557000188', '65756913000188'];

function DespesasContent() {
  const { ano, mes, cnpjFiltro, setAno, setMes, setCnpjFiltro } = useFiltrosFluxo();

  const [categorias, setCategorias] = useState<CategoriaFinanceira[]>([]);
  const [bancos, setBancos] = useState<BancoOpcao[]>([]);
  const [modalNova, setModalNova] = useState(false);
  const [novaDespesa, setNovaDespesa] = useState(NOVA_DESPESA_VAZIA);
  const [parcelasTabela, setParcelasTabela] = useState<LinhaParcela[]>([]);
  const [salvandoDespesa, setSalvandoDespesa] = useState(false);

  const [novaCategoriaAberto, setNovaCategoriaAberto] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState('');
  const [criandoCategoria, setCriandoCategoria] = useState(false);

  const [gerenciarCategoriasAberto, setGerenciarCategoriasAberto] = useState(false);
  const [categoriaEditandoId, setCategoriaEditandoId] = useState<number | null>(null);
  const [categoriaEditandoNome, setCategoriaEditandoNome] = useState('');

  // ── Fase 5: pendências de despesa ──
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [loadingDespesas, setLoadingDespesas] = useState(true);
  const [modalPagar, setModalPagar] = useState<ModalPagarState | null>(null);
  const [salvandoPagamento, setSalvandoPagamento] = useState(false);
  const [edicaoParcela, setEdicaoParcela] = useState<EdicaoParcelaState | null>(null);
  const [salvandoEdicaoParcela, setSalvandoEdicaoParcela] = useState(false);

  // ── Fase 5b: busca/filtro/breakdown consolidados ──
  const [buscaDespesa, setBuscaDespesa] = useState('');
  const [categoriaFiltroDespesa, setCategoriaFiltroDespesa] = useState('');
  const [bancoFiltroDespesa, setBancoFiltroDespesa] = useState('');

  // ── Fase 8: detalhe da despesa (ver todas as parcelas + editar + excluir) ──
  const [modalDetalheId, setModalDetalheId] = useState<number | null>(null);
  const [edicaoDespesaForm, setEdicaoDespesaForm] = useState<EdicaoDespesaForm>({
    descricao: '', categoria_id: '', banco_previsto_id: '', observacao: '',
  });
  const [salvandoDespesaEdit, setSalvandoDespesaEdit] = useState(false);
  const [excluindoDespesa, setExcluindoDespesa] = useState(false);

  const carregarCategorias = useCallback(async () => {
    try {
      const { data } = await api.get('/categorias-financeiras', { params: { grupo: 'DESPESA', ativo: true } });
      setCategorias(data);
    } catch {
      setCategorias([]);
    }
  }, []);

  const carregarBancos = useCallback(async () => {
    try {
      const { data } = await api.get('/configuracoes/bancos');
      setBancos(data.filter((b: BancoOpcao) => b.ativo));
    } catch {
      setBancos([]);
    }
  }, []);

  const carregarDespesas = useCallback(async () => {
    setLoadingDespesas(true);
    try {
      const params: Record<string, string | number> = { ano, mes };
      if (cnpjFiltro) params.cnpj = cnpjFiltro;
      const { data } = await api.get('/despesas', { params });
      // Decimal do backend serializa como string
      setDespesas(data.map((d: Despesa) => ({
        ...d,
        valor_total: Number(d.valor_total),
        parcelas: d.parcelas.map((p: DespesaParcela) => ({ ...p, valor: Number(p.valor) })),
      })));
    } catch {
      setDespesas([]);
    } finally {
      setLoadingDespesas(false);
    }
  }, [ano, mes, cnpjFiltro]);

  useEffect(() => { carregarCategorias(); }, [carregarCategorias]);
  useEffect(() => { carregarBancos(); }, [carregarBancos]);
  useEffect(() => { carregarDespesas(); }, [carregarDespesas]);

  const hojeStr = new Date().toISOString().slice(0, 10);

  const statusBadge = (parcela: DespesaParcela) => {
    if (parcela.status === 'PAGO') {
      return { texto: 'Pago', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' };
    }
    if (parcela.data_vencimento < hojeStr) {
      return { texto: 'Vencida', cls: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400' };
    }
    return { texto: 'Pendente', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' };
  };

  // Cada despesa vem com TODAS as suas parcelas -- filtra so as que vencem no mes/ano do filtro
  const parcelasDoMes = useMemo(() => {
    const linhas: { despesa: Despesa; parcela: DespesaParcela }[] = [];
    for (const despesa of despesas) {
      for (const parcela of despesa.parcelas) {
        const [y, m] = parcela.data_vencimento.split('-');
        if (Number(y) === ano && Number(m) === mes) linhas.push({ despesa, parcela });
      }
    }
    return linhas;
  }, [despesas, ano, mes]);

  const linhasComMeta = useMemo<LinhaComMeta[]>(() => {
    return parcelasDoMes.map(({ despesa, parcela }) => ({
      despesa,
      parcela,
      categoriaNome: categorias.find(c => c.id === despesa.categoria_id)?.nome ?? 'Sem categoria',
      bancoNome: parcela.banco_id ? (bancos.find(b => b.id === parcela.banco_id)?.nome ?? 'Sem banco') : 'Sem banco',
    }));
  }, [parcelasDoMes, categorias, bancos]);

  const porCategoriaDespesa = useMemo(() => {
    const mapa = new Map<string, { nome: string; total: number; itens: LinhaComMeta[] }>();
    for (const l of linhasComMeta) {
      if (!mapa.has(l.categoriaNome)) mapa.set(l.categoriaNome, { nome: l.categoriaNome, total: 0, itens: [] });
      const g = mapa.get(l.categoriaNome)!;
      g.total += l.parcela.valor;
      g.itens.push(l);
    }
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [linhasComMeta]);

  const porBancoDespesa = useMemo(() => {
    const mapa = new Map<string, { nome: string; total: number; itens: LinhaComMeta[] }>();
    for (const l of linhasComMeta) {
      if (!mapa.has(l.bancoNome)) mapa.set(l.bancoNome, { nome: l.bancoNome, total: 0, itens: [] });
      const g = mapa.get(l.bancoNome)!;
      g.total += l.parcela.valor;
      g.itens.push(l);
    }
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [linhasComMeta]);

  const linhasFiltradas = useMemo(() => {
    const filtradas = linhasComMeta.filter(l => {
      if (buscaDespesa && !l.despesa.descricao.toLowerCase().includes(buscaDespesa.toLowerCase())) return false;
      if (categoriaFiltroDespesa && l.categoriaNome !== categoriaFiltroDespesa) return false;
      if (bancoFiltroDespesa && l.bancoNome !== bancoFiltroDespesa) return false;
      return true;
    });
    return filtradas.sort((a, b) => {
      const statusOrdem = (s: string) => (s === 'PENDENTE' ? 0 : 1);
      const diff = statusOrdem(a.parcela.status) - statusOrdem(b.parcela.status);
      if (diff !== 0) return diff;
      return a.parcela.data_vencimento.localeCompare(b.parcela.data_vencimento);
    });
  }, [linhasComMeta, buscaDespesa, categoriaFiltroDespesa, bancoFiltroDespesa]);

  const totalPagoDespesa = linhasFiltradas.filter(l => l.parcela.status === 'PAGO').reduce((s, l) => s + l.parcela.valor, 0);
  const totalPendenteDespesa = linhasFiltradas.filter(l => l.parcela.status !== 'PAGO').reduce((s, l) => s + l.parcela.valor, 0);
  const totalGeralDespesa = totalPagoDespesa + totalPendenteDespesa;

  const cnpjsInfoDespesa = useMemo(() => {
    const cnpjsPresentes = Array.from(new Set(linhasFiltradas.map(l => l.despesa.cnpj)))
      .sort((a, b) => ORDEM_CNPJ.indexOf(a) - ORDEM_CNPJ.indexOf(b));
    return cnpjsPresentes.map(cnpj => {
      const linhas = linhasFiltradas.filter(l => l.despesa.cnpj === cnpj);
      const pago = linhas.filter(l => l.parcela.status === 'PAGO').reduce((s, l) => s + l.parcela.valor, 0);
      const pendente = linhas.filter(l => l.parcela.status !== 'PAGO').reduce((s, l) => s + l.parcela.valor, 0);
      return {
        cnpj,
        labelCurto: LABEL_CURTO_CNPJ[cnpj] ?? cnpj,
        qtd: linhas.length,
        pago,
        pendente,
        geral: pago + pendente,
      };
    });
  }, [linhasFiltradas]);

  const despesaDetalhe = useMemo(() => despesas.find(d => d.id === modalDetalheId) ?? null, [despesas, modalDetalheId]);

  const abrirDetalheDespesa = (despesa: Despesa) => {
    setModalDetalheId(despesa.id);
    setEdicaoDespesaForm({
      descricao: despesa.descricao,
      categoria_id: despesa.categoria_id ? String(despesa.categoria_id) : '',
      banco_previsto_id: despesa.banco_previsto_id ? String(despesa.banco_previsto_id) : '',
      observacao: despesa.observacao ?? '',
    });
  };

  const fecharDetalheDespesa = () => {
    setModalDetalheId(null);
  };

  const salvarEdicaoDespesa = async () => {
    if (!despesaDetalhe) return;
    if (!edicaoDespesaForm.descricao.trim() || !edicaoDespesaForm.categoria_id) {
      alert('Preencha descrição e categoria.'); return;
    }
    setSalvandoDespesaEdit(true);
    try {
      await api.put(`/despesas/${despesaDetalhe.id}`, {
        descricao: edicaoDespesaForm.descricao.trim(),
        categoria_id: Number(edicaoDespesaForm.categoria_id),
        banco_previsto_id: edicaoDespesaForm.banco_previsto_id ? Number(edicaoDespesaForm.banco_previsto_id) : null,
        observacao: edicaoDespesaForm.observacao || null,
      });
      await carregarDespesas();
    } catch {
      alert('Erro ao salvar as alterações da despesa.');
    } finally {
      setSalvandoDespesaEdit(false);
    }
  };

  const excluirDespesa = async () => {
    if (!despesaDetalhe) return;
    if (!confirm(`Excluir "${despesaDetalhe.descricao}" e todas as suas ${despesaDetalhe.parcelas.length} parcela(s)? Essa ação pode ser desfeita só pela auditoria de exclusões.`)) return;
    setExcluindoDespesa(true);
    try {
      await api.delete(`/despesas/${despesaDetalhe.id}`);
      setModalDetalheId(null);
      await carregarDespesas();
    } catch {
      alert('Erro ao excluir a despesa.');
    } finally {
      setExcluindoDespesa(false);
    }
  };

  const abrirModalPagar = (despesa: Despesa, parcela: DespesaParcela) => {
    setModalPagar({
      parcelaId: parcela.id,
      descricaoDespesa: despesa.descricao,
      numeroParcela: parcela.numero_parcela,
      totalParcelas: parcela.total_parcelas,
      banco_id: '',
      data_pagamento: new Date().toISOString().slice(0, 10),
      forma_pagamento: 'PIX',
    });
  };

  const confirmarPagamento = async () => {
    if (!modalPagar) return;
    if (!modalPagar.banco_id) { alert('Selecione o banco.'); return; }
    setSalvandoPagamento(true);
    try {
      await api.patch(`/despesas/parcelas/${modalPagar.parcelaId}/pagar`, {
        data_pagamento: modalPagar.data_pagamento,
        banco_id: Number(modalPagar.banco_id),
        forma_pagamento: modalPagar.forma_pagamento,
      });
      setModalPagar(null);
      await carregarDespesas();
    } catch {
      alert('Erro ao marcar a parcela como paga.');
    } finally {
      setSalvandoPagamento(false);
    }
  };

  const iniciarEdicaoParcela = (parcela: DespesaParcela) => {
    setEdicaoParcela({ parcelaId: parcela.id, valor: String(parcela.valor), data_vencimento: parcela.data_vencimento });
  };

  const salvarEdicaoParcela = async () => {
    if (!edicaoParcela) return;
    if (!edicaoParcela.valor || Number(edicaoParcela.valor) <= 0 || !edicaoParcela.data_vencimento) {
      alert('Preencha valor e data de vencimento.'); return;
    }
    setSalvandoEdicaoParcela(true);
    try {
      await api.put(`/despesas/parcelas/${edicaoParcela.parcelaId}`, {
        valor: Number(edicaoParcela.valor),
        data_vencimento: edicaoParcela.data_vencimento,
      });
      setEdicaoParcela(null);
      await carregarDespesas();
    } catch {
      alert('Erro ao editar a parcela.');
    } finally {
      setSalvandoEdicaoParcela(false);
    }
  };

  const abrirNova = () => {
    setNovaDespesa({ ...NOVA_DESPESA_VAZIA });
    setParcelasTabela([]);
    setNovaCategoriaAberto(false);
    setNovaCategoriaNome('');
    setGerenciarCategoriasAberto(false);
    setCategoriaEditandoId(null);
    setModalNova(true);
  };

  const trocarTipoPagamento = (tipo: string) => {
    setNovaDespesa(p => ({ ...p, tipo_pagamento: tipo }));
    setParcelasTabela([]);
  };

  const gerarTabelaParcelas = () => {
    const total = Number(novaDespesa.valor_total_sugerido);
    const n = Number(novaDespesa.numero_parcelas_sugerido);
    const dataBase = novaDespesa.data_primeira_parcela_parcelado;
    if (!total || total <= 0 || !n || n < 2 || !dataBase) {
      alert('Preencha valor total, nº de parcelas (mín. 2) e data da 1ª parcela pra gerar a tabela.');
      return;
    }
    const valorParcela = Math.round((total / n) * 100) / 100;
    let soma = 0;
    const linhas: LinhaParcela[] = [];
    for (let i = 1; i <= n; i++) {
      const d = new Date(dataBase + 'T00:00:00');
      d.setDate(d.getDate() + 30 * (i - 1));
      const valor = i === n ? Math.round((total - soma) * 100) / 100 : valorParcela;
      if (i < n) soma += valor;
      linhas.push({ numero_parcela: i, valor: valor.toFixed(2), data_vencimento: d.toISOString().slice(0, 10) });
    }
    setParcelasTabela(linhas);
  };

  const editarLinhaParcela = (index: number, campo: 'valor' | 'data_vencimento', valor: string) => {
    setParcelasTabela(prev => prev.map((p, i) => i === index ? { ...p, [campo]: valor } : p));
  };

  const replicarValorParaTodas = () => {
    if (parcelasTabela.length === 0) return;
    const v = parcelasTabela[0].valor;
    setParcelasTabela(prev => prev.map(p => ({ ...p, valor: v })));
  };

  const totalParcelasTabela = parcelasTabela.reduce((s, p) => s + (Number(p.valor) || 0), 0);

  const salvarDespesa = async () => {
    if (!novaDespesa.descricao || !novaDespesa.categoria_id) {
      alert('Preencha descrição e categoria.'); return;
    }

    const payload: Record<string, unknown> = {
      descricao: novaDespesa.descricao,
      categoria_id: Number(novaDespesa.categoria_id),
      cnpj: novaDespesa.cnpj,
      banco_previsto_id: novaDespesa.banco_previsto_id ? Number(novaDespesa.banco_previsto_id) : null,
      tipo_pagamento: novaDespesa.tipo_pagamento,
      observacao: novaDespesa.observacao || null,
    };

    if (novaDespesa.tipo_pagamento === 'UNICO') {
      if (!novaDespesa.valor_total || !novaDespesa.data_primeira_parcela) {
        alert('Preencha valor e data do vencimento.'); return;
      }
      payload.valor_total = Number(novaDespesa.valor_total);
      payload.data_primeira_parcela = novaDespesa.data_primeira_parcela;
    } else if (novaDespesa.tipo_pagamento === 'PARCELADO') {
      if (parcelasTabela.length < 2) {
        alert('Gere a tabela de parcelas (mínimo 2 parcelas) antes de salvar.'); return;
      }
      if (parcelasTabela.some(p => !p.valor || Number(p.valor) <= 0 || !p.data_vencimento)) {
        alert('Preencha valor e data em todas as parcelas.'); return;
      }
      payload.parcelas = parcelasTabela.map(p => ({
        numero_parcela: p.numero_parcela,
        valor: Number(p.valor),
        data_vencimento: p.data_vencimento,
      }));
    } else {
      // RECORRENTE
      if (!novaDespesa.valor_recorrente || !novaDespesa.dia_vencimento || !novaDespesa.data_inicio) {
        alert('Preencha valor mensal, dia de vencimento e data de início.'); return;
      }
      const dia = Number(novaDespesa.dia_vencimento);
      if (dia < 1 || dia > 28) {
        alert('Dia de vencimento deve ser entre 1 e 28.'); return;
      }
      payload.valor_recorrente = Number(novaDespesa.valor_recorrente);
      payload.dia_vencimento = dia;
      payload.data_inicio = novaDespesa.data_inicio;
    }

    setSalvandoDespesa(true);
    try {
      await api.post('/despesas', payload);
      setModalNova(false);
      await carregarDespesas();
    } catch {
      alert('Erro ao salvar a despesa.');
    } finally {
      setSalvandoDespesa(false);
    }
  };

  const criarCategoriaInline = async () => {
    if (!novaCategoriaNome.trim()) { alert('Preencha o nome da categoria.'); return; }
    setCriandoCategoria(true);
    try {
      const { data } = await api.post('/categorias-financeiras', { nome: novaCategoriaNome.trim(), grupo: 'DESPESA' });
      setCategorias(prev => [...prev, data]);
      setNovaDespesa(p => ({ ...p, categoria_id: String(data.id) }));
      setNovaCategoriaAberto(false);
      setNovaCategoriaNome('');
    } catch {
      alert('Erro ao criar categoria (talvez já exista uma com esse nome).');
    } finally {
      setCriandoCategoria(false);
    }
  };

  const iniciarEdicaoCategoria = (cat: CategoriaFinanceira) => {
    setCategoriaEditandoId(cat.id);
    setCategoriaEditandoNome(cat.nome);
  };

  const salvarEdicaoCategoria = async () => {
    if (categoriaEditandoId === null || !categoriaEditandoNome.trim()) return;
    try {
      const { data } = await api.put(`/categorias-financeiras/${categoriaEditandoId}`, { nome: categoriaEditandoNome.trim() });
      setCategorias(prev => prev.map(c => c.id === data.id ? data : c));
      setCategoriaEditandoId(null);
    } catch {
      alert('Erro ao editar categoria.');
    }
  };

  const desativarCategoria = async (id: number) => {
    if (!confirm('Desativar essa categoria? Ela deixa de aparecer nas opções (despesas já lançadas continuam intactas).')) return;
    try {
      await api.delete(`/categorias-financeiras/${id}`);
      setCategorias(prev => prev.filter(c => c.id !== id));
      if (novaDespesa.categoria_id === String(id)) setNovaDespesa(p => ({ ...p, categoria_id: '' }));
    } catch {
      alert('Erro ao desativar categoria.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Despesas Escritório</h1>
          <p className="text-xs text-slate-500 mt-0.5">Salários, aluguel, tarifas bancárias, combustível e demais despesas fixas</p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <FiltrosFluxo ano={ano} mes={mes} cnpjFiltro={cnpjFiltro} onAnoChange={setAno} onMesChange={setMes}
          onCnpjChange={setCnpjFiltro} mostrarFiltroCnpj acoesExtra={
          <button onClick={abrirNova}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all whitespace-nowrap">
            + Nova Despesa
          </button>
        } />

        {loadingDespesas ? (
          <div className="text-center py-12 text-slate-400 animate-pulse">Carregando...</div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <input type="text" value={buscaDespesa} onChange={e => setBuscaDespesa(e.target.value)} placeholder="Buscar descrição..."
                  className="flex-1 min-w-40 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white" />
                <select value={categoriaFiltroDespesa} onChange={e => setCategoriaFiltroDespesa(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
                  <option value="">Todas as categorias</option>
                  {porCategoriaDespesa.map(g => <option key={g.nome} value={g.nome}>{g.nome}</option>)}
                </select>
                <select value={bancoFiltroDespesa} onChange={e => setBancoFiltroDespesa(e.target.value)}
                  className="px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white">
                  <option value="">Todos os bancos</option>
                  {porBancoDespesa.map(g => <option key={g.nome} value={g.nome}>{g.nome}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total pago</div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400">{fmtValor(totalPagoDespesa)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total pendente</div>
                <div className="text-xl font-black text-amber-600 dark:text-amber-400">{fmtValor(totalPendenteDespesa)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Total geral</div>
                <div className="text-xl font-black text-red-700 dark:text-red-400">{fmtValor(totalGeralDespesa)}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Lançamentos</div>
                <div className="text-xl font-black text-slate-900 dark:text-white">{linhasFiltradas.length}</div>
              </div>
            </div>

            {/* Cards por CNPJ (CMPORT / CMPORT TEC) */}
            {cnpjsInfoDespesa.length > 0 && (
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cnpjsInfoDespesa.length}, minmax(0, 1fr))` }}>
                {cnpjsInfoDespesa.map(c => (
                  <div key={c.cnpj} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wide">{c.labelCurto}</h3>
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{c.qtd}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Pago</div>
                        <div className="text-sm font-black text-emerald-600 dark:text-emerald-400">{fmtValor(c.pago)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Pendente</div>
                        <div className="text-sm font-black text-amber-600 dark:text-amber-400">{fmtValor(c.pendente)}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase">Geral</div>
                        <div className="text-sm font-black text-red-700 dark:text-red-400">{fmtValor(c.geral)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Breakdown por categoria */}
            <div className="flex flex-wrap gap-2">
              {porCategoriaDespesa.map(g => (
                <button key={g.nome} onClick={() => setCategoriaFiltroDespesa(categoriaFiltroDespesa === g.nome ? '' : g.nome)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    categoriaFiltroDespesa === g.nome
                      ? 'bg-red-900 text-white dark:bg-red-500'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}>
                  <span className="font-semibold">{g.nome}</span>{' '}
                  <span className="font-black">{fmtValor(g.total)}</span>
                  <span className="opacity-70"> ({g.itens.length})</span>
                </button>
              ))}
            </div>

            {/* Breakdown por banco */}
            <div className="flex flex-wrap gap-2">
              {porBancoDespesa.map(g => (
                <button key={g.nome} onClick={() => setBancoFiltroDespesa(bancoFiltroDespesa === g.nome ? '' : g.nome)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    bancoFiltroDespesa === g.nome
                      ? 'bg-teal-900 text-white dark:bg-teal-600'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}>
                  <span className="font-semibold">💳 {g.nome}</span>{' '}
                  <span className="font-black">{fmtValor(g.total)}</span>
                  <span className="opacity-70"> ({g.itens.length})</span>
                </button>
              ))}
            </div>

            {/* Lista de parcelas -- Pendente primeiro, Pago depois */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              {linhasFiltradas.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400">Nenhuma parcela de despesa encontrada.</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {linhasFiltradas.map(({ despesa, parcela, categoriaNome, bancoNome }) => {
                    const editando = edicaoParcela?.parcelaId === parcela.id;
                    const badge = statusBadge(parcela);
                    return (
                      <div key={parcela.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3">
                        <button type="button" onClick={() => abrirDetalheDespesa(despesa)} className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate hover:text-red-600 dark:hover:text-red-400 transition-colors">
                            {despesa.descricao}{parcela.total_parcelas > 1 ? ` (${parcela.numero_parcela}/${parcela.total_parcelas})` : ''}
                          </p>
                          <p className="text-xs text-slate-400">
                            {categoriaNome}
                            {parcela.status === 'PAGO' && parcela.data_pagamento
                              ? ` · pago em ${fmtData(parcela.data_pagamento)} · ${bancoNome}`
                              : ` · vence ${fmtData(parcela.data_vencimento)}`}
                          </p>
                        </button>

                        {editando ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <input type="number" step="0.01" min="0" value={edicaoParcela!.valor}
                              onChange={e => setEdicaoParcela(p => p ? { ...p, valor: e.target.value } : p)}
                              className="w-28 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs" />
                            <input type="date" value={edicaoParcela!.data_vencimento}
                              onChange={e => setEdicaoParcela(p => p ? { ...p, data_vencimento: e.target.value } : p)}
                              className="px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs" />
                            <button onClick={() => setEdicaoParcela(null)}
                              className="px-2 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold">
                              Cancelar
                            </button>
                            <button onClick={salvarEdicaoParcela} disabled={salvandoEdicaoParcela}
                              className="px-2 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:brightness-110 disabled:opacity-50">
                              {salvandoEdicaoParcela ? 'Salvando...' : 'Salvar'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 sm:gap-3">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{fmtValor(parcela.valor)}</span>
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap ${badge.cls}`}>
                              {badge.texto}
                            </span>
                            {parcela.status === 'PENDENTE' && (
                              <>
                                <button onClick={() => iniciarEdicaoParcela(parcela)}
                                  className="text-xs font-bold text-slate-400 hover:text-red-600 dark:hover:text-red-400 whitespace-nowrap">
                                  editar
                                </button>
                                <button onClick={() => abrirModalPagar(despesa, parcela)}
                                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:brightness-110 transition-all whitespace-nowrap">
                                  Marcar como pago
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal Nova Despesa ── */}
      {modalNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalNova(false)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-5">+ Nova Despesa</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Descrição</label>
                <input type="text" value={novaDespesa.descricao} onChange={e => setNovaDespesa(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Ex: Aluguel do escritório"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Categoria</label>
                  <select value={novaDespesa.categoria_id} onChange={e => setNovaDespesa(p => ({ ...p, categoria_id: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm">
                    <option value="">— Selecione —</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                  <div className="flex gap-3 mt-1.5">
                    <button type="button" onClick={() => setNovaCategoriaAberto(s => !s)}
                      className="text-xs font-bold text-red-600 dark:text-red-400 underline decoration-dotted underline-offset-2">
                      + Nova categoria
                    </button>
                    <button type="button" onClick={() => setGerenciarCategoriasAberto(s => !s)}
                      className="text-xs font-bold text-slate-500 dark:text-slate-400 underline decoration-dotted underline-offset-2">
                      Gerenciar categorias
                    </button>
                  </div>

                  {novaCategoriaAberto && (
                    <div className="mt-2 border-2 border-dashed border-red-300 dark:border-red-500/40 rounded-xl p-3 space-y-2">
                      <input type="text" autoFocus value={novaCategoriaNome} onChange={e => setNovaCategoriaNome(e.target.value)}
                        placeholder="Nome da categoria"
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => { setNovaCategoriaAberto(false); setNovaCategoriaNome(''); }}
                          className="flex-1 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-bold text-xs">
                          Cancelar
                        </button>
                        <button type="button" onClick={criarCategoriaInline} disabled={criandoCategoria || !novaCategoriaNome.trim()}
                          className="flex-1 py-1.5 bg-red-600 text-white rounded-lg font-bold text-xs hover:brightness-110 transition-all disabled:opacity-50">
                          {criandoCategoria ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  )}

                  {gerenciarCategoriasAberto && (
                    <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                      {categorias.map(c => (
                        <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                          {categoriaEditandoId === c.id ? (
                            <>
                              <input type="text" autoFocus value={categoriaEditandoNome} onChange={e => setCategoriaEditandoNome(e.target.value)}
                                className="flex-1 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs" />
                              <button type="button" onClick={salvarEdicaoCategoria} className="text-xs font-bold text-red-600 dark:text-red-400">✓</button>
                              <button type="button" onClick={() => setCategoriaEditandoId(null)} className="text-xs font-bold text-slate-400">×</button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-xs text-slate-700 dark:text-slate-300">{c.nome}</span>
                              <button type="button" onClick={() => iniciarEdicaoCategoria(c)} className="text-xs font-bold text-slate-400 hover:text-red-600 dark:hover:text-red-400">editar</button>
                              <button type="button" onClick={() => desativarCategoria(c.id)} className="text-xs font-bold text-slate-400 hover:text-red-600 dark:hover:text-red-400">desativar</button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">CNPJ</label>
                  <select value={novaDespesa.cnpj} onChange={e => setNovaDespesa(p => ({ ...p, cnpj: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm">
                    {CNPJ_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Banco previsto (opcional)</label>
                <select value={novaDespesa.banco_previsto_id} onChange={e => setNovaDespesa(p => ({ ...p, banco_previsto_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm">
                  <option value="">— Nenhum —</option>
                  {bancos.map(b => <option key={b.id} value={b.id}>{b.nome}{b.razao_social_titular ? ` (${b.razao_social_titular})` : ''}</option>)}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Só uma sugestão — o banco continua editável na hora de marcar cada parcela como paga.</p>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Tipo de pagamento</label>
                <div className="flex gap-2">
                  {TIPOS_PAGAMENTO.map(op => (
                    <button key={op.v} type="button"
                      onClick={() => trocarTipoPagamento(op.v)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                        novaDespesa.tipo_pagamento === op.v
                          ? 'bg-red-900 text-white dark:bg-red-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}>
                      {op.l}
                    </button>
                  ))}
                </div>
              </div>

              {novaDespesa.tipo_pagamento === 'UNICO' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor</label>
                    <input type="number" step="0.01" min="0" value={novaDespesa.valor_total}
                      onChange={e => setNovaDespesa(p => ({ ...p, valor_total: e.target.value }))}
                      placeholder="0,00"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Vencimento</label>
                    <input type="date" value={novaDespesa.data_primeira_parcela}
                      onChange={e => setNovaDespesa(p => ({ ...p, data_primeira_parcela: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                  </div>
                </div>
              )}

              {novaDespesa.tipo_pagamento === 'PARCELADO' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor total (sugestão)</label>
                      <input type="number" step="0.01" min="0" value={novaDespesa.valor_total_sugerido}
                        onChange={e => setNovaDespesa(p => ({ ...p, valor_total_sugerido: e.target.value }))}
                        placeholder="0,00"
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Nº de parcelas</label>
                      <input type="number" min="2" step="1" value={novaDespesa.numero_parcelas_sugerido}
                        onChange={e => setNovaDespesa(p => ({ ...p, numero_parcelas_sugerido: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Vencimento da 1ª parcela</label>
                      <input type="date" value={novaDespesa.data_primeira_parcela_parcelado}
                        onChange={e => setNovaDespesa(p => ({ ...p, data_primeira_parcela_parcelado: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                    </div>
                  </div>

                  <button type="button" onClick={gerarTabelaParcelas}
                    className="w-full py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
                    {parcelasTabela.length > 0 ? '↻ Atualizar tabela de parcelas' : 'Gerar tabela de parcelas'}
                  </button>

                  {parcelasTabela.length > 0 && (
                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800">
                        <span className="text-xs font-bold text-slate-500 uppercase">Parcelas (editável)</span>
                        <button type="button" onClick={replicarValorParaTodas}
                          className="text-xs font-bold text-red-600 dark:text-red-400 underline decoration-dotted underline-offset-2">
                          Replicar valor da 1ª pra todas
                        </button>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
                        {parcelasTabela.map((p, i) => (
                          <div key={p.numero_parcela} className="flex items-center gap-2 px-3 py-2">
                            <span className="text-xs font-bold text-slate-400 w-14 shrink-0">{p.numero_parcela}/{parcelasTabela.length}</span>
                            <input type="number" step="0.01" min="0" value={p.valor}
                              onChange={e => editarLinhaParcela(i, 'valor', e.target.value)}
                              className="flex-1 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs" />
                            <input type="date" value={p.data_vencimento}
                              onChange={e => editarLinhaParcela(i, 'data_vencimento', e.target.value)}
                              className="flex-1 px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs" />
                          </div>
                        ))}
                      </div>
                      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 text-right text-xs font-bold text-slate-700 dark:text-slate-300">
                        Total: {totalParcelasTabela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {novaDespesa.tipo_pagamento === 'RECORRENTE' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Valor mensal</label>
                    <input type="number" step="0.01" min="0" value={novaDespesa.valor_recorrente}
                      onChange={e => setNovaDespesa(p => ({ ...p, valor_recorrente: e.target.value }))}
                      placeholder="0,00"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Dia do vencimento</label>
                    <input type="number" min="1" max="28" step="1" value={novaDespesa.dia_vencimento}
                      onChange={e => setNovaDespesa(p => ({ ...p, dia_vencimento: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Início</label>
                    <input type="date" value={novaDespesa.data_inicio}
                      onChange={e => setNovaDespesa(p => ({ ...p, data_inicio: e.target.value }))}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
                  </div>
                  <p className="text-[11px] text-slate-400 col-span-full">Sem data de fim — gera pendências automaticamente todo mês (horizonte de 12 meses à frente).</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Observação (opcional)</label>
                <input type="text" value={novaDespesa.observacao} onChange={e => setNovaDespesa(p => ({ ...p, observacao: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalNova(false)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={salvarDespesa} disabled={salvandoDespesa}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {salvandoDespesa
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  : '💾 Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Marcar como pago (Fase 5) ── */}
      {modalPagar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setModalPagar(null)}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">Marcar como pago</h2>
            <p className="text-xs text-slate-500 mb-5">
              {modalPagar.descricaoDespesa}{modalPagar.totalParcelas > 1 ? ` (${modalPagar.numeroParcela}/${modalPagar.totalParcelas})` : ''}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Banco</label>
                <select value={modalPagar.banco_id} onChange={e => setModalPagar(p => p ? { ...p, banco_id: e.target.value } : p)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                  <option value="">— Selecione —</option>
                  {bancos.map(b => <option key={b.id} value={b.id}>{b.nome}{b.razao_social_titular ? ` (${b.razao_social_titular})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Data do pagamento</label>
                <input type="date" value={modalPagar.data_pagamento}
                  onChange={e => setModalPagar(p => p ? { ...p, data_pagamento: e.target.value } : p)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Forma de pagamento</label>
                <select value={modalPagar.forma_pagamento} onChange={e => setModalPagar(p => p ? { ...p, forma_pagamento: e.target.value } : p)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none text-sm">
                  {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{FORMA_LABEL[f] || f}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalPagar(null)}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm">
                Cancelar
              </button>
              <button onClick={confirmarPagamento} disabled={salvandoPagamento}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {salvandoPagamento
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  : '✓ Confirmar pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Detalhe da Despesa (Fase 8) ── */}
      {despesaDetalhe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={fecharDetalheDespesa}>
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl p-6 overflow-y-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Detalhe da despesa</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {despesaDetalhe.tipo_pagamento === 'UNICO' && 'Pagamento único'}
                  {despesaDetalhe.tipo_pagamento === 'PARCELADO' && `Parcelado — ${despesaDetalhe.total_parcelas}x`}
                  {despesaDetalhe.tipo_pagamento === 'RECORRENTE' && 'Recorrente'}
                </p>
              </div>
              <button onClick={fecharDetalheDespesa} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-xl leading-none">×</button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Descrição</label>
                <input type="text" value={edicaoDespesaForm.descricao}
                  onChange={e => setEdicaoDespesaForm(p => ({ ...p, descricao: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Categoria</label>
                  <select value={edicaoDespesaForm.categoria_id}
                    onChange={e => setEdicaoDespesaForm(p => ({ ...p, categoria_id: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm">
                    <option value="">— Selecione —</option>
                    {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Banco previsto</label>
                  <select value={edicaoDespesaForm.banco_previsto_id}
                    onChange={e => setEdicaoDespesaForm(p => ({ ...p, banco_previsto_id: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm">
                    <option value="">— Nenhum —</option>
                    {bancos.map(b => <option key={b.id} value={b.id}>{b.nome}{b.razao_social_titular ? ` (${b.razao_social_titular})` : ''}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">Observação</label>
                <input type="text" value={edicaoDespesaForm.observacao}
                  onChange={e => setEdicaoDespesaForm(p => ({ ...p, observacao: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none text-sm" />
              </div>

              <button onClick={salvarEdicaoDespesa} disabled={salvandoDespesaEdit}
                className="w-full py-2.5 bg-red-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {salvandoDespesaEdit
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</>
                  : '💾 Salvar alterações'}
              </button>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <span className="text-xs font-bold text-slate-500 uppercase mb-2 block">Parcelas ({despesaDetalhe.parcelas.length})</span>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                {[...despesaDetalhe.parcelas].sort((a, b) => a.numero_parcela - b.numero_parcela).map(parcela => {
                  const badge = statusBadge(parcela);
                  const editandoEssa = edicaoParcela?.parcelaId === parcela.id;
                  return (
                    <div key={parcela.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {despesaDetalhe.tipo_pagamento === 'RECORRENTE'
                            ? `Parcela ${parcela.numero_parcela}`
                            : parcela.total_parcelas > 1 ? `${parcela.numero_parcela}/${parcela.total_parcelas}` : 'Única'}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {parcela.status === 'PAGO' && parcela.data_pagamento
                            ? `pago em ${fmtData(parcela.data_pagamento)}${parcela.banco_id ? ` · ${bancos.find(b => b.id === parcela.banco_id)?.nome ?? ''}` : ''}`
                            : `vence ${fmtData(parcela.data_vencimento)}`}
                        </p>
                      </div>

                      {editandoEssa ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input type="number" step="0.01" min="0" value={edicaoParcela!.valor}
                            onChange={e => setEdicaoParcela(p => p ? { ...p, valor: e.target.value } : p)}
                            className="w-24 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs" />
                          <input type="date" value={edicaoParcela!.data_vencimento}
                            onChange={e => setEdicaoParcela(p => p ? { ...p, data_vencimento: e.target.value } : p)}
                            className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs" />
                          <button onClick={() => setEdicaoParcela(null)}
                            className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold">
                            Cancelar
                          </button>
                          <button onClick={salvarEdicaoParcela} disabled={salvandoEdicaoParcela}
                            className="px-2 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:brightness-110 disabled:opacity-50">
                            {salvandoEdicaoParcela ? '...' : 'Salvar'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">{fmtValor(parcela.valor)}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase whitespace-nowrap ${badge.cls}`}>
                            {badge.texto}
                          </span>
                          {parcela.status === 'PENDENTE' && (
                            <>
                              <button onClick={() => iniciarEdicaoParcela(parcela)}
                                className="text-[11px] font-bold text-slate-400 hover:text-red-600 dark:hover:text-red-400 whitespace-nowrap">
                                editar
                              </button>
                              <button onClick={() => abrirModalPagar(despesaDetalhe, parcela)}
                                className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-bold hover:brightness-110 whitespace-nowrap">
                                Pagar
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button onClick={excluirDespesa} disabled={excluindoDespesa}
              className="w-full mt-6 py-2.5 bg-slate-100 dark:bg-slate-800 text-red-600 dark:text-red-400 rounded-xl font-bold text-sm hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-50">
              {excluindoDespesa ? 'Excluindo...' : '🗑️ Excluir despesa'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DespesasPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">Carregando...</div>}>
      <DespesasContent />
    </Suspense>
  );
}
