"use client"

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Servico {
  id: number;
  condominio_id: number;
  tipo: 'manutencao' | 'assistencia';
  data_servico: string;
  descricao: string | null;
  nota_fiscal_id: number | null;
  numero_os: string | null;
  criado_em: string;
  atualizado_em: string;
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
  cnpj: string;
}

interface NotaFiscal {
  id: number;
  numero_nota: string;
  tipo: string;
  valor: number;
  parcelas: number;
  data_vencimento: string;
  data_pagamento: string | null;
  cliente_nome: string | null;
  observacao: string | null;
  descricao_servico: string | null;
  status: string;
  parcelas_json: Array<{ parcela: number; valor: number; data: string | null }> | null;
  valor_boleto_parcela: number | null;
  iss: number | null;
  pis: number | null;
  cofins: number | null;
  inss: number | null;
  csll: number | null;
  icms: number | null;
  prev: number | null;
  alerta_impostos: number;
  divergencia_impostos: Record<string, { pct: number; config: number; xml: number }> | null;
}

interface Boleto {
  id: number;
  codigo_solicitacao: string | null;
  nosso_numero: string | null;
  seu_numero: string | null;
  valor_nominal: number;
  valor_juros: number;
  valor_multa: number;
  valor_total_recebido: number | null;
  data_emissao: string;
  data_vencimento: string;
  data_pagamento: string | null;
  situacao: 'EMABERTO' | 'PAGO' | 'CANCELADO' | 'EXPIRADO' | 'VENCIDO' | 'BAIXADO';
  numero_parcela: number;
  total_parcelas: number;
  forma_pagamento: string;
  banco_pagamento: string | null;
  observacao: string | null;
}

interface ParcelaDisplay {
  parcela: number;
  valor: number;
  data: string | null;
}

interface ParcelaItem {
  numero: number;
  valor: string;           // liquid value for this parcel (editable in step 1)
  dataVencimento: string;  // ISO date string
  situacaoBoleto: string | null; // null = no boleto, else boleto.situacao
}

