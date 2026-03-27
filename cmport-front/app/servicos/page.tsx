"use client"

import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

interface Servico {
  id: number;
  condominio_id: number;
  tipo: 'manutencao' | 'assistencia';
  data_servico: string;
  descricao: string | null;
  nota_fiscal_id: number | null;
  criado_em: string;
}

interface NotaFiscal {
  id: number;
  numero_nota: string;
  valor: number;
  parcelas: number | null;
  data_vencimento: string;
  status: string;
  condominio_id: number | null;
  descricao_servico: string | null;
  parcelas_json: Array<{ parcela: number; valor: number; data: string | null }> | null;
  valor_boleto_parcela: number | null;
}

interface Boleto {
  id: number;
  nota_fiscal_id: number;
  situacao: string;
  valor_nominal: number;
  valor_total_recebido: number;
  numero_parcela: number;
}

interface ConfigImpostos {
  pct_pis: number;
  pct_cofins: number;
  pct_inss: number;
  pct_csll: number;
  valor_bruto: number;
  valor_liquido: number;
  numero_os: string | null;
  aplicar_juros_default: boolean;
  alerta_impostos: boolean;
  divergencia_impostos: Record<string, { pct: number; config: number; xml: number }> | null;
}

interface Condominio {
  id: number;
  nome: string;
}

interface MassaItem {
  servicoId: number;
  notaId: number;
  condominio: string;
  numeroNota: string;
  valor: string;
  parcelasTotal: number;
  parcelasFaltantes: number[];
  parcelasSelecionadas: number[];
  selecionado: boolean;
  aplicarPis: boolean; pctPis: string;
  aplicarCofins: boolean; pctCofins: string;
  aplicarInss: boolean; pctInss: string;
  aplicarCsll: boolean; pctCsll: string;
  aplicarJuros: boolean; taxaJuros: string;
  dataVencimento: string;
  mensagem: string;
  valorEditado: boolean;
  valorOverride: string;
  carregando: boolean;
  gerado: boolean;
  erro: string | null;
}