const SITUACAO_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  EMABERTO:  { label: 'Em Aberto', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',     dot: 'bg-blue-500' },
  PAGO:      { label: 'Pago',      cls: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400', dot: 'bg-green-500' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',         dot: 'bg-red-500' },
  EXPIRADO:  { label: 'Expirado',  cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',    dot: 'bg-slate-400' },
  VENCIDO:   { label: 'Vencido',   cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400', dot: 'bg-orange-500' },
  BAIXADO:   { label: 'Baixado',   cls: 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400',    dot: 'bg-teal-500' },
};

const FORMA_LABEL: Record<string, string> = {
  BOLETO_INTER: 'Boleto Inter', BOLETO_ITAU: 'Boleto Itaú', PIX: 'PIX',
  DINHEIRO: 'Dinheiro', TRANSFERENCIA: 'Transferência', CHEQUE: 'Cheque',
};

const FORMAS_PAGAMENTO = ['PIX', 'DINHEIRO', 'TRANSFERENCIA', 'CHEQUE', 'BOLETO_ITAU', 'BOLETO_INTER'];

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function pd(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
}

function addDays(dateStr: string, days: number): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function ServicoDetalhesPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [servico, setServico] = useState<Servico | null>(null);
  const [condominio, setCondominio] = useState<Condominio | null>(null);
  const [notaFiscal, setNotaFiscal] = useState<NotaFiscal | null>(null);
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [motivo, setMotivo] = useState('');

  // Ações
  const [desvinculandoNota, setDesvinculandoNota] = useState(false);
  const [deletandoBoletoId, setDeletandoBoletoId] = useState<number | null>(null);
  const [cancelandoBoletoId, setCancelandoBoletoId] = useState<number | null>(null);
  const [gerandoParcelas, setGerandoParcelas] = useState(false);

  // Form
  const [tipo, setTipo] = useState('');
  const [dataServico, setDataServico] = useState('');
  const [descricao, setDescricao] = useState('');

  const [id, setId] = useState<string | null>(null);

  // Modal "Registrar Cobrança"
  const [modalRegistrar, setModalRegistrar] = useState<number | null>(null); // numero_parcela
  const [regForma, setRegForma] = useState('PIX');
  const [regBanco, setRegBanco] = useState('');
  const [regObs, setRegObs] = useState('');
  const [regData, setRegData] = useState('');
  const [regValor, setRegValor] = useState('');
  const [regJaPago, setRegJaPago] = useState(false);
  const [regDataPago, setRegDataPago] = useState('');
  const [regValorPago, setRegValorPago] = useState('');
  const [regSaving, setRegSaving] = useState(false);

  // Modal "Gerar Inter" — pré-visualização com impostos editáveis
  const [modalInter, setModalInter] = useState(false);
  const [configImpostos, setConfigImpostos] = useState<ConfigImpostos | null>(null);
  const [interMensagem, setInterMensagem] = useState('');
  const [interAplicarPis, setInterAplicarPis] = useState(true);
  const [interPctPis, setInterPctPis] = useState('0');
  const [interAplicarCofins, setInterAplicarCofins] = useState(true);
  const [interPctCofins, setInterPctCofins] = useState('0');
  const [interAplicarInss, setInterAplicarInss] = useState(true);
  const [interPctInss, setInterPctInss] = useState('0');
  const [interAplicarCsll, setInterAplicarCsll] = useState(true);
  const [interPctCsll, setInterPctCsll] = useState('0');
  const [interDataVencimento, setInterDataVencimento] = useState('');
  const [interNumeroNota, setInterNumeroNota] = useState('');
  const [interDescricaoExpanded, setInterDescricaoExpanded] = useState(false);
  const [interEtapa, setInterEtapa] = useState<1 | 2>(1);
  const [interAprovado, setInterAprovado] = useState(false);
  const [interParcelasItens, setInterParcelasItens] = useState<ParcelaItem[]>([]);
  const [interPayloadExpanded, setInterPayloadExpanded] = useState<number | null>(null);
  const [gerandoParcelaNum, setGerandoParcelaNum] = useState<number | null>(null);
  const [interParcelaFoco, setInterParcelaFoco] = useState<number | null>(null);
  const [carregandoConfig, setCarregandoConfig] = useState(false);

  // Modal "Marcar Pago"
  const [modalPago, setModalPago] = useState<Boleto | null>(null);
  const [pagoForma, setPagoForma] = useState('PIX');
  const [pagoData, setPagoData] = useState('');
  const [pagoValor, setPagoValor] = useState('');
  const [pagoObs, setPagoObs] = useState('');
  const [pagoSaving, setPagoSaving] = useState(false);

  useEffect(() => {
    params.then(p => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (id) carregarDados();
  }, [id]);

  const carregarDados = async () => {
    if (!id) return;
    try {
      const { data: s } = await api.get(`/servicos/${id}`);
      setServico(s);
      setTipo(s.tipo);
      setDataServico(s.data_servico);
      setDescricao(s.descricao || '');

      const condoRes = await api.get(`/condominios/${s.condominio_id}`);
      setCondominio(condoRes.data);

      if (s.nota_fiscal_id) {
        const [notaRes, boletosRes] = await Promise.all([
          api.get(`/notas-fiscais/${s.nota_fiscal_id}`),
          api.get(`/boletos/nota/${s.nota_fiscal_id}`),
        ]);
        setNotaFiscal(notaRes.data);
        setBoletos(boletosRes.data || []);
      } else {
        setNotaFiscal(null);
        setBoletos([]);
      }
    } catch {
      alert('Serviço não encontrado');
      router.push('/servicos');
    } finally {
      setLoading(false);
    }
  };

  const handleSalvar = async () => {
    if (!id) return;
    try {
      await api.put(`/servicos/${id}`, { tipo, data_servico: dataServico, descricao: descricao || null });
      setEditando(false);
      carregarDados();
    } catch {
      alert('Erro ao atualizar serviço');
    }
  };

  const handleDesvinculatNota = async () => {
    if (!id || !notaFiscal) return;
    if (!confirm(`Desvincular a nota fiscal #${notaFiscal.numero_nota} deste serviço? O serviço continuará existindo, mas sem nota vinculada.`)) return;
    setDesvinculandoNota(true);
    try {
      await api.put(`/servicos/${id}`, { nota_fiscal_id: null });
      await carregarDados();
    } catch {
      alert('Erro ao desvincular nota.');
    } finally {
      setDesvinculandoNota(false);
    }
  };

  const handleDeletarBoleto = async (boletoId: number) => {
    if (!confirm('Remover este boleto do sistema local? (Não cancela no Banco Inter)')) return;
    setDeletandoBoletoId(boletoId);
    try {
      await api.delete(`/boletos/${boletoId}`);
      setBoletos(prev => prev.filter(b => b.id !== boletoId));
    } catch {
      alert('Erro ao remover boleto.');
    } finally {
      setDeletandoBoletoId(null);
    }
  };

  const handleExcluir = async () => {
    if (!id) return;
    try {
      await api.delete(`/servicos/${id}`, { params: { motivo: motivo || 'Exclusão solicitada pelo usuário' } });
      router.push('/servicos');
    } catch {
      alert('Erro ao excluir serviço');
    }
  };

  if (loading || !servico) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-slate-400 font-semibold">Carregando serviço...</p>
        </div>
      </div>
    );
  }

  const gradColor = servico.tipo === 'manutencao' ? 'from-purple-500 to-purple-600' : 'from-blue-500 to-blue-600';
  const icon = servico.tipo === 'manutencao' ? '🛠️' : '🔧';
  const nome = servico.tipo === 'manutencao' ? 'Manutenção Preventiva' : 'Assistência Técnica';

  const totalPago = boletos.filter(b => b.situacao === 'PAGO' || b.situacao === 'BAIXADO').length;
  const valorBruto = boletos.reduce((s, b) => s + b.valor_nominal, 0);
  const valorRecebido = boletos.reduce((s, b) => s + (b.valor_total_recebido || 0), 0);

  // Detecção de inconsistências
  const totalEsperado = notaFiscal?.parcelas ?? 0;
  const tolerancia = notaFiscal ? notaFiscal.valor * 0.40 : 0;
  const valorEsperadoParcela = notaFiscal && totalEsperado > 0 ? notaFiscal.valor / totalEsperado : 0;
  const boletosExcedentes = totalEsperado > 0 && boletos.length > totalEsperado;
  const boletosValorErrado = notaFiscal
    ? boletos.filter(b => Math.abs(b.valor_nominal - valorEsperadoParcela) > tolerancia)
    : [];
  const temInconsistencia = boletosExcedentes || boletosValorErrado.length > 0;

  function getParcelasDisplay(): ParcelaDisplay[] {
    if (!notaFiscal) return [];
    if (notaFiscal.parcelas_json && notaFiscal.parcelas_json.length > 0) {
      return notaFiscal.parcelas_json;
    }
    const total = notaFiscal.parcelas || 1;
    const valorParcela = notaFiscal.valor_boleto_parcela ?? (notaFiscal.valor / total);
    return Array.from({ length: total }, (_, i) => ({
      parcela: i + 1,
      valor: valorParcela,
      data: null,
    }));
  }
  const parcelasDisplay = notaFiscal ? getParcelasDisplay() : [];

  const calcularValorLiquidoModal = (): number => {
    if (!configImpostos) return 0;
    const bruto = configImpostos.valor_bruto;
    const pis    = interAplicarPis    ? parseFloat(interPctPis    || '0') : 0;
    const cofins = interAplicarCofins ? parseFloat(interPctCofins || '0') : 0;
    const inss   = interAplicarInss   ? parseFloat(interPctInss   || '0') : 0;
    const csll   = interAplicarCsll   ? parseFloat(interPctCsll   || '0') : 0;
    const totalPct = (pis + cofins + inss + csll) / 100;
    return Math.max(bruto * (1 - totalPct), 0.01);
  };

  const totalImpostosModal = () => {
    if (!configImpostos) return 0;
    const bruto = configImpostos.valor_bruto;
    return bruto * ((interAplicarPis ? parseFloat(interPctPis||'0') : 0) +
      (interAplicarCofins ? parseFloat(interPctCofins||'0') : 0) +
      (interAplicarInss ? parseFloat(interPctInss||'0') : 0) +
      (interAplicarCsll ? parseFloat(interPctCsll||'0') : 0)) / 100;
  };

  const somaParcelasModal = () =>
    interParcelasItens.reduce((s, p) => s + (parseFloat(p.valor) || 0), 0);

  const handleGerarParcelasFaltantes = async (parcelaNum?: number) => {
    if (!notaFiscal) return;
    setCarregandoConfig(true);
    try {
      const { data: cfg } = await api.get<ConfigImpostos>(`/boletos/config-impostos/${notaFiscal.id}`);
      console.log('[Config Impostos]', cfg);
      setConfigImpostos(cfg);
      setInterAplicarPis(cfg.pct_pis > 0);
      setInterPctPis(String(cfg.pct_pis ?? 0));
      setInterAplicarCofins(cfg.pct_cofins > 0);
      setInterPctCofins(String(cfg.pct_cofins ?? 0));
      setInterAplicarInss(cfg.pct_inss > 0);
      setInterPctInss(String(cfg.pct_inss ?? 0));
      setInterAplicarCsll(cfg.pct_csll > 0);
      setInterPctCsll(String(cfg.pct_csll ?? 0));
      setInterDataVencimento(notaFiscal.data_vencimento);
      setInterNumeroNota(notaFiscal.numero_nota);
      setInterDescricaoExpanded(false);
      setInterMensagem([notaFiscal.descricao_servico, cfg.numero_os ? `OS: ${cfg.numero_os}` : null].filter(Boolean).join(' | '));
      // Initialize per-parcel items
      const liquido = cfg.valor_liquido ?? notaFiscal.valor;
      const n = notaFiscal.parcelas || 1;
      const parcelaBase = Math.floor(liquido / n * 100) / 100;
      const parcelaUltima = liquido - parcelaBase * (n - 1);
      const items: ParcelaItem[] = Array.from({ length: n }, (_, i) => {
        const num = i + 1;
        const boleto = boletos.find(b => b.numero_parcela === num && b.situacao !== 'CANCELADO' && b.situacao !== 'EXPIRADO');
        const situacao = boleto ? boleto.situacao : (boletos.find(b => b.numero_parcela === num) ? boletos.find(b => b.numero_parcela === num)!.situacao : null);
        const val = boleto ? boleto.valor_nominal.toFixed(2) : (num === n ? parcelaUltima.toFixed(2) : parcelaBase.toFixed(2));
        const data = boleto ? boleto.data_vencimento : addDays(notaFiscal.data_vencimento, 30 * i);
        return { numero: num, valor: val, dataVencimento: data, situacaoBoleto: situacao };
      });
      setInterParcelasItens(items);
      setInterEtapa(1);
      setInterAprovado(false);
      setInterPayloadExpanded(null);
      setInterParcelaFoco(parcelaNum ?? null);
      setModalInter(true);
    } catch (err: unknown) {
      console.error('[handleGerarParcelasFaltantes] Erro:', err);
      const fallback: ConfigImpostos = {
        pct_pis: 0.65, pct_cofins: 3, pct_inss: 11, pct_csll: 1,
        valor_bruto: notaFiscal.valor,
        valor_liquido: notaFiscal.valor * (1 - 0.1565),
        numero_os: null,
        aplicar_juros_default: notaFiscal.tipo !== 'OUTROS',
        alerta_impostos: false,
        divergencia_impostos: null,
      };
      setConfigImpostos(fallback);
      setInterAplicarPis(true); setInterPctPis('0.65');
      setInterAplicarCofins(true); setInterPctCofins('3');
      setInterAplicarInss(true); setInterPctInss('11');
      setInterAplicarCsll(true); setInterPctCsll('1');
      setInterDataVencimento(notaFiscal.data_vencimento);
      setInterNumeroNota(notaFiscal.numero_nota);
      setInterDescricaoExpanded(false);
      setInterMensagem(notaFiscal.descricao_servico || '');
      const n = notaFiscal.parcelas || 1;
      const parcelaBase = Math.floor(fallback.valor_liquido / n * 100) / 100;
      const parcelaUltima = fallback.valor_liquido - parcelaBase * (n - 1);
      const items: ParcelaItem[] = Array.from({ length: n }, (_, i) => {
        const num = i + 1;
        const boleto = boletos.find(b => b.numero_parcela === num && b.situacao !== 'CANCELADO' && b.situacao !== 'EXPIRADO');
        const situacao = boleto ? boleto.situacao : (boletos.find(b => b.numero_parcela === num) ? boletos.find(b => b.numero_parcela === num)!.situacao : null);
        const val = boleto ? boleto.valor_nominal.toFixed(2) : (num === n ? parcelaUltima.toFixed(2) : parcelaBase.toFixed(2));
        const data = boleto ? boleto.data_vencimento : addDays(notaFiscal.data_vencimento, 30 * i);
        return { numero: num, valor: val, dataVencimento: data, situacaoBoleto: situacao };
      });
      setInterParcelasItens(items);
      setInterEtapa(1);
      setInterAprovado(false);
      setInterPayloadExpanded(null);
      setInterParcelaFoco(parcelaNum ?? null);
      setModalInter(true);
      alert('Aviso: usando configuração padrão de impostos (endpoint de config não respondeu).');
    } finally {
      setCarregandoConfig(false);
    }
  };

  const handleAprovarBoletos = () => {
    setInterAprovado(true);
    setInterEtapa(2);
  };

  const handleGerarParcelaSingle = async (item: ParcelaItem) => {
    if (!notaFiscal) return;
    setGerandoParcelaNum(item.numero);
    try {
      if (interNumeroNota && interNumeroNota !== notaFiscal.numero_nota) {
        await api.put(`/notas-fiscais/${notaFiscal.id}`, { numero_nota: interNumeroNota });
      }
      const valorParcela = parseFloat(item.valor);
      const totalParcelas = notaFiscal.parcelas || 1;
      // Adjust base date so backend computes exactly this date for this parcel
      const adjustedBase = addDays(item.dataVencimento, -30 * (item.numero - 1));
      const body: Record<string, unknown> = {
        pct_pis:    interAplicarPis    ? parseFloat(interPctPis    || '0') : 0,
        pct_cofins: interAplicarCofins ? parseFloat(interPctCofins || '0') : 0,
        pct_inss:   interAplicarInss   ? parseFloat(interPctInss   || '0') : 0,
        pct_csll:   interAplicarCsll   ? parseFloat(interPctCsll   || '0') : 0,
        aplicar_juros: false,
        parcelas_selecionadas: [item.numero],
        valor_total_override: valorParcela * totalParcelas,
        data_vencimento_override: adjustedBase,
      };
      if (interMensagem.trim()) body.mensagem = interMensagem.trim();
      await api.post(`/boletos/gerar-parcelas-faltantes/${notaFiscal.id}`, body);
      await carregarDados();
      setInterParcelasItens(prev => prev.map(p =>
        p.numero === item.numero ? { ...p, situacaoBoleto: 'EMABERTO' } : p
      ));
    } catch {
      alert(`Erro ao gerar boleto para parcela ${item.numero}.`);
    } finally {
      setGerandoParcelaNum(null);
    }
  };

  const handleGerarTodos = async () => {
    if (!notaFiscal) return;
    setGerandoParcelas(true);
    try {
      if (interNumeroNota && interNumeroNota !== notaFiscal.numero_nota) {
        await api.put(`/notas-fiscais/${notaFiscal.id}`, { numero_nota: interNumeroNota });
      }
      const faltantes = interParcelasItens.filter(p =>
        p.situacaoBoleto === null || p.situacaoBoleto === 'CANCELADO' || p.situacaoBoleto === 'EXPIRADO'
      );
      for (const item of faltantes) {
        const valorParcela = parseFloat(item.valor);
        const totalParcelas = notaFiscal.parcelas || 1;
        const adjustedBase = addDays(item.dataVencimento, -30 * (item.numero - 1));
        const body: Record<string, unknown> = {
          pct_pis:    interAplicarPis    ? parseFloat(interPctPis    || '0') : 0,
          pct_cofins: interAplicarCofins ? parseFloat(interPctCofins || '0') : 0,
          pct_inss:   interAplicarInss   ? parseFloat(interPctInss   || '0') : 0,
          pct_csll:   interAplicarCsll   ? parseFloat(interPctCsll   || '0') : 0,
          aplicar_juros: false,
          parcelas_selecionadas: [item.numero],
          valor_total_override: valorParcela * totalParcelas,
          data_vencimento_override: adjustedBase,
        };
        if (interMensagem.trim()) body.mensagem = interMensagem.trim();
        await api.post(`/boletos/gerar-parcelas-faltantes/${notaFiscal.id}`, body);
      }
      setModalInter(false);
      await carregarDados();
    } catch {
      alert('Erro ao gerar boletos.');
    } finally {
      setGerandoParcelas(false);
    }
  };

  const handleDispensarAlerta = async () => {
    if (!notaFiscal) return;
    try {
      const { data: updated } = await api.patch(`/notas-fiscais/${notaFiscal.id}/dispensar-alerta`);
      setNotaFiscal(updated);
    } catch {
      alert('Erro ao dispensar alerta.');
    }
  };

  const handleRegistrarCobranca = async () => {
    if (!notaFiscal || modalRegistrar === null) return;
    setRegSaving(true);
    try {
      await api.post('/boletos/manual', {
        nota_fiscal_id: notaFiscal.id,
        numero_parcela: modalRegistrar,
        total_parcelas: notaFiscal.parcelas,
        valor_nominal: parseFloat(regValor),
        data_vencimento: regData,
        forma_pagamento: regForma,
        banco_pagamento: regBanco || null,
        observacao: regObs || null,
        ja_pago: regJaPago,
        data_pagamento: regJaPago ? regDataPago : null,
        valor_recebido: regJaPago && regValorPago ? parseFloat(regValorPago) : null,
      });
      setModalRegistrar(null);
      await carregarDados();
    } catch {
      alert('Erro ao registrar cobrança.');
    } finally {
      setRegSaving(false);
    }
  };

  const handleCancelarBoleto = async (boleto: Boleto) => {
    if (!boleto.codigo_solicitacao) {
      alert('Este boleto não tem código Inter para cancelar.');
      return;
    }
    if (!confirm(`Cancelar boleto ${boleto.numero_parcela}/${boleto.total_parcelas} no Banco Inter? Esta ação não pode ser desfeita.`)) return;
    setCancelandoBoletoId(boleto.id);
    try {
      await api.post(`/boletos/${boleto.codigo_solicitacao}/cancelar`);
      await carregarDados();
    } catch {
      alert('Erro ao cancelar boleto no Inter.');
    } finally {
      setCancelandoBoletoId(null);
    }
  };

  const handleMarcarPago = async () => {
    if (!modalPago) return;
    setPagoSaving(true);
    try {
      await api.post(`/boletos/${modalPago.id}/registrar-pagamento`, {
        data_pagamento: pagoData,
        valor_recebido: parseFloat(pagoValor),
        forma_pagamento: pagoForma,
        banco_pagamento: pagoObs || null,
        observacao: null,
      });
      setModalPago(null);
      await carregarDados();
    } catch {
      alert('Erro ao registrar pagamento.');
    } finally {
      setPagoSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-8 py-5">
          <div className="flex items-center justify-between">
            <Link href="/servicos" className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 font-semibold transition-colors group">
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Voltar
            </Link>
            <div className="flex gap-2">
              {!editando ? (
                <>
                  <button onClick={() => setEditando(true)} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    Editar
                  </button>
                  <button onClick={() => setModalExcluir(true)} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    Excluir
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditando(false); carregarDados(); }} className="px-4 py-2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-bold hover:brightness-105 transition-all">Cancelar</button>
                  <button onClick={handleSalvar} className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:brightness-110 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Salvar
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-8 py-8 space-y-6">

        {/* Hero */}
        <div className={`bg-gradient-to-br ${gradColor} rounded-3xl p-8 shadow-2xl text-white relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 pointer-events-none" />
          <div className="relative flex items-start justify-between flex-wrap gap-6">
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg text-3xl shrink-0">{icon}</div>
              <div>
                <p className="text-sm opacity-80 mb-0.5">Serviço #{servico.id}</p>
                <h1 className="text-3xl font-black tracking-tight">{nome}</h1>
                <p className="text-base opacity-90 mt-1">
                  {condominio?.nome || '—'} · {pd(servico.data_servico)}
                </p>
              </div>
            </div>
            {/* Resumo financeiro rápido */}
            <div className="flex gap-4 flex-wrap">
              {notaFiscal && (
                <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/20 text-center">
                  <p className="text-xs opacity-75 uppercase font-bold mb-0.5">Valor Nota</p>
                  <p className="text-xl font-black">{fmt(notaFiscal.valor)}</p>
                </div>
              )}
              {boletos.length > 0 && (
                <>
                  <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/20 text-center">
                    <p className="text-xs opacity-75 uppercase font-bold mb-0.5">Cobrado</p>
                    <p className="text-xl font-black">{fmt(valorBruto)}</p>
                  </div>
                  <div className="bg-white/15 backdrop-blur-sm rounded-xl px-5 py-3 border border-white/20 text-center">
                    <p className="text-xs opacity-75 uppercase font-bold mb-0.5">Recebido</p>
                    <p className="text-xl font-black">{fmt(valorRecebido)}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Banner de inconsistência */}
        {temInconsistencia && (
          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-700 rounded-2xl p-5 flex items-start gap-4">
            <span className="text-2xl shrink-0">⚠️</span>
            <div className="flex-1">
              <p className="font-black text-amber-800 dark:text-amber-300 text-base mb-1">Inconsistência detectada nos boletos</p>
              <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-400">
                {boletosExcedentes && (
                  <li>• Esta nota tem <strong>{totalEsperado} parcela(s)</strong> mas {boletos.length} boleto(s) vinculado(s). Provavelmente 1 ou mais boletos pertencem a outra nota.</li>
                )}
                {boletosValorErrado.map(b => (
                  <li key={b.id}>• Boleto #{b.id} tem valor <strong>{fmt(b.valor_nominal)}</strong>, mas o esperado para esta nota é ≈<strong>{fmt(valorEsperadoParcela)}</strong> (diferença de {fmt(Math.abs(b.valor_nominal - valorEsperadoParcela))}).</li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                Use o botão 🗑️ no boleto incorreto para removê-lo desta nota. O boleto não é cancelado no Inter.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-6">

            {/* Dados do Serviço */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">📋</span> {editando ? 'Editar Serviço' : 'Dados do Serviço'}
                </h2>
              </div>
              <div className="p-6">
                {editando ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Tipo</label>
                      <select value={tipo} onChange={e => setTipo(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none">
                        <option value="manutencao">🛠️ Manutenção Preventiva</option>
                        <option value="assistencia">🔧 Assistência Técnica</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Data do Serviço</label>
                      <input type="date" value={dataServico} onChange={e => setDataServico(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Descrição</label>
                      <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={5}
                        placeholder="Descreva os serviços realizados..."
                        className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-purple-500 outline-none" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Tipo</p>
                        <p className="font-bold text-slate-900 dark:text-white">{icon} {nome}</p>
                      </div>
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data do Serviço</p>
                        <p className="font-bold text-slate-900 dark:text-white">{pd(servico.data_servico)}</p>
                      </div>
                      {servico.numero_os && (
                        <div className="bg-purple-50 dark:bg-purple-500/10 rounded-xl p-4 col-span-2">
                          <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-1">Ordem de Serviço (OS)</p>
                          <p className="font-black text-purple-700 dark:text-purple-300 text-lg">#{servico.numero_os}</p>
                        </div>
                      )}
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Descrição</p>
                      <p className="text-slate-900 dark:text-white leading-relaxed whitespace-pre-wrap">
                        {servico.descricao || <span className="text-slate-400 italic">Sem descrição</span>}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Nota Fiscal Vinculada — detalhes completos */}
            {notaFiscal ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-orange-50 dark:bg-orange-500/10 border-b border-orange-200 dark:border-orange-800/30 flex items-center justify-between">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xl">📄</span> Nota Fiscal Vinculada
                  </h2>
                  <div className="flex items-center gap-2">
                    <Link href={`/notas/${notaFiscal.id}`}
                      className="px-3 py-1.5 text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/20 rounded-lg hover:brightness-105 transition-all flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      Abrir nota
                    </Link>
                    <button onClick={handleDesvinculatNota} disabled={desvinculandoNota}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-lg hover:brightness-105 transition-all disabled:opacity-50 flex items-center gap-1">
                      {desvinculandoNota
                        ? <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.1-1.1m1.415-8.328a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.1-1.1" /></svg>}
                      Desvincular
                    </button>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Número</p>
                      <p className="font-black text-slate-900 dark:text-white">{notaFiscal.numero_nota}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Tipo</p>
                      <p className="font-bold text-slate-900 dark:text-white">{notaFiscal.tipo}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Parcelas</p>
                      <p className="font-bold text-slate-900 dark:text-white">{notaFiscal.parcelas}x</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-500/10 rounded-xl p-3">
                      <p className="text-xs font-bold text-green-600 dark:text-green-400 uppercase mb-1">Valor</p>
                      <p className="font-black text-green-700 dark:text-green-300 text-lg">{fmt(notaFiscal.valor)}</p>
                    </div>
                    <div className={`rounded-xl p-3 ${notaFiscal.data_pagamento ? 'bg-green-50 dark:bg-green-500/10' : 'bg-orange-50 dark:bg-orange-500/10'}`}>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Vencimento</p>
                      <p className="font-bold text-slate-900 dark:text-white">{pd(notaFiscal.data_vencimento)}</p>
                    </div>
                    <div className={`rounded-xl p-3 ${notaFiscal.data_pagamento ? 'bg-green-50 dark:bg-green-500/10' : 'bg-orange-50 dark:bg-orange-500/10'}`}>
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Pagamento</p>
                      <p className={`font-bold ${notaFiscal.data_pagamento ? 'text-green-700 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`}>
                        {notaFiscal.data_pagamento ? pd(notaFiscal.data_pagamento) : 'Não pago'}
                      </p>
                    </div>
                  </div>
                  {/* Status geral */}
                  <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold ${
                    notaFiscal.data_pagamento
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                      : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                  }`}>
                    <span>{notaFiscal.data_pagamento ? '✅' : '⏳'}</span>
                    {notaFiscal.data_pagamento ? 'Nota Paga' : 'Nota Pendente'}
                    <span className="ml-auto font-normal opacity-70 text-xs">status: {notaFiscal.status}</span>
                  </div>
                  {/* Alerta de divergência de impostos */}
                  {notaFiscal.alerta_impostos === 1 && notaFiscal.divergencia_impostos && (
                    <div className="mt-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-700 rounded-xl p-4 flex items-start gap-3">
                      <span className="text-xl shrink-0">⚠️</span>
                      <div className="flex-1">
                        <p className="font-bold text-amber-800 dark:text-amber-300 text-sm mb-1">Divergência de impostos detectada</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
                          Os percentuais do XML diferem da configuração do sistema. Verifique antes de gerar o boleto.
                        </p>
                        <div className="space-y-1 text-xs font-mono">
                          {Object.entries(notaFiscal.divergencia_impostos).map(([campo, d]) => (
                            <div key={campo} className="flex gap-4 text-amber-700 dark:text-amber-400">
                              <span className="uppercase w-14">{campo}</span>
                              <span>config: R$ {d.config.toFixed(2)}</span>
                              <span>xml: R$ {d.xml.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                        <button onClick={handleDispensarAlerta}
                          className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-400 underline hover:no-underline">
                          Dispensar alerta
                        </button>
                      </div>
                    </div>
                  )}
                  {notaFiscal.descricao_servico && (
                    <div className="mt-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Descrição da nota</p>
                      <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{notaFiscal.descricao_servico}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center shadow-sm">
                <span className="text-4xl mb-3 block">📄</span>
                <p className="text-slate-500 dark:text-slate-400 font-semibold">Sem nota fiscal vinculada</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Este serviço não está associado a nenhuma nota fiscal.</p>
              </div>
            )}

            {/* Cobranças por Parcela */}
            {notaFiscal && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-indigo-50 dark:bg-indigo-500/10 border-b border-indigo-200 dark:border-indigo-800/30 flex items-center justify-between flex-wrap gap-2">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xl">🏦</span> Cobranças por Parcela
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {totalPago}/{boletos.length} pago(s) · {fmt(valorRecebido)} recebido
                    </span>
                    <button
                      onClick={() => handleGerarParcelasFaltantes()}
                      disabled={gerandoParcelas || carregandoConfig}
                      className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-1"
                    >
                      {(gerandoParcelas || carregandoConfig) ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🏦'}
                      Gerar Inter (faltantes)
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {parcelasDisplay.map((parcela) => {
                    const boletosDaParcela = boletos.filter(b => b.numero_parcela === parcela.parcela);
                    const boletoPago = boletosDaParcela.find(b => b.situacao === 'PAGO' || b.situacao === 'BAIXADO');
                    const boletoAberto = boletosDaParcela.find(b => b.situacao === 'EMABERTO' || b.situacao === 'VENCIDO');
                    const boleto = boletoPago || boletoAberto || boletosDaParcela[0];

                    return (
                      <div key={parcela.parcela} className="p-5">
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white ${
                              boletoPago ? 'bg-green-500' : boletoAberto ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                            }`}>
                              {parcela.parcela}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white text-sm">
                                Parcela {parcela.parcela}/{notaFiscal.parcelas}
                                {boleto && (
                                  <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${SITUACAO_CONFIG[boleto.situacao]?.cls}`}>
                                    {SITUACAO_CONFIG[boleto.situacao]?.label}
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {fmt(parcela.valor)}
                                {parcela.data ? ` · venc. ${pd(parcela.data)}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {!boleto && (
                              <>
                                <button
                                  onClick={() => handleGerarParcelasFaltantes(parcela.parcela)}
                                  disabled={gerandoParcelas || carregandoConfig}
                                  className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-1"
                                >
                                  {(gerandoParcelas || carregandoConfig) ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🏦'}
                                  Gerar Inter
                                </button>
                                <button
                                  onClick={() => {
                                    setModalRegistrar(parcela.parcela);
                                    setRegValor(parcela.valor.toFixed(2));
                                    setRegData(parcela.data || '');
                                    setRegForma('PIX'); setRegBanco(''); setRegObs('');
                                    setRegJaPago(false); setRegDataPago(''); setRegValorPago('');
                                  }}
                                  className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:brightness-110 transition-all"
                                >
                                  + Registrar
                                </button>
                              </>
                            )}
                            {boleto && (boleto.situacao === 'EMABERTO' || boleto.situacao === 'VENCIDO') && (
                              <>
                                {boleto.codigo_solicitacao && (
                                  <>
                                    <a
                                      href={`http://localhost:8000/api/v1/boletos/${boleto.codigo_solicitacao}/pdf`}
                                      target="_blank" rel="noopener noreferrer"
                                      className="px-3 py-1.5 text-xs font-bold bg-slate-700 text-white rounded-lg hover:brightness-110 transition-all"
                                      title="Visualizar PDF"
                                    >
                                      📄 PDF
                                    </a>
                                    <a
                                      href={`http://localhost:8000/api/v1/boletos/${boleto.codigo_solicitacao}/pdf`}
                                      download={`boleto_${boleto.codigo_solicitacao}.pdf`}
                                      className="px-3 py-1.5 text-xs font-bold bg-slate-600 text-white rounded-lg hover:brightness-110 transition-all"
                                      title="Baixar PDF"
                                    >
                                      ⬇️
                                    </a>
                                  </>
                                )}
                                <button
                                  onClick={() => {
                                    setModalPago(boleto);
                                    setPagoForma('PIX'); setPagoData(''); setPagoValor(boleto.valor_nominal.toFixed(2)); setPagoObs('');
                                  }}
                                  className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:brightness-110 transition-all"
                                >
                                  ✅ Marcar Pago
                                </button>
                                {boleto.codigo_solicitacao && (
                                  <button
                                    onClick={() => handleCancelarBoleto(boleto)}
                                    disabled={cancelandoBoletoId === boleto.id}
                                    className="px-3 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                                  >
                                    {cancelandoBoletoId === boleto.id ? '...' : '🚫 Cancelar Inter'}
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeletarBoleto(boleto.id)}
                                  disabled={deletandoBoletoId === boleto.id}
                                  title="Remover boleto"
                                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                                >
                                  {deletandoBoletoId === boleto.id
                                    ? <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                </button>
                              </>
                            )}
                            {boleto && (boleto.situacao === 'CANCELADO' || boleto.situacao === 'EXPIRADO') && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleGerarParcelasFaltantes(parcela.parcela)}
                                  disabled={gerandoParcelas || carregandoConfig}
                                  className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-1"
                                >
                                  {(gerandoParcelas || carregandoConfig) ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🏦'}
                                  Gerar Inter
                                </button>
                                <button
                                  onClick={() => {
                                    setModalRegistrar(parcela.parcela);
                                    setRegValor(parcela.valor.toFixed(2));
                                    setRegData(parcela.data || '');
                                    setRegForma('PIX'); setRegBanco(''); setRegObs('');
                                    setRegJaPago(false); setRegDataPago(''); setRegValorPago('');
                                  }}
                                  className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:brightness-110 transition-all"
                                >
                                  + Registrar Novo
                                </button>
                                <button
                                  onClick={() => handleDeletarBoleto(boleto.id)}
                                  disabled={deletandoBoletoId === boleto.id}
                                  title="Remover boleto cancelado/expirado"
                                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all disabled:opacity-50"
                                >
                                  {deletandoBoletoId === boleto.id
                                    ? <div className="w-3.5 h-3.5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                                    : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {boleto && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 ml-11">
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Valor</p>
                              <p className="font-black text-slate-900 dark:text-white text-sm">{fmt(boleto.valor_nominal)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Vencimento</p>
                              <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{pd(boleto.data_vencimento)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Forma</p>
                              <p className="font-semibold text-slate-700 dark:text-slate-300 text-sm">{FORMA_LABEL[boleto.forma_pagamento] || boleto.forma_pagamento}</p>
                            </div>
                            {boleto.data_pagamento && (
                              <div>
                                <p className="text-xs text-green-600 dark:text-green-400 uppercase font-bold mb-0.5">Pago em</p>
                                <p className="font-bold text-green-700 dark:text-green-400 text-sm">{pd(boleto.data_pagamento)}</p>
                              </div>
                            )}
                            {boleto.valor_total_recebido != null && (
                              <div>
                                <p className="text-xs text-green-600 dark:text-green-400 uppercase font-bold mb-0.5">Recebido</p>
                                <p className="font-bold text-green-700 dark:text-green-400 text-sm">{fmt(boleto.valor_total_recebido)}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {!boleto && (
                          <div className="ml-11 text-xs text-slate-400 dark:text-slate-500 italic">
                            Nenhuma cobrança registrada para esta parcela
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Condomínio */}
            {condominio && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><span>🏢</span> Condomínio</h3>
                </div>
                <div className="p-4">
                  <Link href={`/condominios/${condominio.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white text-sm font-black shrink-0">
                      {condominio.nome.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors truncate">{condominio.nome}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{condominio.cnpj || 'Sem CNPJ'}</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </Link>
                </div>
              </div>
            )}

            {/* Status geral */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><span>📊</span> Status Financeiro</h3>
              </div>
              <div className="p-4 space-y-2">
                {!notaFiscal && (
                  <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400">
                    Sem nota fiscal vinculada
                  </div>
                )}
                {notaFiscal && boletos.length === 0 && (
                  <div className="px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-500/10 text-xs font-bold text-orange-600 dark:text-orange-400">
                    Nota sem boleto emitido
                  </div>
                )}
                {boletos.length > 0 && (
                  <div className={`px-3 py-2 rounded-lg text-xs font-bold ${
                    totalPago === boletos.length
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                      : totalPago > 0
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                        : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                  }`}>
                    {totalPago === boletos.length ? '✅ Totalmente pago' : totalPago > 0 ? `⏳ ${totalPago}/${boletos.length} parcelas pagas` : '⏳ Aguardando pagamento'}
                  </div>
                )}
              </div>
            </div>

            {/* Metadados */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><span>ℹ️</span> Metadados</h3>
              </div>
              <div className="p-5 space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">ID</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">#{servico.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Criado</span>
                  <span className="font-bold text-slate-900 dark:text-white">{new Date(servico.criado_em).toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Atualizado</span>
                  <span className="font-bold text-slate-900 dark:text-white">{new Date(servico.atualizado_em).toLocaleDateString('pt-BR')}</span>
                </div>
                {servico.nota_fiscal_id && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Nota ID</span>
                    <span className="font-mono font-bold text-orange-600 dark:text-orange-400">#{servico.nota_fiscal_id}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Exclusão */}
      {modalExcluir && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full mb-4"><span className="text-3xl">⚠️</span></div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Confirmar Exclusão</h2>
              <p className="text-slate-600 dark:text-slate-400">O serviço será arquivado no histórico de exclusões.</p>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Motivo (opcional)</label>
              <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
                placeholder="Ex: Serviço registrado incorretamente..."
                className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-red-500 outline-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setModalExcluir(false)} className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:brightness-105 transition-all">Cancelar</button>
              <button onClick={handleExcluir} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:brightness-110 transition-all">Excluir Serviço</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Cobrança */}
      {modalRegistrar !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">Registrar Cobrança</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Parcela {modalRegistrar}/{notaFiscal?.parcelas}</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Valor (R$)</label>
                  <input type="number" step="0.01" value={regValor} onChange={e => setRegValor(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Vencimento</label>
                  <input type="date" value={regData} onChange={e => setRegData(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Forma de Pagamento</label>
                <select value={regForma} onChange={e => setRegForma(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
                  {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{FORMA_LABEL[f] || f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Banco / Referência (opcional)</label>
                <input type="text" value={regBanco} onChange={e => setRegBanco(e.target.value)} placeholder="Ex: Inter, Itaú..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Observação (opcional)</label>
                <input type="text" value={regObs} onChange={e => setRegObs(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <input type="checkbox" id="reg-ja-pago" checked={regJaPago} onChange={e => setRegJaPago(e.target.checked)}
                  className="w-4 h-4 rounded accent-green-600" />
                <label htmlFor="reg-ja-pago" className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer">Já está pago</label>
              </div>
              {regJaPago && (
                <div className="grid grid-cols-2 gap-4 pl-7">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Data Pagamento</label>
                    <input type="date" value={regDataPago} onChange={e => setRegDataPago(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Valor Recebido</label>
                    <input type="number" step="0.01" value={regValorPago} onChange={e => setRegValorPago(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-sm" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalRegistrar(null)} className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:brightness-105 transition-all">
                Cancelar
              </button>
              <button onClick={handleRegistrarCobranca} disabled={regSaving || !regValor || !regData}
                className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {regSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</> : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerar Boleto Inter — 2 Etapas */}
      {modalInter && notaFiscal && configImpostos && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="sticky top-0 bg-white dark:bg-slate-900 px-6 pt-5 pb-4 border-b border-slate-200 dark:border-slate-800 z-10 rounded-t-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-black px-2 py-0.5 rounded-full ${interEtapa === 1 ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'}`}>
                      Etapa {interEtapa} de 2
                    </span>
                    {interAprovado && <span className="text-xs font-bold text-green-600 dark:text-green-400">✅ Aprovado</span>}
                  </div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-white">
                    {interEtapa === 1 ? 'Configuração dos Boletos' : 'Gerar Boletos'}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    {notaFiscal.numero_nota} · {fmt(configImpostos.valor_bruto)} · {notaFiscal.parcelas} parcela(s)
                  </p>
                </div>
                <button onClick={() => setModalInter(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* ═══ ETAPA 1 ═══ */}
              {interEtapa === 1 && (
                <>
                  {/* Seção: Nota */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase">Nota Fiscal</p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">Valor Total da Nota</span>
                      <span className="font-black text-slate-900 dark:text-white text-xl">{fmt(configImpostos.valor_bruto)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Número da Nota</label>
                        <input type="text" value={interNumeroNota} onChange={e => setInterNumeroNota(e.target.value)}
                          className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-900 dark:text-white" />
                      </div>
                      {configImpostos.numero_os && (
                        <div>
                          <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Número OS</label>
                          <p className="px-3 py-2 text-sm rounded-lg bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300">{configImpostos.numero_os}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Seção: Impostos */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase">Impostos Retidos</p>
                      <div className="flex gap-3">
                        <button onClick={() => { setInterAplicarPis(true); setInterAplicarCofins(true); setInterAplicarInss(true); setInterAplicarCsll(true); }}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">✓ Todos</button>
                        <button onClick={() => { setInterAplicarPis(false); setInterAplicarCofins(false); setInterAplicarInss(false); setInterAplicarCsll(false); }}
                          className="text-xs font-bold text-slate-500 hover:underline">✗ Nenhum</button>
                      </div>
                    </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center text-slate-500 dark:text-slate-400">
                    <span>Valor Bruto</span>
                    <span className="font-bold text-slate-900 dark:text-white">{fmt(configImpostos.valor_bruto)}</span>
                  </div>
                  {([
                        ['PIS',    interAplicarPis,    setInterAplicarPis,    interPctPis,    setInterPctPis],
                        ['COFINS', interAplicarCofins, setInterAplicarCofins, interPctCofins, setInterPctCofins],
                        ['INSS',   interAplicarInss,   setInterAplicarInss,   interPctInss,   setInterPctInss],
                        ['CSLL',   interAplicarCsll,   setInterAplicarCsll,   interPctCsll,   setInterPctCsll],
                      ] as [string, boolean, (v: boolean) => void, string, (v: string) => void][]).map(([label, aplicar, setAplicar, pct, setPct]) => (
                        <div key={label} className="flex items-center gap-2">
                          <input type="checkbox" checked={aplicar} onChange={e => setAplicar(e.target.checked)} className="w-4 h-4 rounded accent-red-500" />
                          <span className={`w-16 font-bold text-xs ${aplicar ? 'text-red-600 dark:text-red-400' : 'text-slate-400 line-through'}`}>{label}</span>
                          <div className="flex items-center gap-1 flex-1">
                            <input type="number" step="0.01" min="0" max="100" value={pct} disabled={!aplicar}
                              onChange={e => setPct(e.target.value)}
                              className="w-20 px-2 py-1 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-green-500 outline-none text-right disabled:opacity-40" />
                            <span className="text-xs text-slate-400">%</span>
                          </div>
                          <span className={`text-xs w-24 text-right ${aplicar ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
                            {aplicar ? `- ${fmt(configImpostos.valor_bruto * parseFloat(pct || '0') / 100)}` : '—'}
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-1 space-y-1.5">
                        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                          <span>Total Impostos</span>
                          <span className="font-bold text-red-600 dark:text-red-400">- {fmt(totalImpostosModal())}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-black text-green-700 dark:text-green-400 text-base">Valor Líquido Total</span>
                          <span className="font-black text-green-700 dark:text-green-400 text-base">{fmt(calcularValorLiquidoModal())}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Seção: Parcelas */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase mb-3">Valores das Parcelas</p>
                    <div className="space-y-2">
                      {interParcelasItens.map(item => {
                        const isFaltante = item.situacaoBoleto === null || item.situacaoBoleto === 'CANCELADO' || item.situacaoBoleto === 'EXPIRADO';
                        const isPago = item.situacaoBoleto === 'PAGO' || item.situacaoBoleto === 'BAIXADO';
                        const isLocked = !isFaltante;
                        return (
                          <div key={item.numero} className={`flex items-center gap-3 p-2 rounded-lg ${
                            isPago ? 'bg-green-50 dark:bg-green-500/10' :
                            isLocked ? 'bg-blue-50 dark:bg-blue-500/10' :
                            interParcelaFoco === item.numero ? 'bg-yellow-50 dark:bg-yellow-500/10 ring-1 ring-yellow-400' :
                            'bg-white dark:bg-slate-950'
                          }`}>
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${
                              isPago ? 'bg-green-500' : isLocked ? 'bg-blue-500' : 'bg-slate-400 dark:bg-slate-600'
                            }`}>{item.numero}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-slate-500 dark:text-slate-400">Parcela {item.numero}/{notaFiscal.parcelas}</span>
                                {item.situacaoBoleto && (
                                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${SITUACAO_CONFIG[item.situacaoBoleto]?.cls}`}>
                                    {SITUACAO_CONFIG[item.situacaoBoleto]?.label}
                                  </span>
                                )}
                                {!item.situacaoBoleto && <span className="text-xs text-slate-400 italic">A gerar</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number" step="0.01" min="0.01"
                                value={item.valor}
                                disabled={isLocked}
                                onChange={e => setInterParcelasItens(prev => prev.map(p => p.numero === item.numero ? { ...p, valor: e.target.value } : p))}
                                className={`w-28 px-2 py-1.5 text-sm font-black rounded-lg border text-right outline-none ${
                                  isLocked
                                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                                    : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-green-500 text-slate-900 dark:text-white'
                                }`}
                              />
                              <input
                                type="date"
                                value={item.dataVencimento}
                                disabled={isLocked}
                                onChange={e => setInterParcelasItens(prev => prev.map(p => p.numero === item.numero ? { ...p, dataVencimento: e.target.value } : p))}
                                className={`px-2 py-1.5 text-xs rounded-lg border outline-none ${
                                  isLocked
                                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                                    : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-green-500 text-slate-900 dark:text-white'
                                }`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">* Parcelas com boleto emitido têm valor bloqueado</p>
                  </div>

                  {/* Seção: Validação */}
                  {(() => {
                    const liquido = calcularValorLiquidoModal();
                    const soma = somaParcelasModal();
                    const diff = soma - liquido;
                    const ok = Math.abs(diff) < 0.005;
                    return (
                      <div className={`rounded-xl p-4 border-2 ${ok ? 'bg-green-50 dark:bg-green-500/10 border-green-300 dark:border-green-700' : 'bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-700'}`}>
                        <p className="text-xs font-black uppercase mb-3 text-slate-500 dark:text-slate-400">Validação</p>
                        <div className="space-y-1.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Valor Total da Nota</span>
                            <span className="font-bold text-slate-900 dark:text-white">{fmt(configImpostos.valor_bruto)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">(-) Total Impostos</span>
                            <span className="font-bold text-red-600 dark:text-red-400">- {fmt(totalImpostosModal())}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">Valor Líquido Esperado</span>
                            <span className="font-bold text-slate-900 dark:text-white">{fmt(liquido)}</span>
                          </div>
                          <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5">
                            <div className="flex justify-between">
                              <span className="text-slate-600 dark:text-slate-400">Soma das Parcelas</span>
                              <span className="font-bold text-slate-900 dark:text-white">{fmt(soma)}</span>
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className={`font-black text-base ${ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                {ok ? '✅ Diferença' : '❌ Diferença'}
                              </span>
                              <span className={`font-black text-base ${ok ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                        {!ok && (
                          <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-semibold">
                            Ajuste os valores das parcelas para que a soma seja exatamente {fmt(liquido)}.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {/* Seção: Descrição */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <button onClick={() => setInterDescricaoExpanded(p => !p)} className="flex items-center justify-between w-full">
                      <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase flex items-center gap-2">
                        <span>📄</span> Descrição / Mensagem
                      </p>
                      <span className="text-slate-400 text-sm">{interDescricaoExpanded ? '▲' : '▼'}</span>
                    </button>
                    {!interDescricaoExpanded && interMensagem && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{interMensagem}</p>
                    )}
                    {interDescricaoExpanded && (
                      <textarea value={interMensagem} onChange={e => setInterMensagem(e.target.value)} rows={4} maxLength={500}
                        className="mt-3 w-full px-3 py-2 text-sm rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-slate-900 dark:text-white resize-y" />
                    )}
                  </div>
                </>
              )}

              {/* ═══ ETAPA 2 ═══ */}
              {interEtapa === 2 && (
                <>
                  {/* Resumo aprovado */}
                  <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-800 rounded-xl p-4">
                    <p className="text-xs font-black text-green-700 dark:text-green-400 uppercase mb-2">✅ Configuração Aprovada — Valores Bloqueados</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 text-xs">Nota</span>
                        <p className="font-bold text-slate-900 dark:text-white">{interNumeroNota || notaFiscal.numero_nota}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 text-xs">Total</span>
                        <p className="font-bold text-slate-900 dark:text-white">{fmt(configImpostos.valor_bruto)}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 text-xs">Impostos</span>
                        <p className="font-bold text-red-600 dark:text-red-400">
                          {[
                            interAplicarPis    && `PIS ${interPctPis}%`,
                            interAplicarCofins && `COFINS ${interPctCofins}%`,
                            interAplicarInss   && `INSS ${interPctInss}%`,
                            interAplicarCsll   && `CSLL ${interPctCsll}%`,
                          ].filter(Boolean).join(' + ') || 'Nenhum'}
                        </p>
                      </div>
                      <div>
                        <span className="text-slate-500 dark:text-slate-400 text-xs">Valor Líquido</span>
                        <p className="font-black text-green-700 dark:text-green-400">{fmt(calcularValorLiquidoModal())}</p>
                      </div>
                    </div>
                  </div>

                  {/* Parcelas para geração */}
                  <div className="space-y-3">
                    <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase">Parcelas</p>
                    {interParcelasItens.map(item => {
                      const isFaltante = item.situacaoBoleto === null || item.situacaoBoleto === 'CANCELADO' || item.situacaoBoleto === 'EXPIRADO';
                      const isPago = item.situacaoBoleto === 'PAGO' || item.situacaoBoleto === 'BAIXADO';
                      const isGerandoThis = gerandoParcelaNum === item.numero;
                      const isGerandoOutro = gerandoParcelaNum !== null && gerandoParcelaNum !== item.numero;
                      // Build payload preview
                      const basePrev = addDays(item.dataVencimento, -30 * (item.numero - 1));
                      const seuNumBase = (interNumeroNota || notaFiscal.numero_nota || String(notaFiscal.id));
                      const sufixo = `-${item.numero}/${notaFiscal.parcelas}`;
                      const seuNum = (seuNumBase.slice(0, 15 - sufixo.length) + sufixo).slice(0, 15);
                      const payloadPreview = {
                        seuNumero: seuNum,
                        valorNominal: parseFloat(item.valor),
                        dataVencimento: item.dataVencimento,
                        mensagem: interMensagem.trim() ? { linha1: interMensagem.trim().slice(0, 60), ...(interMensagem.trim().length > 60 ? { linha2: interMensagem.trim().slice(60, 120) } : {}) } : undefined,
                        _base_date_override: basePrev,
                      };
                      return (
                        <div key={item.numero} className={`rounded-xl border overflow-hidden ${
                          isPago ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-500/5' :
                          item.situacaoBoleto === 'EMABERTO' || item.situacaoBoleto === 'VENCIDO' ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-500/5' :
                          'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                        }`}>
                          <div className="flex items-center gap-3 p-4">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white flex-shrink-0 ${
                              isPago ? 'bg-green-500' : item.situacaoBoleto === 'EMABERTO' ? 'bg-blue-500' : item.situacaoBoleto === 'VENCIDO' ? 'bg-orange-500' : 'bg-slate-400'
                            }`}>{item.numero}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-slate-900 dark:text-white text-sm">Parcela {item.numero}/{notaFiscal.parcelas}</span>
                                {item.situacaoBoleto && (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SITUACAO_CONFIG[item.situacaoBoleto]?.cls}`}>
                                    {SITUACAO_CONFIG[item.situacaoBoleto]?.label}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-black text-green-700 dark:text-green-400 mt-0.5">{fmt(parseFloat(item.valor) || 0)}</p>
                            </div>
                            {/* Date editable in step 2 */}
                            {isFaltante && (
                              <input
                                type="date"
                                value={item.dataVencimento}
                                onChange={e => setInterParcelasItens(prev => prev.map(p => p.numero === item.numero ? { ...p, dataVencimento: e.target.value } : p))}
                                className="px-2 py-1.5 text-xs rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-green-500 outline-none text-slate-900 dark:text-white"
                              />
                            )}
                            {!isFaltante && !isPago && (
                              <span className="text-xs text-slate-500 dark:text-slate-400">{pd(item.dataVencimento)}</span>
                            )}
                          </div>
                          {/* Actions & Preview */}
                          {(isFaltante || isPago) && (
                            <div className="px-4 pb-3 flex items-center justify-between gap-2 flex-wrap">
                              <button
                                onClick={() => setInterPayloadExpanded(interPayloadExpanded === item.numero ? null : item.numero)}
                                className="text-xs text-slate-500 dark:text-slate-400 hover:underline flex items-center gap-1"
                              >
                                👁 {interPayloadExpanded === item.numero ? 'Ocultar' : 'Preview payload'}
                              </button>
                              {isFaltante && (
                                <button
                                  onClick={() => handleGerarParcelaSingle(item)}
                                  disabled={isGerandoThis || isGerandoOutro || gerandoParcelas}
                                  className="px-3 py-1.5 text-xs font-bold bg-green-600 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center gap-1"
                                >
                                  {isGerandoThis ? <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Gerando...</> : '🏦 Gerar Inter'}
                                </button>
                              )}
                              {isPago && <span className="text-xs text-slate-400 italic">Pago — não pode ser regerar</span>}
                            </div>
                          )}
                          {interPayloadExpanded === item.numero && (
                            <div className="px-4 pb-4">
                              <div className="bg-slate-900 dark:bg-slate-950 rounded-lg p-3 text-xs font-mono text-green-400 overflow-x-auto whitespace-pre">
                                {JSON.stringify(payloadPreview, null, 2)}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Descrição editável na etapa 2 */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                    <button onClick={() => setInterDescricaoExpanded(p => !p)} className="flex items-center justify-between w-full">
                      <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase flex items-center gap-2">
                        <span>📄</span> Descrição / Mensagem do Boleto
                      </p>
                      <span className="text-slate-400 text-sm">{interDescricaoExpanded ? '▲' : '▼'}</span>
                    </button>
                    {!interDescricaoExpanded && interMensagem && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{interMensagem}</p>
                    )}
                    {interDescricaoExpanded && (
                      <textarea value={interMensagem} onChange={e => setInterMensagem(e.target.value)} rows={4} maxLength={500}
                        className="mt-3 w-full px-3 py-2 text-sm rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-slate-900 dark:text-white resize-y" />
                    )}
                  </div>
                </>
              )}

            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white dark:bg-slate-900 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex gap-3 rounded-b-2xl">
              {interEtapa === 1 && (
                <>
                  <button onClick={() => setModalInter(false)}
                    className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all">
                    Cancelar
                  </button>
                  <button
                    onClick={handleAprovarBoletos}
                    disabled={Math.abs(somaParcelasModal() - calcularValorLiquidoModal()) >= 0.005}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    ✅ Aprovar Boletos →
                  </button>
                </>
              )}
              {interEtapa === 2 && (
                <>
                  <button onClick={() => { setInterEtapa(1); setInterAprovado(false); }}
                    disabled={gerandoParcelas || gerandoParcelaNum !== null}
                    className="py-3 px-4 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all disabled:opacity-50 text-sm whitespace-nowrap">
                    🔄 Reabrir Config
                  </button>
                  <button
                    onClick={handleGerarTodos}
                    disabled={gerandoParcelas || gerandoParcelaNum !== null || interParcelasItens.filter(p => p.situacaoBoleto === null || p.situacaoBoleto === 'CANCELADO' || p.situacaoBoleto === 'EXPIRADO').length === 0}
                    className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {gerandoParcelas && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    🏦 Gerar Todos ({interParcelasItens.filter(p => p.situacaoBoleto === null || p.situacaoBoleto === 'CANCELADO' || p.situacaoBoleto === 'EXPIRADO').length} faltantes)
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Modal Marcar Pago */}
      {modalPago && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full p-8">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">Marcar como Pago</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Parcela {modalPago.numero_parcela}/{modalPago.total_parcelas} · {fmt(modalPago.valor_nominal)}</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Data Pagamento</label>
                  <input type="date" value={pagoData} onChange={e => setPagoData(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Valor Recebido</label>
                  <input type="number" step="0.01" value={pagoValor} onChange={e => setPagoValor(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Forma de Pagamento</label>
                <select value={pagoForma} onChange={e => setPagoForma(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-sm">
                  {FORMAS_PAGAMENTO.map(f => <option key={f} value={f}>{FORMA_LABEL[f] || f}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase mb-1.5">Observação (opcional)</label>
                <input type="text" value={pagoObs} onChange={e => setPagoObs(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-green-500 outline-none text-sm" />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalPago(null)} className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:brightness-105 transition-all">
                Cancelar
              </button>
              <button onClick={handleMarcarPago} disabled={pagoSaving || !pagoData || !pagoValor}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {pagoSaving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Salvando...</> : '✅ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