const BOLETO_STATUS: Record<string, { label: string; cls: string }> = {
  EMABERTO:  { label: 'Em Aberto', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' },
  PAGO:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' },
  EXPIRADO:  { label: 'Expirado',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400' },
  VENCIDO:   { label: 'Vencido',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' },
  BAIXADO:   { label: 'Baixado',   cls: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400' },
};

type TabType = 'geral' | 'manutencoes' | 'assistencias' | 'kpis';

function pd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const brl = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function ServicosPage() {
  const [servicos, setServicos]           = useState<Servico[]>([]);
  const [condominios, setCondominios]     = useState<Record<number, Condominio>>({});
  const [notas, setNotas]                 = useState<Record<number, NotaFiscal>>({});
  const [boletosPorNota, setBoletosPorNota] = useState<Record<number, Boleto[]>>({});
  const [loading, setLoading]             = useState(true);
  const [activeTab, setActiveTab]         = useState<TabType>('geral');

  // Vincular nota modal
  const [vincularServicoId, setVincularServicoId] = useState<number | null>(null);
  const [vincularNotaId, setVincularNotaId] = useState<string>('');
  const [vinculando, setVinculando] = useState(false);
  const [vincularErro, setVincularErro] = useState<string | null>(null);

  // Filtros
  const [filtroTipo, setFiltroTipo]         = useState<string>('todos');
  const [search, setSearch]                 = useState('');
  const [filtroMes, setFiltroMes]           = useState('');
  const [dataInicio, setDataInicio]         = useState('');
  const [dataFim, setDataFim]               = useState('');
  const [condominioSelecionado, setCondominioSelecionado] = useState<number | null>(null);
  const [comNota, setComNota]               = useState<string>('todos');
  const [showFiltrosAvancados, setShowFiltrosAvancados]   = useState(false);

  // Modal gerar boleto (full)
  const [modalBoleto, setModalBoleto] = useState<{ servico: Servico; nota: NotaFiscal } | null>(null);
  const [mbConfigImpostos, setMbConfigImpostos] = useState<ConfigImpostos | null>(null);
  const [mbCarregando, setMbCarregando] = useState(false);
  // Tax fields
  const [mbAplicarPis, setMbAplicarPis] = useState(true);
  const [mbPctPis, setMbPctPis] = useState('0');
  const [mbAplicarCofins, setMbAplicarCofins] = useState(true);
  const [mbPctCofins, setMbPctCofins] = useState('0');
  const [mbAplicarInss, setMbAplicarInss] = useState(true);
  const [mbPctInss, setMbPctInss] = useState('0');
  const [mbAplicarCsll, setMbAplicarCsll] = useState(true);
  const [mbPctCsll, setMbPctCsll] = useState('0');
  const [mbDataVencimento, setMbDataVencimento] = useState('');
  const [mbMensagem, setMbMensagem] = useState('');
  const [mbValorEditado, setMbValorEditado] = useState(false);
  const [mbValor, setMbValor] = useState('');
  const [mbNumeroNota, setMbNumeroNota] = useState('');
  const [mbDescricaoExpanded, setMbDescricaoExpanded] = useState(false);
  // Parcelas selection
  const [mbParcelasSelecionadas, setMbParcelasSelecionadas] = useState<Set<number>>(new Set());
  const [mbGerando, setMbGerando] = useState(false);

  // Modal gerar em massa
  const [modalMassa, setModalMassa] = useState(false);
  const [massaItems, setMassaItems] = useState<MassaItem[]>([]);
  const [massaGerando, setMassaGerando] = useState(false);

  useEffect(() => { carregarDados(); }, []);

  const carregarDados = async () => {
    try {
      const [condosRes, servicosRes, notasRes] = await Promise.all([
        api.get('/condominios'),
        api.get('/servicos'),
        api.get('/notas-fiscais'),
      ]);

      const condosMap: Record<number, Condominio> = {};
      condosRes.data.forEach((c: Condominio) => { condosMap[c.id] = c; });
      setCondominios(condosMap);
      setServicos(servicosRes.data);

      const notasMap: Record<number, NotaFiscal> = {};
      notasRes.data.forEach((n: NotaFiscal) => { notasMap[n.id] = n; });
      setNotas(notasMap);

      try {
        const boletosRes = await api.get('/boletos');
        const map: Record<number, Boleto[]> = {};
        boletosRes.data.forEach((b: Boleto) => {
          if (!map[b.nota_fiscal_id]) map[b.nota_fiscal_id] = [];
          map[b.nota_fiscal_id].push(b);
        });
        setBoletosPorNota(map);
      } catch { /* boletos opcionais */ }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const abrirModalBoleto = async (servico: Servico) => {
    if (!servico.nota_fiscal_id) return;
    const nota = notas[servico.nota_fiscal_id];
    if (!nota) return;
    setModalBoleto({ servico, nota });
    setMbCarregando(true);
    setMbConfigImpostos(null);
    setMbValorEditado(false);
    setMbDataVencimento(nota.data_vencimento);
    setMbNumeroNota(nota.numero_nota);
    setMbDescricaoExpanded(false);
    setMbMensagem('');

    // Pre-select all parcelas that don't yet have a boleto
    const existentes = (boletosPorNota[nota.id] ?? []).map(b => b.numero_parcela);
    const total = nota.parcelas ?? 1;
    const faltantes = new Set(
      Array.from({ length: total }, (_, i) => i + 1).filter(p => !existentes.includes(p))
    );
    setMbParcelasSelecionadas(faltantes);

    try {
      const { data: cfg } = await api.get<ConfigImpostos>(`/boletos/config-impostos/${nota.id}`);
      setMbConfigImpostos(cfg);
      setMbAplicarPis(cfg.pct_pis > 0); setMbPctPis(String(cfg.pct_pis));
      setMbAplicarCofins(cfg.pct_cofins > 0); setMbPctCofins(String(cfg.pct_cofins));
      setMbAplicarInss(cfg.pct_inss > 0); setMbPctInss(String(cfg.pct_inss));
      setMbAplicarCsll(cfg.pct_csll > 0); setMbPctCsll(String(cfg.pct_csll));
      setMbValor(String(cfg.valor_liquido ?? nota.valor));
      setMbMensagem([nota.descricao_servico, cfg.numero_os ? `OS: ${cfg.numero_os}` : null].filter(Boolean).join(' | '));
    } catch {
      const fallback: ConfigImpostos = {
        pct_pis: 0.65, pct_cofins: 3, pct_inss: 11, pct_csll: 1,
        valor_bruto: nota.valor,
        valor_liquido: Math.max(nota.valor * (1 - 0.1565), 0.01),
        numero_os: null,
        aplicar_juros_default: true,
        alerta_impostos: false,
        divergencia_impostos: null,
      };
      setMbConfigImpostos(fallback);
      setMbAplicarPis(true); setMbPctPis('0.65');
      setMbAplicarCofins(true); setMbPctCofins('3');
      setMbAplicarInss(true); setMbPctInss('11');
      setMbAplicarCsll(true); setMbPctCsll('1');
      setMbValor(String(fallback.valor_liquido.toFixed(2)));
      setMbMensagem(nota.descricao_servico || '');
    } finally {
      setMbCarregando(false);
    }
  };

  const calcularLiquidoModal = (): number => {
    if (!mbConfigImpostos) return parseFloat(mbValor) || 0;
    const bruto = mbConfigImpostos.valor_bruto;
    const pis    = mbAplicarPis    ? parseFloat(mbPctPis    || '0') : 0;
    const cofins = mbAplicarCofins ? parseFloat(mbPctCofins || '0') : 0;
    const inss   = mbAplicarInss   ? parseFloat(mbPctInss   || '0') : 0;
    const csll   = mbAplicarCsll   ? parseFloat(mbPctCsll   || '0') : 0;
    const totalPct = (pis + cofins + inss + csll) / 100;
    return Math.max(Math.round(bruto * (1 - totalPct) * 100) / 100, 0.01);
  };

  const handleConfirmarGerarBoleto = async () => {
    if (!modalBoleto || !mbConfigImpostos) return;
    if (mbParcelasSelecionadas.size === 0) {
      alert('Selecione ao menos uma parcela para gerar.');
      return;
    }
    setMbGerando(true);
    try {
      if (mbNumeroNota && mbNumeroNota !== modalBoleto.nota.numero_nota) {
        await api.put(`/notas-fiscais/${modalBoleto.nota.id}`, { numero_nota: mbNumeroNota });
      }
      const valorLiquido = mbValorEditado ? parseFloat(mbValor) : calcularLiquidoModal();
      const body: Record<string, unknown> = {
        pct_pis:    mbAplicarPis    ? parseFloat(mbPctPis    || '0') : 0,
        pct_cofins: mbAplicarCofins ? parseFloat(mbPctCofins || '0') : 0,
        pct_inss:   mbAplicarInss   ? parseFloat(mbPctInss   || '0') : 0,
        pct_csll:   mbAplicarCsll   ? parseFloat(mbPctCsll   || '0') : 0,
        aplicar_juros: false,
        parcelas_selecionadas: Array.from(mbParcelasSelecionadas).sort((a, b) => a - b),
      };
      if (mbValorEditado && valorLiquido > 0) body.valor_total_override = valorLiquido;
      if (mbDataVencimento) body.data_vencimento_override = mbDataVencimento;
      if (mbMensagem.trim()) body.mensagem = mbMensagem.trim();

      await api.post(`/boletos/gerar-parcelas-faltantes/${modalBoleto.nota.id}`, body);
      setModalBoleto(null);
      await carregarDados();
    } catch {
      alert('Erro ao gerar boletos Inter.');
    } finally {
      setMbGerando(false);
    }
  };

  const updateMassaItem = (notaId: number, updates: Partial<MassaItem>) => {
    setMassaItems(prev => prev.map(item => item.notaId === notaId ? { ...item, ...updates } : item));
  };

  const calcLiquidoItem = (item: MassaItem): number => {
    if (item.valorEditado) return parseFloat(item.valorOverride) || 0;
    const bruto = parseFloat(item.valor) || 0;
    const pis    = item.aplicarPis    ? parseFloat(item.pctPis    || '0') : 0;
    const cofins = item.aplicarCofins ? parseFloat(item.pctCofins || '0') : 0;
    const inss   = item.aplicarInss   ? parseFloat(item.pctInss   || '0') : 0;
    const csll   = item.aplicarCsll   ? parseFloat(item.pctCsll   || '0') : 0;
    return Math.max(Math.round(bruto * (1 - (pis + cofins + inss + csll) / 100) * 100) / 100, 0.01);
  };

  const abrirModalMassa = async () => {
    const pendentes = servicosFiltrados.filter(s => {
      if (!s.nota_fiscal_id) return false;
      const nota = notas[s.nota_fiscal_id];
      if (!nota || nota.status !== 'AUTORIZADA') return false;
      const boletos = boletosPorNota[s.nota_fiscal_id] ?? [];
      return boletos.length < (nota.parcelas ?? 1);
    });
    if (pendentes.length === 0) {
      alert('Nenhum serviço com parcelas pendentes nos filtros atuais.');
      return;
    }
    const items: MassaItem[] = pendentes.map(s => {
      const nota = notas[s.nota_fiscal_id!]!;
      const boletos = boletosPorNota[nota.id] ?? [];
      const existentes = boletos.map(b => b.numero_parcela);
      const total = nota.parcelas ?? 1;
      const faltantes = Array.from({ length: total }, (_, i) => i + 1).filter(p => !existentes.includes(p));
      return {
        servicoId: s.id, notaId: nota.id,
        condominio: condominios[s.condominio_id]?.nome || 'Desconhecido',
        numeroNota: nota.numero_nota, valor: String(nota.valor),
        parcelasTotal: total, parcelasFaltantes: faltantes, parcelasSelecionadas: [...faltantes],
        selecionado: true,
        aplicarPis: true, pctPis: '0.65', aplicarCofins: true, pctCofins: '3',
        aplicarInss: true, pctInss: '11', aplicarCsll: true, pctCsll: '1',
        aplicarJuros: true, taxaJuros: '1.00',
        dataVencimento: nota.data_vencimento, mensagem: '',
        valorEditado: false, valorOverride: '',
        carregando: true, gerado: false, erro: null,
      };
    });
    setMassaItems(items);
    setModalMassa(true);
    setMassaGerando(false);
    await Promise.all(items.map(async (item) => {
      try {
        const { data: cfg } = await api.get<ConfigImpostos>(`/boletos/config-impostos/${item.notaId}`);
        setMassaItems(prev => prev.map(i => i.notaId === item.notaId ? {
          ...i,
          valor: String(cfg.valor_bruto),
          aplicarPis: cfg.pct_pis > 0, pctPis: String(cfg.pct_pis),
          aplicarCofins: cfg.pct_cofins > 0, pctCofins: String(cfg.pct_cofins),
          aplicarInss: cfg.pct_inss > 0, pctInss: String(cfg.pct_inss),
          aplicarCsll: cfg.pct_csll > 0, pctCsll: String(cfg.pct_csll),
          aplicarJuros: cfg.aplicar_juros_default ?? true,
          carregando: false,
        } : i));
      } catch {
        setMassaItems(prev => prev.map(i => i.notaId === item.notaId ? { ...i, carregando: false } : i));
      }
    }));
  };

  const handleGerarMassa = async () => {
    const selecionados = massaItems.filter(item => item.selecionado && item.parcelasSelecionadas.length > 0 && !item.gerado);
    if (selecionados.length === 0) {
      alert('Selecione ao menos um serviço com parcelas para gerar.');
      return;
    }
    setMassaGerando(true);
    for (const item of selecionados) {
      setMassaItems(prev => prev.map(i => i.notaId === item.notaId ? { ...i, carregando: true, erro: null } : i));
      try {
        const liquido = calcLiquidoItem(item);
        const body: Record<string, unknown> = {
          pct_pis:    item.aplicarPis    ? parseFloat(item.pctPis    || '0') : 0,
          pct_cofins: item.aplicarCofins ? parseFloat(item.pctCofins || '0') : 0,
          pct_inss:   item.aplicarInss   ? parseFloat(item.pctInss   || '0') : 0,
          pct_csll:   item.aplicarCsll   ? parseFloat(item.pctCsll   || '0') : 0,
          aplicar_juros: item.aplicarJuros,
          taxa_juros: parseFloat(item.taxaJuros) || 1.0,
          parcelas_selecionadas: item.parcelasSelecionadas,
        };
        if (item.valorEditado && liquido > 0) body.valor_total_override = liquido;
        if (item.dataVencimento) body.data_vencimento_override = item.dataVencimento;
        if (item.mensagem.trim()) body.mensagem = item.mensagem.trim();
        await api.post(`/boletos/gerar-parcelas-faltantes/${item.notaId}`, body);
        setMassaItems(prev => prev.map(i => i.notaId === item.notaId ? { ...i, carregando: false, gerado: true } : i));
      } catch (err: unknown) {
        const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setMassaItems(prev => prev.map(i => i.notaId === item.notaId ? { ...i, carregando: false, erro: detail || 'Erro ao gerar' } : i));
      }
    }
    setMassaGerando(false);
    await carregarDados();
  };

  const handleVincularNota = async () => {
    if (!vincularServicoId || !vincularNotaId) return;
    setVinculando(true);
    setVincularErro(null);
    try {
      await api.put(`/servicos/${vincularServicoId}`, { nota_fiscal_id: parseInt(vincularNotaId) });
      setVincularServicoId(null);
      setVincularNotaId('');
      await carregarDados();
    } catch {
      setVincularErro('Erro ao vincular nota. Verifique se o ID está correto.');
    } finally {
      setVinculando(false);
    }
  };

  const exportarExcel = async () => {
    try {
      const params = new URLSearchParams();
      if (dataInicio) params.append('data_inicio', dataInicio);
      if (dataFim) params.append('data_fim', dataFim);
      if (condominioSelecionado) params.append('condominio_id', String(condominioSelecionado));
      if (filtroTipo !== 'todos') params.append('tipo', filtroTipo);
      const response = await api.get(`/dashboard/servicos/exportar?${params}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `servicos_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert('Erro ao exportar relatorio');
    }
  };

  const limparFiltros = () => {
    setFiltroTipo('todos'); setSearch(''); setFiltroMes('');
    setDataInicio(''); setDataFim(''); setCondominioSelecionado(null); setComNota('todos');
  };

  const temFiltroAtivo = filtroTipo !== 'todos' || search || filtroMes || dataInicio || dataFim || condominioSelecionado || comNota !== 'todos';

  const servicosFiltrados = useMemo(() => servicos.filter(s => {
    if (filtroTipo !== 'todos' && s.tipo !== filtroTipo) return false;
    const nomeCondominio = condominios[s.condominio_id]?.nome || '';
    if (search) {
      const q = search.toLowerCase();
      if (!nomeCondominio.toLowerCase().includes(q) && !s.descricao?.toLowerCase().includes(q)) return false;
    }
    const data = pd(s.data_servico);
    if (filtroMes) {
      const [y, m] = filtroMes.split('-').map(Number);
      if (data.getFullYear() !== y || data.getMonth() + 1 !== m) return false;
    }
    if (dataInicio && data < pd(dataInicio)) return false;
    if (dataFim && data > pd(dataFim)) return false;
    if (condominioSelecionado && s.condominio_id !== condominioSelecionado) return false;
    if (comNota !== 'todos') {
      if (comNota === 'com' && !s.nota_fiscal_id) return false;
      if (comNota === 'sem' && s.nota_fiscal_id) return false;
    }
    return true;
  }), [servicos, filtroTipo, search, filtroMes, dataInicio, dataFim, condominioSelecionado, comNota, condominios]);

  const stats = useMemo(() => {
    const hoje = new Date();
    const valorTotal = servicosFiltrados.reduce((acc, s) => {
      if (s.nota_fiscal_id) acc += notas[s.nota_fiscal_id]?.valor ?? 0;
      return acc;
    }, 0);
    const valorRecebido = servicosFiltrados.reduce((acc, s) => {
      if (s.nota_fiscal_id) {
        const boletos = boletosPorNota[s.nota_fiscal_id] ?? [];
        acc += boletos.reduce((sum, b) => sum + (b.valor_total_recebido ?? 0), 0);
      }
      return acc;
    }, 0);
    const comNotaCount = servicosFiltrados.filter(s => s.nota_fiscal_id).length;
    return {
      total:        servicosFiltrados.length,
      manutencoes:  servicosFiltrados.filter(s => s.tipo === 'manutencao').length,
      assistencias: servicosFiltrados.filter(s => s.tipo === 'assistencia').length,
      esteMes:      servicosFiltrados.filter(s => { const d = pd(s.data_servico); return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear(); }).length,
      comNota:      comNotaCount,
      semNota:      servicosFiltrados.filter(s => !s.nota_fiscal_id).length,
      mediaPorMes:  servicosFiltrados.length > 0 ? (servicosFiltrados.length / 12).toFixed(1) : '0',
      valorTotal,
      valorRecebido,
    };
  }, [servicosFiltrados, notas, boletosPorNota]);

  const notasSemServico = useMemo(() =>
    Object.values(notas).filter(n => n.status === 'AUTORIZADA').sort((a, b) => a.numero_nota.localeCompare(b.numero_nota)),
  [notas]);

  const hoje = new Date();
  const ultimos6Meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje);
    d.setMonth(d.getMonth() - (5 - i));
    return { mes: d.getMonth(), ano: d.getFullYear(), nome: d.toLocaleDateString('pt-BR', { month: 'short' }) };
  });

  const servicosPorMesData = useMemo(() => ({
    labels: ultimos6Meses.map(m => m.nome),
    datasets: [
      {
        label: 'Quantidade',
        data: ultimos6Meses.map(m => servicosFiltrados.filter(s => {
          const d = pd(s.data_servico);
          return d.getMonth() === m.mes && d.getFullYear() === m.ano;
        }).length),
        backgroundColor: 'rgba(124,58,237,0.2)',
        borderColor: '#7c3aed',
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        yAxisID: 'y',
      },
      {
        label: 'Valor (R$)',
        data: ultimos6Meses.map(m => {
          const servicosDoMes = servicosFiltrados.filter(s => {
            const d = pd(s.data_servico);
            return d.getMonth() === m.mes && d.getFullYear() === m.ano;
          });
          return servicosDoMes.reduce((acc, s) => {
            if (s.nota_fiscal_id) acc += notas[s.nota_fiscal_id]?.valor ?? 0;
            return acc;
          }, 0);
        }),
        backgroundColor: 'rgba(16,185,129,0.1)',
        borderColor: '#10b981',
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        yAxisID: 'y1',
      },
    ],
  }), [servicosFiltrados, notas, ultimos6Meses]);

  const distribuicaoTipoData = useMemo(() => ({
    labels: ['Manutencao', 'Assistencia'],
    datasets: [{
      data: [stats.manutencoes, stats.assistencias],
      backgroundColor: ['#7c3aed', '#3b82f6'],
      borderWidth: 0,
    }],
  }), [stats]);

  const topCondominiosData = useMemo(() => {
    const totals = Object.values(condominios)
      .map(c => {
        const servicosCondo = servicosFiltrados.filter(s => s.condominio_id === c.id);
        const valorCondo = servicosCondo.reduce((acc, s) => {
          if (s.nota_fiscal_id) acc += notas[s.nota_fiscal_id]?.valor ?? 0;
          return acc;
        }, 0);
        return {
          nome: c.nome.length > 20 ? c.nome.slice(0, 20) + '…' : c.nome,
          qtd: servicosCondo.length,
          valor: valorCondo,
        };
      })
      .filter(c => c.qtd > 0)
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 5);
    return {
      labels: totals.map(c => c.nome),
      datasets: [
        { label: 'Quantidade', data: totals.map(c => c.qtd), backgroundColor: '#1e3a5f', borderRadius: 8 },
        { label: 'Valor (R$)', data: totals.map(c => c.valor), backgroundColor: '#10b981', borderRadius: 8 },
      ],
    };
  }, [condominios, servicosFiltrados, notas]);

  const getTipoColor = (tipo: string) => tipo === 'manutencao'
    ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';

  const getTipoIcon = (tipo: string) => tipo === 'manutencao' ? '🛠️' : '🔧';

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando servicos...</p>
        </div>
      </div>
    );
  }

  const listaFiltrada = servicosFiltrados.filter(s => {
    if (activeTab === 'manutencoes') return s.tipo === 'manutencao';
    if (activeTab === 'assistencias') return s.tipo === 'assistencia';
    return true;
  });

  const valorCobrado = servicosFiltrados.reduce((acc, s) => {
    if (s.nota_fiscal_id) {
      const boletos = boletosPorNota[s.nota_fiscal_id] ?? [];
      acc += boletos.reduce((sum, b) => sum + (b.valor_nominal ?? 0), 0);
    }
    return acc;
  }, 0);

  // Helper: parcelas display for a nota
  function getParcelasDisplay(nota: NotaFiscal): Array<{ parcela: number; valor: number; data: string | null }> {
    if (nota.parcelas_json && nota.parcelas_json.length > 0) return nota.parcelas_json;
    const total = nota.parcelas ?? 1;
    const valorParcela = nota.valor_boleto_parcela ?? (nota.valor / total);
    return Array.from({ length: total }, (_, i) => ({ parcela: i + 1, valor: valorParcela, data: null }));
  }

  // Render service list — mobile cards + desktop table
  const renderListaServicos = (lista: Servico[]) => {
    if (lista.length === 0) {
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl py-16 text-center shadow-lg">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4 bg-slate-100 dark:bg-slate-800 rounded-full"><span className="text-3xl">🛠️</span></div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Nenhum servico encontrado</h3>
          <p className="text-slate-500 dark:text-slate-400 mb-4">Ajuste os filtros ou importe notas fiscais</p>
          <Link href="/notas/importar" className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-xl font-bold hover:brightness-110 transition-all">
            <span>📤</span> Importar Notas
          </Link>
        </div>
      );
    }
    return (
      <>
        {/* Mobile cards (< md) */}
        <div className="md:hidden space-y-3">
          {lista.map(servico => {
            const nota = servico.nota_fiscal_id ? notas[servico.nota_fiscal_id] : undefined;
            const boletos = servico.nota_fiscal_id ? (boletosPorNota[servico.nota_fiscal_id] ?? []) : [];
            const primeiroAberto = boletos.find(b => b.situacao === 'EMABERTO' || b.situacao === 'VENCIDO');
            const primeiroPago = boletos.find(b => b.situacao === 'PAGO' || b.situacao === 'BAIXADO');
            const primeiroBoleto = primeiroPago || primeiroAberto || boletos[0];
            const todasParcelas = nota ? (nota.parcelas ?? 1) : 0;
            const parcelasGeradas = boletos.length;
            const faltamParcelas = todasParcelas > parcelasGeradas;
            return (
              <div key={servico.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white shadow-sm shrink-0">
                    <span className="text-sm font-bold">{condominios[servico.condominio_id]?.nome.substring(0, 2).toUpperCase() || '??'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">{condominios[servico.condominio_id]?.nome || 'Desconhecido'}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${getTipoColor(servico.tipo)}`}>
                        {getTipoIcon(servico.tipo)} {servico.tipo === 'manutencao' ? 'Manut.' : 'Assist.'}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">{pd(servico.data_servico).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                </div>
                {/* Nota + Parcelas */}
                <div className="mb-3 text-sm">
                  {servico.nota_fiscal_id ? (
                    nota ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">#{nota.numero_nota}</span>
                        <span className="font-black text-green-600 dark:text-green-400">{brl(nota.valor)}</span>
                        {nota.parcelas && nota.parcelas > 1 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                            {parcelasGeradas}/{nota.parcelas} parc.
                          </span>
                        )}
                      </div>
                    ) : <span className="text-xs text-slate-400">Nota #{servico.nota_fiscal_id}</span>
                  ) : (
                    <button
                      onClick={() => { setVincularServicoId(servico.id); setVincularNotaId(''); setVincularErro(null); }}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      + Vincular nota
                    </button>
                  )}
                </div>
                {/* Actions row */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  {servico.nota_fiscal_id && nota ? (
                    primeiroBoleto && !faltamParcelas ? (
                      <Link href="/boletos">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${BOLETO_STATUS[primeiroBoleto.situacao]?.cls ?? ''}`}>
                          {BOLETO_STATUS[primeiroBoleto.situacao]?.label ?? primeiroBoleto.situacao}
                        </span>
                      </Link>
                    ) : (
                      <button
                        onClick={() => abrirModalBoleto(servico)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:brightness-110 transition-all"
                      >
                        🏦 {primeiroBoleto ? 'Gerar Faltantes' : 'Gerar Boleto'}
                      </button>
                    )
                  ) : <span />}
                  <Link href={`/servicos/${servico.id}`} className="flex items-center gap-1 text-sm font-semibold text-purple-600 dark:text-purple-400">
                    Ver detalhes
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table (md+) */}
        <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  {['Condominio', 'Tipo', 'Data', 'Nota Fiscal', 'Parcelas', 'Cobranca', 'Acoes'].map(h => (
                    <th key={h} className="px-6 py-4 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lista.map(servico => {
                  const nota = servico.nota_fiscal_id ? notas[servico.nota_fiscal_id] : undefined;
                  const boletos = servico.nota_fiscal_id ? (boletosPorNota[servico.nota_fiscal_id] ?? []) : [];
                  const primeiroAberto = boletos.find(b => b.situacao === 'EMABERTO' || b.situacao === 'VENCIDO');
                  const primeiroPago = boletos.find(b => b.situacao === 'PAGO' || b.situacao === 'BAIXADO');
                  const primeiroBoleto = primeiroPago || primeiroAberto || boletos[0];
                  const todasParcelas = nota ? (nota.parcelas ?? 1) : 0;
                  const parcelasGeradas = boletos.length;
                  const faltamParcelas = todasParcelas > parcelasGeradas;
                  return (
                    <tr key={servico.id} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white shadow-sm">
                            <span className="text-sm font-bold">{condominios[servico.condominio_id]?.nome.substring(0, 2).toUpperCase() || '??'}</span>
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{condominios[servico.condominio_id]?.nome || 'Desconhecido'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">ID: {servico.condominio_id}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${getTipoColor(servico.tipo)}`}>
                          <span>{getTipoIcon(servico.tipo)}</span>
                          {servico.tipo === 'manutencao' ? 'Manutencao' : 'Assistencia'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{pd(servico.data_servico).toLocaleDateString('pt-BR')}</p>
                      </td>
                      <td className="px-6 py-5">
                        {servico.nota_fiscal_id ? (
                          nota ? (
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-xs font-mono text-slate-500 dark:text-slate-400">#{nota.numero_nota}</p>
                                {nota.descricao_servico?.startsWith('Notas vinculadas:') && (
                                  <span className="text-xs font-black px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400">
                                    🔗 2 notas
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-black text-green-600 dark:text-green-400">{brl(nota.valor)}</p>
                              <p className="text-xs text-slate-400 dark:text-slate-500">Venc: {pd(nota.data_vencimento).toLocaleDateString('pt-BR')}</p>
                            </div>
                          ) : <span className="text-xs text-slate-400">Nota #{servico.nota_fiscal_id}</span>
                        ) : (
                          <button
                            onClick={() => { setVincularServicoId(servico.id); setVincularNotaId(''); setVincularErro(null); }}
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            + Vincular nota
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        {nota?.parcelas ? (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                              {nota.parcelas}x
                            </span>
                            {parcelasGeradas > 0 && (
                              <span className="text-xs text-slate-500 dark:text-slate-400">{parcelasGeradas}/{nota.parcelas} geradas</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        {servico.nota_fiscal_id && nota ? (
                          primeiroBoleto && !faltamParcelas ? (
                            <Link href="/boletos">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${BOLETO_STATUS[primeiroBoleto.situacao]?.cls ?? ''}`}>
                                {BOLETO_STATUS[primeiroBoleto.situacao]?.label ?? primeiroBoleto.situacao}
                              </span>
                            </Link>
                          ) : (
                            <button
                              onClick={() => abrirModalBoleto(servico)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:brightness-110 transition-all"
                            >
                              🏦 {primeiroBoleto ? 'Gerar Faltantes' : 'Gerar Boleto'}
                            </button>
                          )
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Link href={`/servicos/${servico.id}`} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 rounded-lg transition-all group-hover:translate-x-1">
                          Ver detalhes
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 lg:py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 lg:gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-8 bg-purple-600 rounded-full" />
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Manutencoes & Assistencias</h1>
              </div>
              <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-lg ml-5">Analise completa de produtividade</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={exportarExcel} className="w-full sm:w-auto bg-green-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-black shadow-lg shadow-green-600/20 hover:brightness-110 transition-all flex items-center justify-center gap-2 text-sm sm:text-base">
                <span className="text-lg sm:text-xl">📊</span> Exportar Excel
              </button>
              <Link href="/servicos/novo" className="w-full sm:w-auto bg-purple-600 text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-black shadow-lg shadow-purple-600/20 hover:brightness-110 transition-all flex items-center justify-center gap-2 text-sm sm:text-base">
                <span className="text-lg sm:text-xl">+</span> Novo Servico
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Buscar condominio ou descricao..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-48 px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
            />
            <input
              type="month"
              value={filtroMes}
              onChange={e => { setFiltroMes(e.target.value); setDataInicio(''); setDataFim(''); }}
              className="px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
            />
            {['todos', 'manutencao', 'assistencia'].map(t => (
              <button key={t} onClick={() => setFiltroTipo(t)}
                className={`px-4 py-2 rounded-xl font-bold text-sm transition-all ${filtroTipo === t
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                {t === 'todos' ? 'Todos' : t === 'manutencao' ? '🛠️ Manutencao' : '🔧 Assistencia'}
              </button>
            ))}
            <select value={comNota} onChange={e => setComNota(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm font-bold text-slate-700 dark:text-slate-300">
              <option value="todos">Com/Sem Nota</option>
              <option value="com">Com Nota</option>
              <option value="sem">Sem Nota</option>
            </select>
            <button
              onClick={() => setShowFiltrosAvancados(p => !p)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 transition-all"
            >
              <svg className={`w-3 h-3 transition-transform ${showFiltrosAvancados ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Avancados
            </button>
            {temFiltroAtivo && (
              <button onClick={limparFiltros} className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 transition-all">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Limpar
              </button>
            )}
          </div>

          {showFiltrosAvancados && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data De</label>
                <input type="date" value={dataInicio} onChange={e => { setDataInicio(e.target.value); setFiltroMes(''); }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data Ate</label>
                <input type="date" value={dataFim} onChange={e => { setDataFim(e.target.value); setFiltroMes(''); }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Condominio</label>
                <select value={condominioSelecionado || ''} onChange={e => setCondominioSelecionado(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none text-sm">
                  <option value="">Todos</option>
                  {Object.values(condominios).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Exibindo <span className="font-bold text-slate-700 dark:text-slate-300">{servicosFiltrados.length}</span> de <span className="font-bold">{servicos.length}</span> servicos
            {temFiltroAtivo && <span className="ml-1 text-purple-600 dark:text-purple-400">(com filtros ativos)</span>}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { key: 'geral',       label: '📊 Visao Geral' },
              { key: 'manutencoes', label: `🛠️ Manutencoes (${stats.manutencoes})` },
              { key: 'assistencias',label: `🔧 Assistencias (${stats.assistencias})` },
              { key: 'kpis',        label: '📈 KPIs' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as TabType)}
                className={`px-5 py-4 text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.key
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 lg:py-8">
        {/* TAB: Visao Geral */}
        {activeTab === 'geral' && (
          <div className="space-y-4 lg:space-y-8">
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-6">
              <div className="bg-white dark:bg-slate-900 p-4 lg:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="p-2 lg:p-3 bg-purple-50 dark:bg-purple-500/10 rounded-xl"><span className="text-xl lg:text-2xl">📋</span></div>
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">TOTAL</span>
                </div>
                <p className="text-2xl sm:text-4xl font-black text-slate-900 dark:text-white mb-1">{stats.total}</p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-semibold">Servicos Realizados</p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/30 dark:to-purple-900/30 p-4 lg:p-6 rounded-2xl border border-purple-200 dark:border-purple-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="p-2 lg:p-3 bg-purple-100 dark:bg-purple-500/20 rounded-xl"><span className="text-xl lg:text-2xl">🛠️</span></div>
                  <span className="text-xs font-bold text-purple-700 dark:text-purple-400">PREVENTIVA</span>
                </div>
                <p className="text-2xl sm:text-4xl font-black text-purple-900 dark:text-purple-400 mb-1">{stats.manutencoes}</p>
                <p className="text-xs sm:text-sm text-purple-700 dark:text-purple-500 font-semibold">Manutencoes</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/30 dark:to-blue-900/30 p-4 lg:p-6 rounded-2xl border border-blue-200 dark:border-blue-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="p-2 lg:p-3 bg-blue-100 dark:bg-blue-500/20 rounded-xl"><span className="text-xl lg:text-2xl">🔧</span></div>
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-400">CORRETIVA</span>
                </div>
                <p className="text-2xl sm:text-4xl font-black text-blue-900 dark:text-blue-400 mb-1">{stats.assistencias}</p>
                <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-500 font-semibold">Assistencias</p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 p-4 lg:p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="p-2 lg:p-3 bg-green-100 dark:bg-green-500/20 rounded-xl"><span className="text-xl lg:text-2xl">📅</span></div>
                  <span className="text-xs font-bold text-green-700 dark:text-green-400">ESTE MES</span>
                </div>
                <p className="text-2xl sm:text-4xl font-black text-green-900 dark:text-green-400 mb-1">{stats.esteMes}</p>
                <p className="text-xs sm:text-sm text-green-700 dark:text-green-500 font-semibold">Servicos</p>
              </div>
            </div>

            {/* Financial cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-6">
              <div className="bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-950/30 dark:to-teal-950/30 p-4 lg:p-6 rounded-2xl border border-green-200 dark:border-green-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="p-2 lg:p-3 bg-green-100 dark:bg-green-500/20 rounded-xl"><span className="text-xl lg:text-2xl">💰</span></div>
                  <span className="text-xs font-bold text-green-700 dark:text-green-400">VALOR TOTAL</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-green-900 dark:text-green-400 mb-1">{brl(stats.valorTotal)}</p>
                <p className="text-xs sm:text-sm text-green-700 dark:text-green-500 font-semibold">Soma das notas fiscais</p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-4 lg:p-6 rounded-2xl border border-blue-200 dark:border-blue-800/50 shadow-sm">
                <div className="flex items-center justify-between mb-3 lg:mb-4">
                  <div className="p-2 lg:p-3 bg-blue-100 dark:bg-blue-500/20 rounded-xl"><span className="text-xl lg:text-2xl">🏦</span></div>
                  <span className="text-xs font-bold text-blue-700 dark:text-blue-400">VALOR COBRADO</span>
                </div>
                <p className="text-xl sm:text-3xl font-black text-blue-900 dark:text-blue-400 mb-1">{brl(valorCobrado)}</p>
                <p className="text-xs sm:text-sm text-blue-700 dark:text-blue-500 font-semibold">Soma dos boletos emitidos</p>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-6">
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
                <h3 className="text-base lg:text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">📈</span> Evolucao (Ultimos 6 Meses)
                </h3>
                <div className="h-48 sm:h-64">
                  <Line data={servicosPorMesData} options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: 'top', labels: { color: '#64748b', boxWidth: 12 } } },
                    scales: {
                      x: { ticks: { color: '#64748b' }, grid: { display: false } },
                      y: { type: 'linear', position: 'left', ticks: { color: '#64748b' }, grid: { color: 'rgba(100,116,139,0.1)' }, title: { display: true, text: 'Quantidade', color: '#7c3aed', font: { size: 11 } } },
                      y1: { type: 'linear', position: 'right', ticks: { color: '#10b981', callback: (v: number | string) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Valor (R$)', color: '#10b981', font: { size: 11 } } },
                    },
                  }} />
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm">
                <h3 className="text-base lg:text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">🥧</span> Distribuicao por Tipo
                </h3>
                <div className="h-48 sm:h-64">
                  <Doughnut data={distribuicaoTipoData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#64748b' } } } }} />
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 lg:p-6 shadow-sm lg:col-span-2">
                <h3 className="text-base lg:text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <span className="text-xl">🏆</span> Top 5 Condominios
                </h3>
                {topCondominiosData.labels.length > 0 ? (
                  <div className="h-48 sm:h-64">
                    <Bar data={topCondominiosData} options={{
                      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                      plugins: { legend: { display: true, position: 'top', labels: { color: '#64748b', boxWidth: 12 } } },
                      scales: { x: { ticks: { color: '#64748b' }, grid: { display: false } }, y: { ticks: { color: '#64748b' } } },
                    }} />
                  </div>
                ) : (
                  <div className="h-48 sm:h-64 flex items-center justify-center text-slate-400">Sem dados com filtros ativos</div>
                )}
              </div>
            </div>

            {/* Lista de Servicos */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-2xl">📋</span> Lista de Servicos
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400 ml-1">({servicosFiltrados.length})</span>
                </h2>
                <button
                  onClick={abrirModalMassa}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl font-bold text-sm hover:brightness-110 transition-all shadow-sm"
                >
                  <span>🏦</span> Gerar em Massa
                </button>
              </div>
              {renderListaServicos(servicosFiltrados)}
            </div>
          </div>
        )}

        {/* TAB: KPIs */}
        {activeTab === 'kpis' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-6">
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-purple-50 dark:bg-purple-500/10 rounded-full mb-3 sm:mb-4"><span className="text-2xl sm:text-3xl">📊</span></div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Media Mensal</p>
                <p className="text-3xl sm:text-5xl font-black text-purple-600 dark:text-purple-400 mb-2">{stats.mediaPorMes}</p>
                <p className="text-xs text-slate-500">Servicos por mes (periodo)</p>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-green-50 dark:bg-green-500/10 rounded-full mb-3 sm:mb-4"><span className="text-2xl sm:text-3xl">✅</span></div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Com Nota Fiscal</p>
                <p className="text-3xl sm:text-5xl font-black text-green-600 dark:text-green-400 mb-2">{stats.comNota}</p>
                <p className="text-xs text-slate-500">{stats.total > 0 ? ((stats.comNota / stats.total) * 100).toFixed(1) : 0}% do total</p>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-orange-50 dark:bg-orange-500/10 rounded-full mb-3 sm:mb-4"><span className="text-2xl sm:text-3xl">⚠️</span></div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Sem Nota Fiscal</p>
                <p className="text-3xl sm:text-5xl font-black text-orange-600 dark:text-orange-400 mb-2">{stats.semNota}</p>
                <p className="text-xs text-slate-500">{stats.total > 0 ? ((stats.semNota / stats.total) * 100).toFixed(1) : 0}% do total</p>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-teal-50 dark:bg-teal-500/10 rounded-full mb-3 sm:mb-4"><span className="text-2xl sm:text-3xl">🎯</span></div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Ticket Medio</p>
                <p className="text-xl sm:text-3xl font-black text-teal-600 dark:text-teal-400 mb-2">{stats.comNota > 0 ? brl(stats.valorTotal / stats.comNota) : brl(0)}</p>
                <p className="text-xs text-slate-500">Valor medio por servico com nota</p>
              </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-4 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 bg-indigo-50 dark:bg-indigo-500/10 rounded-full mb-3 sm:mb-4"><span className="text-2xl sm:text-3xl">📬</span></div>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-semibold mb-2 uppercase">Taxa de Cobranca</p>
                <p className="text-3xl sm:text-5xl font-black text-indigo-600 dark:text-indigo-400 mb-2">
                  {stats.comNota > 0 ? (() => {
                    const comBoleto = servicosFiltrados.filter(s => s.nota_fiscal_id && (boletosPorNota[s.nota_fiscal_id]?.length ?? 0) > 0).length;
                    return `${((comBoleto / stats.comNota) * 100).toFixed(1)}%`;
                  })() : '0%'}
                </p>
                <p className="text-xs text-slate-500">Servicos com boleto / servicos com nota</p>
              </div>
            </div>
            {stats.total > 0 && (
              <div className="bg-gradient-to-br from-purple-600 to-purple-700 p-4 sm:p-8 rounded-2xl shadow-lg text-white md:col-span-3">
                <div className="text-center">
                  <p className="text-xs sm:text-sm font-bold mb-2 uppercase opacity-90">Taxa de Manutencao Preventiva</p>
                  <p className="text-4xl sm:text-6xl font-black mb-3 sm:mb-4">{((stats.manutencoes / stats.total) * 100).toFixed(1)}%</p>
                  <p className="text-xs sm:text-sm opacity-90">{stats.manutencoes} manutencoes preventivas de {stats.total} servicos totais</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: Manutencoes / Assistencias */}
        {(activeTab === 'manutencoes' || activeTab === 'assistencias') && renderListaServicos(listaFiltrada)}
      </div>

      {/* Modal Vincular Nota */}
      {vincularServicoId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">Vincular Nota Fiscal</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Selecione a nota fiscal para associar a este servico.</p>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-2">Nota Fiscal</label>
              <select value={vincularNotaId} onChange={e => setVincularNotaId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                <option value="">Selecione...</option>
                {notasSemServico.map(n => (
                  <option key={n.id} value={n.id}>
                    #{n.numero_nota} — {brl(n.valor)} · venc. {pd(n.data_vencimento).toLocaleDateString('pt-BR')}
                  </option>
                ))}
              </select>
            </div>
            {vincularErro && (
              <div className="mb-4 px-4 py-2.5 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-xl">
                <p className="text-sm text-red-700 dark:text-red-400">{vincularErro}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setVincularServicoId(null); setVincularNotaId(''); setVincularErro(null); }}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:brightness-105 transition-all">
                Cancelar
              </button>
              <button onClick={handleVincularNota} disabled={vinculando || !vincularNotaId}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {vinculando ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Vinculando...</> : 'Vincular'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pré-visualização Boleto Inter */}
      {modalBoleto && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[95vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-8 pt-8 pb-4 border-b border-slate-200 dark:border-slate-800 z-10">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">Pré-visualização — Boleto Inter</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {condominios[modalBoleto.servico.condominio_id]?.nome}
                  </p>
                </div>
                <button onClick={() => setModalBoleto(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="px-8 py-6 space-y-5">
              {mbCarregando && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!mbCarregando && mbConfigImpostos && (
                <>
                  {/* Seção 1: Conferência */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 space-y-3">
                    <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase">Conferência</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Valor Total da Nota</span>
                      <span className="font-black text-slate-900 dark:text-white text-xl">{brl(mbConfigImpostos.valor_bruto)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Número da Nota</label>
                        <input type="text" value={mbNumeroNota} onChange={e => setMbNumeroNota(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 dark:text-white" />
                      </div>
                      {mbConfigImpostos.numero_os && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Número OS</label>
                          <p className="px-3 py-2 text-sm rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">{mbConfigImpostos.numero_os}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Seção 2: Impostos */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase">Impostos Retidos</p>
                      <div className="flex gap-3">
                        <button onClick={() => { setMbAplicarPis(true); setMbAplicarCofins(true); setMbAplicarInss(true); setMbAplicarCsll(true); setMbValorEditado(false); }}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">✓ Todos</button>
                        <button onClick={() => { setMbAplicarPis(false); setMbAplicarCofins(false); setMbAplicarInss(false); setMbAplicarCsll(false); setMbValorEditado(false); }}
                          className="text-xs font-bold text-slate-500 hover:underline">✗ Nenhum</button>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                        <span>Valor Bruto</span>
                        <span className="font-bold text-slate-900 dark:text-white">{brl(mbConfigImpostos.valor_bruto)}</span>
                      </div>
                      {([
                        ['PIS',    mbAplicarPis,    setMbAplicarPis,    mbPctPis,    setMbPctPis],
                        ['COFINS', mbAplicarCofins, setMbAplicarCofins, mbPctCofins, setMbPctCofins],
                        ['INSS',   mbAplicarInss,   setMbAplicarInss,   mbPctInss,   setMbPctInss],
                        ['CSLL',   mbAplicarCsll,   setMbAplicarCsll,   mbPctCsll,   setMbPctCsll],
                      ] as [string, boolean, (v: boolean) => void, string, (v: string) => void][]).map(([label, aplicar, setAplicar, pct, setPct]) => (
                        <div key={label} className="flex items-center gap-2">
                          <input type="checkbox" checked={aplicar}
                            onChange={e => { setAplicar(e.target.checked); setMbValorEditado(false); }}
                            className="w-4 h-4 rounded accent-red-500" />
                          <span className={`w-16 font-bold text-xs ${aplicar ? 'text-red-600 dark:text-red-400' : 'text-slate-400 line-through'}`}>{label}</span>
                          <div className="flex items-center gap-1 flex-1">
                            <input type="number" step="0.01" min="0" max="100" value={pct} disabled={!aplicar}
                              onChange={e => { setPct(e.target.value); setMbValorEditado(false); }}
                              className="w-20 px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-green-500 outline-none text-right disabled:opacity-40" />
                            <span className="text-xs text-slate-400">%</span>
                          </div>
                          <span className={`text-xs w-24 text-right ${aplicar ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
                            {aplicar ? `- ${brl(mbConfigImpostos.valor_bruto * parseFloat(pct || '0') / 100)}` : '—'}
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-1 space-y-1.5">
                        {(mbAplicarPis || mbAplicarCofins || mbAplicarInss || mbAplicarCsll) && (
                          <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                            <span>Total Impostos</span>
                            <span className="font-bold text-red-600 dark:text-red-400">
                              - {brl(mbConfigImpostos.valor_bruto * ((mbAplicarPis ? parseFloat(mbPctPis||'0') : 0) + (mbAplicarCofins ? parseFloat(mbPctCofins||'0') : 0) + (mbAplicarInss ? parseFloat(mbPctInss||'0') : 0) + (mbAplicarCsll ? parseFloat(mbPctCsll||'0') : 0)) / 100)}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center">
                          <span className="font-black text-green-700 dark:text-green-400 text-base">Valor Líquido</span>
                          <span className="font-black text-green-700 dark:text-green-400 text-base">{brl(calcularLiquidoModal())}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Seção 3: Parcelas */}
                  {(() => {
                    const totalParcelas = modalBoleto.nota.parcelas ?? 1;
                    const existentes = (boletosPorNota[modalBoleto.nota.id] ?? []).map(b => b.numero_parcela);
                    const valorLiquidoTotal = mbValorEditado ? (parseFloat(mbValor) || calcularLiquidoModal()) : calcularLiquidoModal();
                    const valorPorParcela = valorLiquidoTotal / totalParcelas;
                    const totalImpostos = mbConfigImpostos.valor_bruto * ((mbAplicarPis ? parseFloat(mbPctPis||'0') : 0) + (mbAplicarCofins ? parseFloat(mbPctCofins||'0') : 0) + (mbAplicarInss ? parseFloat(mbPctInss||'0') : 0) + (mbAplicarCsll ? parseFloat(mbPctCsll||'0') : 0)) / 100;
                    const diff = Math.abs((valorLiquidoTotal + totalImpostos) - mbConfigImpostos.valor_bruto);
                    const baseDate = mbDataVencimento ? pd(mbDataVencimento) : pd(modalBoleto.nota.data_vencimento);
                    return (
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase">
                            Parcelas ({mbParcelasSelecionadas.size}/{totalParcelas} selecionadas)
                          </p>
                          <div className="flex gap-2 text-xs">
                            <button onClick={() => setMbParcelasSelecionadas(new Set(Array.from({length: totalParcelas}, (_,i) => i+1).filter(p => !existentes.includes(p))))}
                              className="font-bold text-purple-600 dark:text-purple-400 hover:underline">Faltantes</button>
                            <span className="text-slate-300 dark:text-slate-600">|</span>
                            <button onClick={() => setMbParcelasSelecionadas(new Set())}
                              className="font-bold text-slate-500 hover:underline">Limpar</button>
                          </div>
                        </div>

                        {/* Valor por parcela editável */}
                        <div className="mb-4 flex items-center gap-3">
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-300 shrink-0">
                            Valor por parcela {totalParcelas > 1 ? `(${totalParcelas}x)` : ''}
                          </span>
                          <input type="number" step="0.01" min="0.01"
                            value={mbValorEditado ? (parseFloat(mbValor) / totalParcelas).toFixed(2) : valorPorParcela.toFixed(2)}
                            onChange={e => { const v = parseFloat(e.target.value) || 0; setMbValor((v * totalParcelas).toFixed(2)); setMbValorEditado(true); }}
                            className={`w-36 px-2 py-1.5 text-sm font-black rounded-lg border focus:ring-2 focus:ring-green-500 outline-none text-right ${
                              mbValorEditado
                                ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 text-yellow-700 dark:text-yellow-300'
                                : 'bg-green-50 dark:bg-green-900/20 border-green-300 text-green-700 dark:text-green-400'
                            }`} />
                          {mbValorEditado && (
                            <button onClick={() => setMbValorEditado(false)} className="text-xs text-slate-500 underline hover:no-underline">resetar</button>
                          )}
                        </div>

                        <div className="space-y-2">
                          {Array.from({ length: totalParcelas }, (_, i) => {
                            const num = i + 1;
                            const jaExiste = existentes.includes(num);
                            const selecionada = mbParcelasSelecionadas.has(num);
                            const boletoExistente = (boletosPorNota[modalBoleto.nota.id] ?? []).find(b => b.numero_parcela === num);
                            const dataParc = new Date(baseDate.getTime() + (num - 1) * 30 * 24 * 60 * 60 * 1000);
                            return (
                              <div key={num} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                jaExiste ? 'bg-slate-100 dark:bg-slate-700/50 border-slate-200 dark:border-slate-700 opacity-60' :
                                selecionada ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' :
                                'bg-white dark:bg-slate-800/30 border-slate-200 dark:border-slate-700'
                              }`}>
                                <input type="checkbox" checked={selecionada} disabled={jaExiste}
                                  onChange={e => { const s = new Set(mbParcelasSelecionadas); if (e.target.checked) s.add(num); else s.delete(num); setMbParcelasSelecionadas(s); }}
                                  className="w-4 h-4 rounded accent-green-600 disabled:opacity-40" />
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 ${jaExiste ? 'bg-slate-400' : selecionada ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}>{num}</div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-900 dark:text-white">
                                      {totalParcelas === 1 ? 'À vista' : `${num}ª parcela`}
                                    </span>
                                    {jaExiste && boletoExistente && (
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${BOLETO_STATUS[boletoExistente.situacao]?.cls ?? ''}`}>
                                        {BOLETO_STATUS[boletoExistente.situacao]?.label ?? boletoExistente.situacao}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {brl(valorPorParcela)} · venc. {dataParc.toLocaleDateString('pt-BR')}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Validação consistência */}
                        <div className={`mt-3 px-4 py-2.5 rounded-xl flex items-start gap-2 border text-xs font-semibold ${
                          diff <= 0.10
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
                            : 'bg-amber-50 dark:bg-amber-500/10 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400'
                        }`}>
                          <span className="shrink-0">{diff <= 0.10 ? '✅' : '⚠️'}</span>
                          <span>
                            {diff <= 0.10
                              ? `Consistente: ${brl(valorLiquidoTotal)} (parcelas) + ${brl(totalImpostos)} (impostos) = ${brl(mbConfigImpostos.valor_bruto)}`
                              : `Parcelas (${brl(valorLiquidoTotal)}) + impostos (${brl(totalImpostos)}) = ${brl(valorLiquidoTotal + totalImpostos)} ≠ ${brl(mbConfigImpostos.valor_bruto)}`
                            }
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Seção 4: Data de Vencimento */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl px-5 py-4">
                    <label className="block text-xs font-black text-slate-500 dark:text-slate-400 uppercase mb-2">Data de Vencimento (1ª Parcela)</label>
                    <input type="date" value={mbDataVencimento} onChange={e => setMbDataVencimento(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-slate-900 dark:text-white" />
                    {(modalBoleto.nota.parcelas ?? 1) > 1 && (
                      <p className="text-xs text-slate-400 mt-1">Parcelas seguintes: +30 dias</p>
                    )}
                  </div>

                  {/* Seção 5: Descrição / Mensagem */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5">
                    <button onClick={() => setMbDescricaoExpanded(p => !p)} className="flex items-center justify-between w-full">
                      <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase flex items-center gap-2">
                        <span>📄</span> Descrição / Mensagem do Boleto
                      </p>
                      <span className="text-slate-400 text-sm">{mbDescricaoExpanded ? '▲' : '▼'}</span>
                    </button>
                    {!mbDescricaoExpanded && mbMensagem && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{mbMensagem}</p>
                    )}
                    {mbDescricaoExpanded && (
                      <textarea value={mbMensagem} onChange={e => setMbMensagem(e.target.value)} rows={5} maxLength={500}
                        className="mt-3 w-full px-3 py-2 text-sm rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-slate-900 dark:text-white resize-y" />
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="sticky bottom-0 bg-white dark:bg-slate-900 px-8 py-5 border-t border-slate-200 dark:border-slate-800 flex gap-3">
              <button onClick={() => setModalBoleto(null)} disabled={mbGerando}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleConfirmarGerarBoleto} disabled={mbGerando || mbCarregando || mbParcelasSelecionadas.size === 0}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {mbGerando && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                🏦 Emitir {mbParcelasSelecionadas.size > 0 ? `${mbParcelasSelecionadas.size} parcela(s)` : 'Boleto Inter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerar em Massa */}
      {modalMassa && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl my-4">
            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-8 pt-6 pb-4 border-b border-slate-200 dark:border-slate-800 z-10 rounded-t-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">Gerar Boletos em Massa</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {massaItems.filter(i => i.selecionado).length} de {massaItems.length} selecionados · edite os dados de cada linha antes de gerar
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => setMassaItems(prev => prev.map(i => ({ ...i, selecionado: true })))}
                    className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline">Todos</button>
                  <button onClick={() => setMassaItems(prev => prev.map(i => ({ ...i, selecionado: false })))}
                    className="text-xs font-bold text-slate-500 hover:underline">Nenhum</button>
                  <button onClick={() => setModalMassa(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 ml-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            </div>

            {/* Items list */}
            <div className="px-6 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
              {massaItems.map(item => (
                <div key={item.notaId} className={`border rounded-2xl p-5 transition-all ${
                  item.gerado ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700' :
                  item.erro ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700' :
                  item.selecionado ? 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700' :
                  'bg-slate-50/50 dark:bg-slate-800/20 border-slate-100 dark:border-slate-800 opacity-60'
                }`}>
                  {/* Item header */}
                  <div className="flex items-center gap-3 mb-4">
                    <input type="checkbox" checked={item.selecionado} disabled={item.gerado || massaGerando}
                      onChange={e => updateMassaItem(item.notaId, { selecionado: e.target.checked })}
                      className="w-4 h-4 rounded accent-green-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-slate-900 dark:text-white truncate">{item.condominio}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        NF #{item.numeroNota} · {item.parcelasFaltantes.length} parcela(s) pendente(s) de {item.parcelasTotal}
                      </p>
                    </div>
                    {item.carregando && <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin shrink-0" />}
                    {item.gerado && <span className="text-xs font-bold text-green-600 dark:text-green-400 shrink-0">✅ Gerado</span>}
                    {item.erro && <span className="text-xs font-bold text-red-600 dark:text-red-400 shrink-0 max-w-48 truncate" title={item.erro}>❌ {item.erro}</span>}
                  </div>

                  {!item.gerado && (
                    <>
                      {/* Valor bruto + Líquido */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Valor Bruto (R$)</label>
                          <input type="number" step="0.01" min="0.01" value={item.valor} disabled={massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { valor: e.target.value, valorEditado: false })}
                            className="w-full px-2 py-1.5 text-sm rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-green-500 outline-none font-bold text-slate-900 dark:text-white" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">
                            Valor Líquido {item.parcelasTotal > 1 ? `(total → ${brl((item.valorEditado ? parseFloat(item.valorOverride) || 0 : calcLiquidoItem(item)) / item.parcelasTotal)}/parc)` : ''}
                          </label>
                          <div className="flex items-center gap-1">
                            <input type="number" step="0.01" min="0.01"
                              value={item.valorEditado ? item.valorOverride : calcLiquidoItem(item).toFixed(2)}
                              disabled={massaGerando}
                              onChange={e => updateMassaItem(item.notaId, { valorOverride: e.target.value, valorEditado: true })}
                              onFocus={() => { if (!item.valorEditado) updateMassaItem(item.notaId, { valorOverride: calcLiquidoItem(item).toFixed(2), valorEditado: true }); }}
                              className={`w-full px-2 py-1.5 text-sm rounded-lg border focus:ring-1 focus:ring-green-500 outline-none font-black ${
                                item.valorEditado
                                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400 text-yellow-700 dark:text-yellow-300'
                                  : 'bg-green-50 dark:bg-green-900/20 border-green-300 text-green-700 dark:text-green-400'
                              }`} />
                            {item.valorEditado && (
                              <button onClick={() => updateMassaItem(item.notaId, { valorEditado: false, valorOverride: '' })}
                                className="text-sm text-slate-400 hover:text-slate-600 shrink-0 px-1" title="Resetar">↺</button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Impostos */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                        {/* PIS */}
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2 py-1.5">
                          <input type="checkbox" checked={item.aplicarPis} disabled={massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { aplicarPis: e.target.checked })}
                            className="w-3.5 h-3.5 rounded accent-red-500 shrink-0" />
                          <span className={`text-xs font-bold w-10 shrink-0 ${item.aplicarPis ? 'text-red-600 dark:text-red-400' : 'text-slate-400 line-through'}`}>PIS</span>
                          <input type="number" step="0.01" min="0" max="100" value={item.pctPis}
                            disabled={!item.aplicarPis || massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { pctPis: e.target.value })}
                            className="w-12 px-1 py-0.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 outline-none text-right disabled:opacity-40" />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                        {/* COFINS */}
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2 py-1.5">
                          <input type="checkbox" checked={item.aplicarCofins} disabled={massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { aplicarCofins: e.target.checked })}
                            className="w-3.5 h-3.5 rounded accent-red-500 shrink-0" />
                          <span className={`text-xs font-bold w-14 shrink-0 ${item.aplicarCofins ? 'text-red-600 dark:text-red-400' : 'text-slate-400 line-through'}`}>COFINS</span>
                          <input type="number" step="0.01" min="0" max="100" value={item.pctCofins}
                            disabled={!item.aplicarCofins || massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { pctCofins: e.target.value })}
                            className="w-12 px-1 py-0.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 outline-none text-right disabled:opacity-40" />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                        {/* INSS */}
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2 py-1.5">
                          <input type="checkbox" checked={item.aplicarInss} disabled={massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { aplicarInss: e.target.checked })}
                            className="w-3.5 h-3.5 rounded accent-red-500 shrink-0" />
                          <span className={`text-xs font-bold w-10 shrink-0 ${item.aplicarInss ? 'text-red-600 dark:text-red-400' : 'text-slate-400 line-through'}`}>INSS</span>
                          <input type="number" step="0.01" min="0" max="100" value={item.pctInss}
                            disabled={!item.aplicarInss || massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { pctInss: e.target.value })}
                            className="w-12 px-1 py-0.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 outline-none text-right disabled:opacity-40" />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                        {/* CSLL */}
                        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2 py-1.5">
                          <input type="checkbox" checked={item.aplicarCsll} disabled={massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { aplicarCsll: e.target.checked })}
                            className="w-3.5 h-3.5 rounded accent-red-500 shrink-0" />
                          <span className={`text-xs font-bold w-10 shrink-0 ${item.aplicarCsll ? 'text-red-600 dark:text-red-400' : 'text-slate-400 line-through'}`}>CSLL</span>
                          <input type="number" step="0.01" min="0" max="100" value={item.pctCsll}
                            disabled={!item.aplicarCsll || massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { pctCsll: e.target.value })}
                            className="w-12 px-1 py-0.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 outline-none text-right disabled:opacity-40" />
                          <span className="text-xs text-slate-400">%</span>
                        </div>
                      </div>

                      {/* Juros + Data + Mensagem */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2 py-1.5">
                          <input type="checkbox" id={`juros-${item.notaId}`} checked={item.aplicarJuros} disabled={massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { aplicarJuros: e.target.checked })}
                            className="w-3.5 h-3.5 rounded accent-green-600 shrink-0" />
                          <label htmlFor={`juros-${item.notaId}`} className="text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer shrink-0">Juros</label>
                          {item.aplicarJuros && (
                            <>
                              <input type="number" step="0.01" min="0" value={item.taxaJuros} disabled={massaGerando}
                                onChange={e => updateMassaItem(item.notaId, { taxaJuros: e.target.value })}
                                className="w-14 px-1 py-0.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 outline-none text-right ml-1" />
                              <span className="text-xs text-slate-400">%/m</span>
                            </>
                          )}
                        </div>
                        <div>
                          <input type="date" value={item.dataVencimento} disabled={massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { dataVencimento: e.target.value })}
                            className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-green-500 outline-none text-slate-900 dark:text-white" />
                        </div>
                        <div>
                          <input type="text" maxLength={300} value={item.mensagem} disabled={massaGerando}
                            onChange={e => updateMassaItem(item.notaId, { mensagem: e.target.value })}
                            placeholder={`Mensagem (NF ${item.numeroNota})`}
                            className="w-full px-2 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-green-500 outline-none" />
                        </div>
                      </div>

                      {/* Parcelas */}
                      <div className="flex flex-wrap gap-2">
                        {Array.from({ length: item.parcelasTotal }, (_, i) => {
                          const num = i + 1;
                          const faltante = item.parcelasFaltantes.includes(num);
                          const selecionada = item.parcelasSelecionadas.includes(num);
                          return (
                            <label key={num} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                              !faltante ? 'bg-slate-100 dark:bg-slate-700/50 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed' :
                              selecionada ? 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-600 text-green-700 dark:text-green-400' :
                              'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                            }`}>
                              <input type="checkbox" checked={selecionada} disabled={!faltante || massaGerando}
                                onChange={e => {
                                  const s = item.parcelasSelecionadas.filter(p => p !== num);
                                  if (e.target.checked) s.push(num);
                                  updateMassaItem(item.notaId, { parcelasSelecionadas: s.sort((a, b) => a - b) });
                                }}
                                className="w-3 h-3 accent-green-600" />
                              {num}/{item.parcelasTotal}
                              {!faltante && <span>✓</span>}
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white dark:bg-slate-900 px-8 py-5 border-t border-slate-200 dark:border-slate-800 flex gap-3 rounded-b-2xl">
              <button onClick={() => setModalMassa(false)} disabled={massaGerando}
                className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all disabled:opacity-50">
                Fechar
              </button>
              <button onClick={handleGerarMassa}
                disabled={massaGerando || massaItems.filter(i => i.selecionado && i.parcelasSelecionadas.length > 0 && !i.gerado).length === 0}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {massaGerando && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {massaGerando
                  ? 'Gerando...'
                  : `🏦 Gerar ${massaItems.filter(i => i.selecionado && i.parcelasSelecionadas.length > 0 && !i.gerado).length} serviço(s) no Inter`
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
