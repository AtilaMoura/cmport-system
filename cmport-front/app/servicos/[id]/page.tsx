"use client"

import { useState, useEffect, useRef } from 'react';
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
  orcamento_id: number | null;
  criado_em: string;
  atualizado_em: string;
  email_enviado_em: string | null;
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
  parcelas_json: Array<{ parcela: number; valor: number; data: string | null }> | null;
  nota_vinculada_id: number | null;
  nota_vinculada_numero: string | null;
  valor_nota_vinculada: number | null;
}

interface Condominio {
  id: number;
  nome: string;
  cnpj: string;
}

interface ContatoEmail {
  id: number;
  nome: string;
  email: string;
  receber_boleto: boolean;
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
  nota_vinculada_id: number | null;
  imposto_config_vinculo: { aplicar_imposto_em: string; nota_a_id: number; nota_b_id: number } | null;
  pdf_object_key: string | null;
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

interface OrdemServico {
  id: number;
  task_id: number;
  task_url: string;
  customer_description: string | null;
  task_date: string | null;
  task_type_description: string | null;
  user_to_name: string | null;
  orientation: string | null;
  report: string | null;
  finished: boolean;
  task_status: number | null;
  task_status_descricao: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  duration: string | null;
  address: string | null;
  signature_url: string | null;
}

interface TermoGarantia {
  id: number;
  servico_id: number;
  produto_descricao: string;
  prazo_meses: number;
  data_inicio: string;
  data_fim: string;
  orcamento_id: number | null;
  criado_em: string;
}

interface OrcamentoCandidato {
  id: number;
  auvo_public_id: number;
  customer_name: string | null;
  request_date: string | null;
  net_total_value: number;
  current_stage_description: string | null;
}

interface OrcamentoItemDetalhe {
  id: number;
  tipo: string;
  nome: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

interface OrcamentoDetalhe {
  id: number;
  auvo_public_id: number;
  customer_name: string | null;
  request_date: string | null;
  net_total_value: number;
  current_stage_description: string | null;
  is_cancelled: boolean;
  itens: OrcamentoItemDetalhe[];
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
  const [baixandoPdf, setBaixandoPdf] = useState<string | null>(null);

  // Modal envio de email
  const [modalEmail, setModalEmail] = useState<Boleto | null>(null);
  const [emailContatos, setEmailContatos] = useState<Array<{id: number; nome: string; email: string; receber_boleto: boolean; selecionado: boolean}>>([]);
  const [emailAvulso, setEmailAvulso] = useState('');
  const [emailsAvulsos, setEmailsAvulsos] = useState<string[]>([]);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState<string | null>(null);
  // Checkbox "enviar email automaticamente ao gerar boleto"
  const [autoEnviarEmail, setAutoEnviarEmail] = useState(false);
  // Composer (Ver email)
  const [composerAberto, setComposerAberto] = useState(false);
  const [composerAssunto, setComposerAssunto] = useState('');
  const [composerCorpoHtml, setComposerCorpoHtml] = useState('');
  const [composerSaudacao, setComposerSaudacao] = useState('Prezados(as),');
  const [composerCorpo, setComposerCorpo] = useState('');
  const [composerRodape, setComposerRodape] = useState('O boleto em PDF e o XML da nota fiscal estão anexados a este email.\nPor gentileza, confirmar o recebimento deste e-mail.');
  const [composerAba, setComposerAba] = useState<'preview' | 'editar'>('preview');
  const [composerAnexos, setComposerAnexos] = useState<File[]>([]);
  const [composerManutencao, setComposerManutencao] = useState<any>(null);
  const [composerEnviando, setComposerEnviando] = useState(false);
  const [composerCarregando, setComposerCarregando] = useState(false);
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

  // Vínculo entre notas
  const [desvinculando, setDesvinculando] = useState(false);
  const [notaVinculada, setNotaVinculada] = useState<NotaFiscal | null>(null);
  const [vinculoAplicarImpostoEm, setVinculoAplicarImpostoEm] = useState<'nota_a' | 'nota_b' | 'ambas' | 'nenhuma'>('nota_a');

  // Ordem de Serviço vinculada
  const [ordemServico, setOrdemServico] = useState<OrdemServico | null>(null);
  const [pdfLoadingOs, setPdfLoadingOs] = useState(false);
  const [modalVincularOs, setModalVincularOs] = useState(false);
  const [ordensDisponiveis, setOrdensDisponiveis] = useState<OrdemServico[]>([]);
  const [carregandoOsDisponiveis, setCarregandoOsDisponiveis] = useState(false);
  const [vinculandoOs, setVinculandoOs] = useState(false);

  // Modal "Marcar Pago"
  const [modalPago, setModalPago] = useState<Boleto | null>(null);
  const [pagoForma, setPagoForma] = useState('PIX');
  const [pagoData, setPagoData] = useState('');
  const [pagoValor, setPagoValor] = useState('');
  const [pagoObs, setPagoObs] = useState('');
  const [pagoSaving, setPagoSaving] = useState(false);

  // Orçamento vinculado ao serviço
  const [orcamentoDoServico, setOrcamentoDoServico] = useState<OrcamentoDetalhe | null>(null);
  // Modal vincular orçamento
  const [modalVincularOrc, setModalVincularOrc] = useState(false);
  const [orcamentosCondominio, setOrcamentosCondominio] = useState<OrcamentoCandidato[]>([]);
  const [carregandoOrcsCondominio, setCarregandoOrcsCondominio] = useState(false);
  const [vinculandoOrc, setVinculandoOrc] = useState(false);

  // Termo de Garantia
  const [termoGarantia, setTermoGarantia] = useState<TermoGarantia | null>(null);
  const [modalTermo, setModalTermo] = useState(false);
  const [termoEtapa, setTermoEtapa] = useState<1 | 2 | 3 | 4>(1);
  const [termoProduto, setTermoProduto] = useState('');
  const [termoPrazo, setTermoPrazo] = useState(12);
  const [termoDataInicio, setTermoDataInicio] = useState('');
  const [termoSalvando, setTermoSalvando] = useState(false);
  const [termoBaixandoPdf, setTermoBaixandoPdf] = useState(false);
  const [modalPreviewTermo, setModalPreviewTermo] = useState(false);
  const [previewTermoHtml, setPreviewTermoHtml] = useState<string | null>(null);
  const [carregandoPreviewTermo, setCarregandoPreviewTermo] = useState(false);
  const [termoOrcamentoId, setTermoOrcamentoId] = useState<number | null>(null);
  const [orcamentosCandidatos, setOrcamentosCandidatos] = useState<OrcamentoCandidato[]>([]);
  const [termoCarregandoCandidatos, setTermoCarregandoCandidatos] = useState(false);
  // Checklist de produtos do orçamento (Etapa 2)
  interface ProdutoChecklist { nome: string; quantidade: number }
  const [produtosChecklist, setProdutosChecklist] = useState<ProdutoChecklist[]>([]);
  const [termoCarregandoItens, setTermoCarregandoItens] = useState(false);
  const [novoItemNome, setNovoItemNome] = useState('');
  const [novoItemQtd, setNovoItemQtd] = useState(1);
  const [adicionandoItem, setAdicionandoItem] = useState(false);
  const [produtoSugestoes, setProdutoSugestoes] = useState<string[]>([]);
  const [mostraSugestoes, setMostraSugestoes] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

      if (s.numero_os) {
        try {
          const { data: osData } = await api.get(`/ordens-servico/${s.numero_os}`);
          setOrdemServico(osData);
        } catch {
          setOrdemServico(null);
        }
      } else {
        setOrdemServico(null);
      }

      if (s.nota_fiscal_id) {
        const [notaRes, boletosRes] = await Promise.all([
          api.get(`/notas-fiscais/${s.nota_fiscal_id}`),
          api.get(`/boletos/nota/${s.nota_fiscal_id}`),
        ]);
        const nota: NotaFiscal = notaRes.data;
        setNotaFiscal(nota);
        setBoletos(boletosRes.data || []);
        if (nota.nota_vinculada_id) {
          try {
            const { data: vinc } = await api.get(`/notas-fiscais/${nota.nota_vinculada_id}`);
            setNotaVinculada(vinc);
          } catch {
            setNotaVinculada(null);
          }
        } else {
          setNotaVinculada(null);
        }
      } else {
        setNotaFiscal(null);
        setBoletos([]);
        setNotaVinculada(null);
      }

      // Carregar Orçamento vinculado: tenta task_id direto, fallback para mais recente candidato
      try {
        const { data: orc } = await api.get(`/orcamentos/por-servico/${id}`);
        if (orc) {
          setOrcamentoDoServico(orc);
        } else {
          const { data: cands } = await api.get(`/orcamentos/candidatos/${id}`);
          if (cands && cands.length > 0) {
            const { data: orcFull } = await api.get(`/orcamentos/${cands[0].auvo_public_id}`);
            setOrcamentoDoServico(orcFull);
          } else {
            setOrcamentoDoServico(null);
          }
        }
      } catch {
        setOrcamentoDoServico(null);
      }

      // Carregar Termo de Garantia
      try {
        const { data: t } = await api.get(`/termos-garantia/servico/${id}`);
        setTermoGarantia(t);
      } catch {
        setTermoGarantia(null);
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

  const baixarPdfOs = async () => {
    if (!ordemServico) return;
    setPdfLoadingOs(true);
    try {
      const response = await api.get(`/ordens-servico/${ordemServico.task_id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `os_${ordemServico.task_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('PDF não disponível para esta OS.');
    } finally {
      setPdfLoadingOs(false);
    }
  };

  const abrirModalVincularOs = async () => {
    if (!condominio) return;
    setModalVincularOs(true);
    setCarregandoOsDisponiveis(true);
    try {
      const { data } = await api.get(`/ordens-servico/disponiveis/${condominio.id}`);
      setOrdensDisponiveis(data);
    } catch {
      alert("Erro ao buscar ordens de serviço disponíveis.");
    } finally {
      setCarregandoOsDisponiveis(false);
    }
  };

  const handleVincularOsManual = async (ordemServicoId: number) => {
    if (!id) return;
    setVinculandoOs(true);
    try {
      await api.put(`/servicos/${id}/vincular-os/${ordemServicoId}`);
      setModalVincularOs(false);
      await carregarDados();
    } catch {
      alert("Erro ao vincular ordem de serviço.");
    } finally {
      setVinculandoOs(false);
    }
  };

  const handleDesvincularOsManual = async () => {
    if (!id) return;
    if (!confirm("Deseja desvincular esta Ordem de Serviço deste serviço?")) return;
    setVinculandoOs(true);
    try {
      await api.put(`/servicos/${id}/desvincular-os`);
      await carregarDados();
    } catch {
      alert("Erro ao desvincular ordem de serviço.");
    } finally {
      setVinculandoOs(false);
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

  const temVinculo = !!notaFiscal?.nota_vinculada_id;
  const temBoletoAtivo = boletos.some(b => b.situacao === 'EMABERTO' || b.situacao === 'VENCIDO');

  const gradColor = servico.tipo === 'manutencao' ? 'from-purple-500 to-purple-600' : 'from-blue-500 to-blue-600';
  const icon = servico.tipo === 'manutencao' ? '🛠️' : '🔧';
  const nome = servico.tipo === 'manutencao' ? 'Manutenção Preventiva' : 'Assistência Técnica';

  // Boletos cancelados/expirados não contam para cálculos financeiros nem para inconsistências
  const boletosAtivos = boletos.filter(b => b.situacao !== 'CANCELADO' && b.situacao !== 'EXPIRADO');

  const totalPago = boletos.filter(b => b.situacao === 'PAGO' || b.situacao === 'BAIXADO').length;
  const valorBruto = boletosAtivos.reduce((s, b) => s + b.valor_nominal, 0);
  const valorRecebido = boletos.reduce((s, b) => s + (b.valor_total_recebido || 0), 0);

  // Detecção de inconsistências (ignora boletos cancelados/expirados)
  const totalEsperado = notaFiscal?.parcelas ?? 0;
  const tolerancia = notaFiscal ? notaFiscal.valor * 0.40 : 0;
  const valorEsperadoParcela = notaFiscal && totalEsperado > 0 ? notaFiscal.valor / totalEsperado : 0;
  const boletosExcedentes = totalEsperado > 0 && boletosAtivos.length > totalEsperado;
  const boletosValorErrado = notaFiscal
    ? boletosAtivos.filter(b => Math.abs(b.valor_nominal - valorEsperadoParcela) > tolerancia)
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
    if (configImpostos.nota_vinculada_id) {
      const valorB = configImpostos.valor_nota_vinculada || 0;
      const valorA = bruto - valorB;
      const impA = Math.round(valorA * (pis/100)*100)/100 + Math.round(valorA * (cofins/100)*100)/100 + Math.round(valorA * (inss/100)*100)/100 + Math.round(valorA * (csll/100)*100)/100;
      const impB = Math.round(valorB * (pis/100)*100)/100 + Math.round(valorB * (cofins/100)*100)/100 + Math.round(valorB * (inss/100)*100)/100 + Math.round(valorB * (csll/100)*100)/100;
      if (vinculoAplicarImpostoEm === 'nota_a')  return Math.max(Math.round(((valorA - impA) + valorB) * 100) / 100, 0.01);
      if (vinculoAplicarImpostoEm === 'nota_b')  return Math.max(Math.round((valorA + (valorB - impB)) * 100) / 100, 0.01);
      if (vinculoAplicarImpostoEm === 'ambas')   return Math.max(Math.round((bruto - impA - impB) * 100) / 100, 0.01);
      return bruto; // nenhuma
    }
    const v_pis    = Math.round(bruto * (pis / 100) * 100) / 100;
    const v_cofins = Math.round(bruto * (cofins / 100) * 100) / 100;
    const v_inss   = Math.round(bruto * (inss / 100) * 100) / 100;
    const v_csll   = Math.round(bruto * (csll / 100) * 100) / 100;
    return Math.max(Math.round((bruto - (v_pis + v_cofins + v_inss + v_csll)) * 100) / 100, 0.01);
  };

  const totalImpostosModal = () => {
    if (!configImpostos) return 0;
    const bruto = configImpostos.valor_bruto;
    const pis    = interAplicarPis    ? parseFloat(interPctPis    || '0') : 0;
    const cofins = interAplicarCofins ? parseFloat(interPctCofins || '0') : 0;
    const inss   = interAplicarInss   ? parseFloat(interPctInss   || '0') : 0;
    const csll   = interAplicarCsll   ? parseFloat(interPctCsll   || '0') : 0;
    if (configImpostos.nota_vinculada_id) {
      const valorB = configImpostos.valor_nota_vinculada || 0;
      const valorA = bruto - valorB;
      const impA = Math.round(valorA*(pis/100)*100)/100 + Math.round(valorA*(cofins/100)*100)/100 + Math.round(valorA*(inss/100)*100)/100 + Math.round(valorA*(csll/100)*100)/100;
      const impB = Math.round(valorB*(pis/100)*100)/100 + Math.round(valorB*(cofins/100)*100)/100 + Math.round(valorB*(inss/100)*100)/100 + Math.round(valorB*(csll/100)*100)/100;
      if (vinculoAplicarImpostoEm === 'nota_a')  return Math.round(impA * 100) / 100;
      if (vinculoAplicarImpostoEm === 'nota_b')  return Math.round(impB * 100) / 100;
      if (vinculoAplicarImpostoEm === 'ambas')   return Math.round((impA + impB) * 100) / 100;
      return 0; // nenhuma
    }
    const v_pis    = Math.round(bruto * (pis / 100) * 100) / 100;
    const v_cofins = Math.round(bruto * (cofins / 100) * 100) / 100;
    const v_inss   = Math.round(bruto * (inss / 100) * 100) / 100;
    const v_csll   = Math.round(bruto * (csll / 100) * 100) / 100;
    return Math.round((v_pis + v_cofins + v_inss + v_csll) * 100) / 100;
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
      if (cfg.nota_vinculada_id) {
        const regra = notaFiscal.imposto_config_vinculo?.aplicar_imposto_em;
        setVinculoAplicarImpostoEm((regra as 'nota_a' | 'nota_b' | 'ambas' | 'nenhuma') || 'nota_a');
      }
      // Initialize per-parcel items
      const n = notaFiscal.parcelas || 1;
      const parcelasMap = new Map((cfg.parcelas_json ?? []).map(p => [p.parcela, p]));
      const usarParcelasJson = parcelasMap.size > 0;
      // Fallback: divisão igual pelo valor líquido
      const liquido = cfg.valor_liquido ?? notaFiscal.valor;
      const parcelaBase = Math.floor(liquido / n * 100) / 100;
      const parcelaUltima = liquido - parcelaBase * (n - 1);
      const items: ParcelaItem[] = Array.from({ length: n }, (_, i) => {
        const num = i + 1;
        const boleto = boletos.find(b => b.numero_parcela === num && b.situacao !== 'CANCELADO' && b.situacao !== 'EXPIRADO');
        const situacao = boleto ? boleto.situacao : (boletos.find(b => b.numero_parcela === num) ? boletos.find(b => b.numero_parcela === num)!.situacao : null);
        const pJson = parcelasMap.get(num);
        const val = boleto
          ? boleto.valor_nominal.toFixed(2)
          : usarParcelasJson && pJson
            ? pJson.valor.toFixed(2)
            : (num === n ? parcelaUltima.toFixed(2) : parcelaBase.toFixed(2));
        const dataJson = usarParcelasJson && pJson?.data ? pJson.data : null;
        const data = boleto ? boleto.data_vencimento : (dataJson ?? addDays(notaFiscal.data_vencimento, 30 * i));
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
        parcelas_json: null,
        nota_vinculada_id: null,
        nota_vinculada_numero: null,
        valor_nota_vinculada: null,
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
      const parcelasMapFallback = new Map((notaFiscal.parcelas_json ?? []).map(p => [p.parcela, p]));
      const usarParcelasJsonFallback = parcelasMapFallback.size > 0;
      const parcelaBase = Math.floor(fallback.valor_liquido / n * 100) / 100;
      const parcelaUltima = fallback.valor_liquido - parcelaBase * (n - 1);
      const items: ParcelaItem[] = Array.from({ length: n }, (_, i) => {
        const num = i + 1;
        const boleto = boletos.find(b => b.numero_parcela === num && b.situacao !== 'CANCELADO' && b.situacao !== 'EXPIRADO');
        const situacao = boleto ? boleto.situacao : (boletos.find(b => b.numero_parcela === num) ? boletos.find(b => b.numero_parcela === num)!.situacao : null);
        const pJson = parcelasMapFallback.get(num);
        const val = boleto
          ? boleto.valor_nominal.toFixed(2)
          : usarParcelasJsonFallback && pJson
            ? pJson.valor.toFixed(2)
            : (num === n ? parcelaUltima.toFixed(2) : parcelaBase.toFixed(2));
        const dataJson = usarParcelasJsonFallback && pJson?.data ? pJson.data : null;
        const data = boleto ? boleto.data_vencimento : (dataJson ?? addDays(notaFiscal.data_vencimento, 30 * i));
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
      if (configImpostos?.nota_vinculada_id) {
        body.imposto_config_vinculo = {
          aplicar_imposto_em: vinculoAplicarImpostoEm,
          nota_a_id: notaFiscal.id,
          nota_b_id: configImpostos.nota_vinculada_id,
        };
      }
      const res = await api.post(`/boletos/gerar-parcelas-faltantes/${notaFiscal.id}`, body);
      const resErros: { erro: string }[] = res.data?.erros ?? [];
      if (resErros.length > 0) {
        alert(`Erro ao gerar boleto parcela ${item.numero}:\n${resErros[0].erro}`);
        return;
      }
      // Auto-envio de email após geração individual
      if (autoEnviarEmail) {
        const gerados: { id: number }[] = res.data?.sucesso ?? [];
        for (const b of gerados) {
          await autoEnviarParaContatos(b.id);
        }
      }
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
        if (configImpostos?.nota_vinculada_id) {
          body.imposto_config_vinculo = {
            aplicar_imposto_em: vinculoAplicarImpostoEm,
            nota_a_id: notaFiscal.id,
            nota_b_id: configImpostos.nota_vinculada_id,
          };
        }
        const res = await api.post(`/boletos/gerar-parcelas-faltantes/${notaFiscal.id}`, body);
        const resErros: { erro: string }[] = res.data?.erros ?? [];
        if (resErros.length > 0) {
          alert(`Erro ao gerar boleto parcela ${item.numero}:\n${resErros[0].erro}`);
          break;
        }
        // Auto-envio de email após cada parcela gerada
        if (autoEnviarEmail) {
          const gerados: { id: number }[] = res.data?.sucesso ?? [];
          for (const b of gerados) {
            await autoEnviarParaContatos(b.id);
          }
        }
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

  const baixarPdf = async (codigo: string) => {
    setBaixandoPdf(codigo);
    try {
      const res = await api.get(`/boletos/${codigo}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `boleto_${codigo}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao baixar PDF do boleto.');
    } finally {
      setBaixandoPdf(null);
    }
  };

  const abrirModalTermo = async () => {
    if (!servico || !id) return;
    setTermoProduto(ordemServico?.report || '');
    setTermoPrazo(12);
    setTermoDataInicio(servico.data_servico);
    setNovoItemNome('');
    setNovoItemQtd(1);
    setAdicionandoItem(false);
    setModalTermo(true);

    // Se orçamento já carregado na página, pré-preenche e vai direto para Etapa 2
    if (orcamentoDoServico && orcamentoDoServico.itens.length > 0) {
      setTermoOrcamentoId(orcamentoDoServico.id);
      setOrcamentosCandidatos([{
        id: orcamentoDoServico.id,
        auvo_public_id: orcamentoDoServico.auvo_public_id,
        customer_name: orcamentoDoServico.customer_name,
        request_date: orcamentoDoServico.request_date,
        net_total_value: Number(orcamentoDoServico.net_total_value),
        current_stage_description: orcamentoDoServico.current_stage_description,
      }]);
      const produtos = orcamentoDoServico.itens
        .filter(i => i.tipo === 'PRODUTO' || i.tipo === 'SERVICO')
        .map(i => ({ nome: i.nome || 'Item', quantidade: Number(i.quantidade) }));
      setProdutosChecklist(produtos);
      setTermoEtapa(2);
      return;
    }

    // Sem orçamento vinculado — carrega lista de candidatos (Etapa 1)
    setTermoOrcamentoId(null);
    setProdutosChecklist([]);
    setTermoEtapa(1);
    setTermoCarregandoCandidatos(true);
    try {
      const { data } = await api.get(`/orcamentos/candidatos/${id}`);
      setOrcamentosCandidatos(data);
    } catch {
      setOrcamentosCandidatos([]);
    } finally {
      setTermoCarregandoCandidatos(false);
    }
  };

  const handleSelecionarOrcamentoCandidato = async (orc: OrcamentoCandidato) => {
    setTermoOrcamentoId(orc.id);
    setTermoCarregandoItens(true);
    setTermoEtapa(2);
    try {
      const { data } = await api.get(`/orcamentos/${orc.auvo_public_id}`);
      if (data.itens && data.itens.length > 0) {
        const produtos = data.itens
          .filter((item: any) => item.tipo === 'PRODUTO' || item.tipo === 'SERVICO')
          .map((item: any) => ({
            nome: item.nome || 'Item',
            quantidade: Number(item.quantidade),
          }));
        setProdutosChecklist(produtos);
      } else {
        setProdutosChecklist([]);
      }
    } catch {
      setProdutosChecklist([]);
    } finally {
      setTermoCarregandoItens(false);
    }
  };

  const buscarProdutosSugestoes = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 2) { setProdutoSugestoes([]); setMostraSugestoes(false); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/produtos?search=${encodeURIComponent(q)}&page_size=8`);
        const nomes: string[] = (data.items || []).map((p: { nome: string }) => p.nome);
        setProdutoSugestoes(nomes);
        setMostraSugestoes(nomes.length > 0);
      } catch {
        setProdutoSugestoes([]);
        setMostraSugestoes(false);
      }
    }, 300);
  };

  const handleAvancarChecklist = () => {
    const desc = produtosChecklist
      .map(p => {
        const qtd = Number.isInteger(p.quantidade) ? p.quantidade : p.quantidade.toFixed(1);
        return `${qtd}x ${p.nome}`;
      })
      .join(' · ');
    setTermoProduto(desc);
    setTermoEtapa(3);
  };

  const handleSalvarTermo = async () => {
    if (!id || !servico) return;
    setTermoSalvando(true);
    try {
      const dInicio = new Date(termoDataInicio + 'T12:00:00');
      const dFim = new Date(dInicio);
      dFim.setMonth(dFim.getMonth() + termoPrazo);

      const payload = {
        servico_id: parseInt(id),
        produto_descricao: termoProduto,
        prazo_meses: termoPrazo,
        data_inicio: termoDataInicio,
        data_fim: dFim.toISOString().split('T')[0],
        orcamento_id: termoOrcamentoId,
      };

      const { data: novoTermo } = await api.post('/termos-garantia/', payload);
      setTermoGarantia(novoTermo);
      setTermoEtapa(4);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao salvar termo de garantia');
    } finally {
      setTermoSalvando(false);
    }
  };

  const handleRemoverTermo = async () => {
    if (!id || !confirm('Remover o termo de garantia deste serviço?')) return;
    try {
      await api.delete(`/termos-garantia/servico/${id}`);
      setTermoGarantia(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Erro ao remover termo de garantia');
    }
  };

  const baixarPdfTermo = async (termoId: number) => {
    setTermoBaixandoPdf(true);
    try {
      const res = await api.get(`/termos-garantia/${termoId}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `termo_garantia_${termoId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Erro ao baixar PDF do termo.');
    } finally {
      setTermoBaixandoPdf(false);
    }
  };

  const abrirPreviewTermo = async (termoId: number) => {
    setCarregandoPreviewTermo(true);
    setModalPreviewTermo(true);
    setPreviewTermoHtml(null);
    try {
      const res = await api.get(`/termos-garantia/${termoId}/preview-html`, { responseType: 'text' });
      setPreviewTermoHtml(res.data);
    } catch {
      alert('Erro ao carregar preview do termo.');
      setModalPreviewTermo(false);
    } finally {
      setCarregandoPreviewTermo(false);
    }
  };

  const visualizarPdf = async (codigo: string) => {
    setBaixandoPdf(codigo);
    try {
      const res = await api.get(`/boletos/${codigo}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    } catch {
      alert('Erro ao visualizar PDF do boleto.');
    } finally {
      setBaixandoPdf(null);
    }
  };

  const abrirModalEmail = async (boleto: Boleto) => {
    setEmailEnviado(null);
    setEmailsAvulsos([]);
    setEmailAvulso('');
    setModalEmail(boleto);
    // Busca contatos do condomínio com campo receber_boleto
    if (condominio) {
      try {
        const { data } = await api.get(`/contatos/condominio/${condominio.id}`);
        const contatos = (data as ContatoEmail[])
          .filter(c => c.email)
          .map(c => ({ ...c, selecionado: c.receber_boleto ?? true }));
        setEmailContatos(contatos);
      } catch {
        setEmailContatos([]);
      }
    }
  };

  const abrirComposer = async () => {
    if (!modalEmail) return;
    setComposerCarregando(true);
    try {
      const res = await api.get(`/boletos/${modalEmail.id}/preview-email`);
      // res.data agora é { html: string, dados_manutencao: object | null }
      const html = typeof res.data === 'string' ? res.data : res.data.html;
      const manutData = typeof res.data === 'object' ? res.data.dados_manutencao : null;

      const assuntoPadrao = `Boleto #${notaFiscal?.numero_nota ?? ''} — ${condominio?.nome ?? ''} — Venc. ${modalEmail.data_vencimento ? pd(modalEmail.data_vencimento) : ''}`;
      const corpoPadrao = `Segue em anexo o boleto, nota fiscal e a ordem de serviço referente à Nota Fiscal #${notaFiscal?.numero_nota ?? ''} — ${condominio?.nome ?? ''}.`;
      
      setComposerCorpoHtml(html);
      setComposerManutencao(manutData);
      setComposerAssunto(assuntoPadrao);
      setComposerSaudacao(manutData?.saudacao || 'Prezados(as),');
      setComposerCorpo(corpoPadrao);
      setComposerRodape('O boleto em PDF e o XML da nota fiscal estão anexados a este email.\nPor gentileza, confirmar o recebimento deste e-mail.');
      setComposerAba('preview');
      setComposerAnexos([]);
      setComposerAberto(true);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar o email.');
    } finally {
      setComposerCarregando(false);
    }
  };

  const fecharComposer = () => {
    setComposerAberto(false);
    setComposerCorpoHtml('');
    setComposerAssunto('');
    setComposerAnexos([]);
  };

  const adicionarEmailAvulso = () => {
    const email = emailAvulso.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    if (emailsAvulsos.includes(email)) return;
    setEmailsAvulsos(prev => [...prev, email]);
    setEmailAvulso('');
  };

  const _buildFormData = (boleto: Boleto, destinatarios: string[], assunto?: string, corpoHtml?: string, anexos?: File[]) => {
    const fd = new FormData();
    fd.append('destinatarios', JSON.stringify(destinatarios));
    if (assunto) fd.append('assunto', assunto);
    if (corpoHtml) fd.append('corpo_html', corpoHtml);
    for (const arq of (anexos ?? [])) fd.append('arquivos', arq);
    return fd;
  };

  const enviarEmail = async () => {
    if (!modalEmail) return;
    const destinatarios = [
      ...emailContatos.filter(c => c.selecionado).map(c => c.email),
      ...emailsAvulsos,
    ];
    if (destinatarios.length === 0) {
      alert('Selecione pelo menos um destinatário.');
      return;
    }
    setEnviandoEmail(true);
    try {
      const fd = _buildFormData(modalEmail, destinatarios);
      await api.post(`/boletos/${modalEmail.id}/enviar-email`, fd);
      setEmailEnviado(`Email enviado para ${destinatarios.length} destinatário(s) com sucesso!`);
      await carregarDados();
    } catch (err) {
      console.error(err);
      alert('Falha ao enviar o e-mail. Por favor, tente novamente ou verifique os logs do servidor.');
    } finally {
      setEnviandoEmail(false);
    }
  };

  const enviarDoComposer = async () => {
    if (!modalEmail) return;
    const destinatarios = [
      ...emailContatos.filter(c => c.selecionado).map(c => c.email),
      ...emailsAvulsos,
    ];
    if (destinatarios.length === 0) {
      alert('Selecione pelo menos um destinatário.');
      return;
    }
    setComposerEnviando(true);
    try {
      const fd = new FormData();
      fd.append('destinatarios', JSON.stringify(destinatarios));
      if (composerAssunto) fd.append('assunto', composerAssunto);
      if (composerSaudacao) fd.append('saudacao', composerSaudacao);
      if (composerCorpo) fd.append('corpo', composerCorpo);
      if (composerRodape) fd.append('rodape', composerRodape);
      for (const arq of composerAnexos) fd.append('arquivos', arq);
      if (composerManutencao) {
        // Garante que a saudação atualizada vá para os dados de manutenção também
        const dadosCompletos = { ...composerManutencao, saudacao: composerSaudacao };
        fd.append('dados_manutencao', JSON.stringify(dadosCompletos));
      }
      await api.post(`/boletos/${modalEmail.id}/enviar-email`, fd);
      fecharComposer();
      setEmailEnviado(`Email enviado para ${destinatarios.length} destinatário(s) com sucesso!`);
      await carregarDados();
    } catch (err) {
      console.error(err);
      alert('Falha ao enviar o e-mail. Por favor, tente novamente ou verifique os logs do servidor.');
    } finally {
      setComposerEnviando(false);
    }
  };

  const autoEnviarParaContatos = async (boletoId: number) => {
    if (!condominio) return;
    try {
      const { data } = await api.get(`/contatos/condominio/${condominio.id}`);
      const destinatarios = (data as ContatoEmail[])
        .filter(c => c.email && (c.receber_boleto ?? true))
        .map(c => c.email);
      if (destinatarios.length === 0) return;
      const fd = new FormData();
      fd.append('destinatarios', JSON.stringify(destinatarios));
      await api.post(`/boletos/${boletoId}/enviar-email`, fd);
    } catch {
      console.warn('[auto-email] falha ao enviar email automaticamente');
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

  const abrirModalVincularOrc = async () => {
    if (!condominio) return;
    setModalVincularOrc(true);
    setCarregandoOrcsCondominio(true);
    try {
      const { data } = await api.get(`/orcamentos/condominio/${condominio.id}`);
      setOrcamentosCondominio(data);
    } catch {
      setOrcamentosCondominio([]);
    } finally {
      setCarregandoOrcsCondominio(false);
    }
  };

  const handleVincularOrcamento = async (orcId: number, orcAuvoId: number) => {
    if (!id) return;
    setVinculandoOrc(true);
    try {
      await api.put(`/servicos/${id}/orcamento`, { orcamento_id: orcId });
      setModalVincularOrc(false);
      await carregarDados();
    } catch {
      alert('Erro ao vincular orçamento.');
    } finally {
      setVinculandoOrc(false);
    }
  };

  const handleDesvinculartOrcamento = async () => {
    if (!id || !confirm('Desvincular orçamento deste serviço?')) return;
    setVinculandoOrc(true);
    try {
      await api.put(`/servicos/${id}/orcamento`, { orcamento_id: null });
      await carregarDados();
    } catch {
      alert('Erro ao desvincular orçamento.');
    } finally {
      setVinculandoOrc(false);
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
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 lg:py-5">
          <div className="flex items-center justify-between">
            <Link href="/servicos" className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 font-semibold transition-colors group">
              <svg className="w-5 h-5 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Voltar</span>
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

      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 lg:py-8 space-y-4 lg:space-y-6">

        {/* Hero */}
        <div className={`bg-gradient-to-br ${gradColor} rounded-3xl p-4 sm:p-8 shadow-2xl text-white relative overflow-hidden`}>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-32 -mt-32 pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center shadow-lg text-2xl sm:text-3xl shrink-0">{icon}</div>
              <div>
                <p className="text-xs sm:text-sm opacity-80 mb-0.5">Serviço #{servico.id}</p>
                <h1 className="text-xl sm:text-3xl font-black tracking-tight">{nome}</h1>
                <p className="text-sm sm:text-base opacity-90 mt-1">
                  {condominio?.nome || '—'} · {pd(servico.data_servico)}
                </p>
                {servico.email_enviado_em && (
                  <div className="mt-2 flex items-center gap-1.5 bg-green-500/30 backdrop-blur-sm px-3 py-1 rounded-full w-fit border border-green-400/30">
                    <span className="text-[10px] sm:text-xs font-bold tracking-wide flex items-center gap-1.5 uppercase">
                      <span className="text-sm">📧</span> E-mail de cobrança enviado em {new Date(servico.email_enviado_em).toLocaleString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Resumo financeiro rápido */}
            <div className="flex gap-2 sm:gap-4 flex-wrap">
              {notaFiscal && (
                <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 sm:px-5 py-2 sm:py-3 border border-white/20 text-center">
                  <p className="text-xs opacity-75 uppercase font-bold mb-0.5">Valor Nota</p>
                  <p className="text-base sm:text-xl font-black">{fmt(notaFiscal.valor)}</p>
                </div>
              )}
              {boletos.length > 0 && (
                <>
                  <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 sm:px-5 py-2 sm:py-3 border border-white/20 text-center">
                    <p className="text-xs opacity-75 uppercase font-bold mb-0.5">Cobrado</p>
                    <p className="text-base sm:text-xl font-black">{fmt(valorBruto)}</p>
                  </div>
                  <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 sm:px-5 py-2 sm:py-3 border border-white/20 text-center">
                    <p className="text-xs opacity-75 uppercase font-bold mb-0.5">Recebido</p>
                    <p className="text-base sm:text-xl font-black">{fmt(valorRecebido)}</p>
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 lg:gap-6">
          {/* Coluna principal */}
          <div className="lg:col-span-2 space-y-3 lg:space-y-6">

            {/* Dados do Serviço */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">📋</span> {editando ? 'Editar Serviço' : 'Dados do Serviço'}
                </h2>
              </div>
              <div className="p-4 sm:p-6">
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
                      {servico.numero_os ? (
                        <div className="bg-purple-50 dark:bg-purple-500/10 rounded-xl p-4 col-span-2 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase mb-1">Ordem de Serviço (OS)</p>
                            <p className="font-black text-purple-700 dark:text-purple-300 text-lg">#{servico.numero_os}</p>
                          </div>
                          <Link href={`/ordens-servico/${servico.numero_os}`}
                            className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline shrink-0">
                            Ver OS →
                          </Link>
                        </div>
                      ) : (
                        <div className="bg-slate-50 dark:bg-slate-800/50 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-4 col-span-2 flex items-center justify-between gap-2">
                          <p className="text-sm text-slate-500 italic">Nenhuma OS vinculada</p>
                          <button onClick={abrirModalVincularOs}
                            className="text-xs font-bold text-purple-600 dark:text-purple-400 hover:underline shrink-0 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.1-1.1m1.415-8.328a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.1-1.1" /></svg>
                            Vincular OS Manualmente →
                          </button>
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

            {/* Ordem de Serviço — detalhes */}
            {ordemServico && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-purple-50 dark:bg-purple-500/10 border-b border-purple-200 dark:border-purple-800/30 flex items-center justify-between flex-wrap gap-2">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xl">🔧</span> Ordem de Serviço #{ordemServico.task_id}
                    {ordemServico.task_status_descricao && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300">
                        {ordemServico.task_status_descricao}
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-2">
                    {ordemServico.task_url && (
                      <button onClick={baixarPdfOs} disabled={pdfLoadingOs}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-all disabled:opacity-60 flex items-center gap-1">
                        {pdfLoadingOs
                          ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                        Baixar PDF
                      </button>
                    )}
                    <button onClick={handleDesvincularOsManual} disabled={vinculandoOs}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-500/20 rounded-lg hover:brightness-105 transition-all flex items-center gap-1">
                      {vinculandoOs
                        ? <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                      Desvincular
                    </button>
                    <Link href={`/ordens-servico/${ordemServico.task_id}`}
                      className="px-3 py-1.5 text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-500/20 rounded-lg hover:brightness-105 transition-all flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      Abrir OS
                    </Link>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {ordemServico.task_date && (
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data</p>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">
                          {new Date(ordemServico.task_date).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    )}
                    {ordemServico.user_to_name && (
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Técnico</p>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">{ordemServico.user_to_name}</p>
                      </div>
                    )}
                    {ordemServico.task_type_description && (
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Tipo</p>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">{ordemServico.task_type_description}</p>
                      </div>
                    )}
                  </div>
                  {ordemServico.report && (
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Relatório</p>
                      <p className="text-sm text-slate-900 dark:text-white leading-relaxed whitespace-pre-wrap">{ordemServico.report}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Orçamento vinculado */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-800/30 flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">📋</span> Orçamento Vinculado
                  {servico.orcamento_id && (
                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-200 dark:bg-amber-500/30 text-amber-800 dark:text-amber-300">
                      Manual
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-2">
                  {orcamentoDoServico && (
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/20 px-2 py-1 rounded-lg">
                      #{orcamentoDoServico.auvo_public_id}
                    </span>
                  )}
                  {servico.orcamento_id ? (
                    <button
                      onClick={handleDesvinculartOrcamento}
                      disabled={vinculandoOrc}
                      className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-800/30 rounded-lg hover:brightness-105 transition-all disabled:opacity-50 flex items-center gap-1"
                    >
                      {vinculandoOrc
                        ? <div className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.1-1.1m1.415-8.328a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.1-1.1" /></svg>}
                      Desvincular
                    </button>
                  ) : null}
                  <button
                    onClick={abrirModalVincularOrc}
                    className="px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/20 rounded-lg hover:brightness-105 transition-all flex items-center gap-1"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.1-1.1M10.172 13.828a4 4 0 01-5.656 0l-4-4a4 4 0 015.656-5.656l1.1 1.1" /></svg>
                    {servico.orcamento_id ? 'Alterar' : 'Vincular'}
                  </button>
                </div>
              </div>
              <div className="p-6">
                {orcamentoDoServico ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {orcamentoDoServico.request_date && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data</p>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">
                            {new Date(orcamentoDoServico.request_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      )}
                      {orcamentoDoServico.current_stage_description && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Status</p>
                          <p className="font-bold text-slate-900 dark:text-white text-sm">{orcamentoDoServico.current_stage_description}</p>
                        </div>
                      )}
                      <div className="bg-amber-50 dark:bg-amber-500/10 rounded-xl p-3">
                        <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase mb-1">Total</p>
                        <p className="font-black text-amber-700 dark:text-amber-300 text-sm">
                          {Number(orcamentoDoServico.net_total_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                      </div>
                    </div>

                    {orcamentoDoServico.itens.filter(i => i.tipo === 'PRODUTO' || i.tipo === 'SERVICO').length > 0 && (
                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-3">Itens</p>
                        <div className="space-y-2">
                          {orcamentoDoServico.itens
                            .filter(i => i.tipo === 'PRODUTO' || i.tipo === 'SERVICO')
                            .map(item => (
                              <div key={item.id} className="flex items-center justify-between gap-2">
                                <span className="text-sm text-slate-900 dark:text-white">
                                  <span className="font-bold text-amber-600 dark:text-amber-400 mr-1">{Number.isInteger(Number(item.quantidade)) ? Number(item.quantidade) : Number(item.quantidade).toFixed(1)}x</span>
                                  {item.nome || `Item #${item.id}`}
                                </span>
                                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
                                  {Number(item.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-slate-500 dark:text-slate-400 text-sm italic">Nenhum orçamento vinculado a este serviço.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Termo de Garantia */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-6 py-4 bg-teal-50 dark:bg-teal-500/10 border-b border-teal-200 dark:border-teal-800/30 flex items-center justify-between flex-wrap gap-2">
                <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="text-xl">📜</span> Termo de Garantia
                </h2>
                <div className="flex items-center gap-2">
                  {termoGarantia ? (
                    <>
                      <button onClick={() => abrirPreviewTermo(termoGarantia.id)} disabled={carregandoPreviewTermo}
                        className="px-3 py-1.5 text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-700 rounded-lg hover:brightness-95 transition-all disabled:opacity-60 flex items-center gap-1">
                        {carregandoPreviewTermo
                          ? <div className="w-3 h-3 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                          : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                        Visualizar
                      </button>
                      <button onClick={() => baixarPdfTermo(termoGarantia.id)} disabled={termoBaixandoPdf}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-all disabled:opacity-60 flex items-center gap-1">
                        {termoBaixandoPdf
                          ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                        Baixar PDF
                      </button>
                      <button onClick={abrirModalTermo}
                        className="px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg hover:brightness-95 transition-all">
                        Regerar
                      </button>
                      <button onClick={handleRemoverTermo}
                        className="px-3 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg hover:brightness-95 transition-all">
                        Remover
                      </button>
                    </>
                  ) : (
                    <button onClick={abrirModalTermo}
                      className="px-3 py-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-100 dark:bg-teal-500/20 rounded-lg hover:brightness-105 transition-all flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Gerar Termo
                    </button>
                  )}
                </div>
              </div>
              <div className="p-6">
                {termoGarantia ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Produto / Serviço</p>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{termoGarantia.produto_descricao}</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Prazo</p>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{termoGarantia.prazo_meses} meses</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Data Início</p>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{new Date(termoGarantia.data_inicio).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="bg-teal-50 dark:bg-teal-500/10 rounded-xl p-3">
                      <p className="text-xs font-bold text-teal-600 dark:text-teal-400 uppercase mb-1">Data Término</p>
                      <p className="font-black text-teal-700 dark:text-teal-300 text-sm">{new Date(termoGarantia.data_fim).toLocaleDateString('pt-BR')}</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-slate-500 dark:text-slate-400 text-sm italic">Nenhum termo de garantia gerado para este serviço.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Nota Fiscal Vinculada — detalhes completos */}
            {notaFiscal ? (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                <div className="px-6 py-4 bg-orange-50 dark:bg-orange-500/10 border-b border-orange-200 dark:border-orange-800/30 flex items-center justify-between flex-wrap gap-2">
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="text-xl">📄</span> Nota Fiscal Vinculada
                    {temVinculo && (
                      <span className="text-xs font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400">
                        🔗 2 notas vinculadas
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
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
                      Desvincular do serviço
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
                  {/* Nota Vinculada */}
                  {temVinculo && notaVinculada && (
                    <div className="mt-4 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-800/30 rounded-xl p-4">
                      <p className="text-xs font-black text-violet-600 dark:text-violet-400 uppercase mb-2">🔗 Nota Vinculada (B)</p>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Número</p>
                          <p className="font-bold text-slate-900 dark:text-white">{notaVinculada.numero_nota}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Valor</p>
                          <p className="font-bold text-violet-700 dark:text-violet-300">{fmt(notaVinculada.valor)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Total combinado</p>
                          <p className="font-black text-violet-700 dark:text-violet-300">{fmt(notaFiscal.valor + notaVinculada.valor)}</p>
                        </div>
                      </div>
                      <Link href={`/notas/${notaVinculada.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        Abrir nota vinculada
                      </Link>
                    </div>
                  )}
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
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6 sm:p-8 text-center shadow-sm">
                <span className="text-3xl sm:text-4xl mb-3 block">📄</span>
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
                      {totalPago}/{boletosAtivos.length} pago(s) · {fmt(valorRecebido)} recebido
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
                                    <button
                                      onClick={() => visualizarPdf(boleto.codigo_solicitacao!)}
                                      disabled={baixandoPdf === boleto.codigo_solicitacao}
                                      className="px-3 py-1.5 text-xs font-bold bg-slate-700 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                                      title="Visualizar PDF"
                                    >
                                      {baixandoPdf === boleto.codigo_solicitacao ? '...' : '📄 PDF'}
                                    </button>
                                    <button
                                      onClick={() => baixarPdf(boleto.codigo_solicitacao!)}
                                      disabled={baixandoPdf === boleto.codigo_solicitacao}
                                      className="px-3 py-1.5 text-xs font-bold bg-slate-600 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
                                      title="Baixar PDF"
                                    >
                                      ⬇️
                                    </button>
                                    <button
                                      onClick={() => abrirModalEmail(boleto)}
                                      className="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:brightness-110 transition-all"
                                      title="Enviar por Email"
                                    >
                                      📧 Enviar
                                    </button>
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
          <div className="space-y-3 lg:space-y-6">
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
                    totalPago === boletosAtivos.length && boletosAtivos.length > 0
                      ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                      : totalPago > 0
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'
                        : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                  }`}>
                    {totalPago === boletosAtivos.length && boletosAtivos.length > 0 ? '✅ Totalmente pago' : totalPago > 0 ? `⏳ ${totalPago}/${boletosAtivos.length} parcelas pagas` : '⏳ Aguardando pagamento'}
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

                  {/* Seção: Notas Vinculadas */}
                  {configImpostos.nota_vinculada_id && (
                    <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-800/30 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-black text-violet-600 dark:text-violet-400 uppercase">🔗 Notas Vinculadas</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="bg-white dark:bg-slate-900 rounded-lg p-3">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase mb-0.5">Nota A (esta)</p>
                          <p className="font-black text-slate-900 dark:text-white">{notaFiscal.numero_nota}</p>
                          <p className="text-violet-600 dark:text-violet-400 font-bold">{fmt(configImpostos.valor_bruto - (configImpostos.valor_nota_vinculada || 0))}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-lg p-3">
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase mb-0.5">Nota B (vinculada)</p>
                          <p className="font-black text-slate-900 dark:text-white">{configImpostos.nota_vinculada_numero || `#${configImpostos.nota_vinculada_id}`}</p>
                          <p className="text-violet-600 dark:text-violet-400 font-bold">{fmt(configImpostos.valor_nota_vinculada || 0)}</p>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-violet-600 dark:text-violet-400 uppercase mb-1.5">Descontar impostos em</label>
                        <select
                          value={vinculoAplicarImpostoEm}
                          onChange={e => setVinculoAplicarImpostoEm(e.target.value as 'nota_a' | 'nota_b' | 'ambas' | 'nenhuma')}
                          className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-slate-950 border border-violet-200 dark:border-violet-700 focus:ring-2 focus:ring-violet-500 outline-none text-slate-900 dark:text-white font-bold"
                        >
                          <option value="nota_a">Nota A (esta nota) — desconta impostos de A, usa bruto de B</option>
                          <option value="nota_b">Nota B (vinculada) — usa bruto de A, desconta impostos de B</option>
                          <option value="ambas">Ambas — desconta impostos das duas notas</option>
                          <option value="nenhuma">Nenhuma — sem retenção (valores brutos)</option>
                        </select>
                      </div>
                    </div>
                  )}

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
                      ] as [string, boolean, (v: boolean) => void, string, (v: string) => void][]).map(([label, aplicar, setAplicar, pct, setPct]) => {
                        // Base para exibição individual: depende de onde os impostos são aplicados
                        const valorB = configImpostos.valor_nota_vinculada || 0;
                        const baseImposto = configImpostos.nota_vinculada_id
                          ? vinculoAplicarImpostoEm === 'nota_a' ? configImpostos.valor_bruto - valorB
                          : vinculoAplicarImpostoEm === 'nota_b' ? valorB
                          : configImpostos.valor_bruto // ambas ou nenhuma
                          : configImpostos.valor_bruto;
                        return (
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
                            {aplicar ? `- ${fmt(baseImposto * parseFloat(pct || '0') / 100)}` : '—'}
                          </span>
                        </div>
                        );
                      })}
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
                    const ok = Math.abs(diff) < 0.02;
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
                            Ajuste os valores das parcelas para que a soma esteja dentro de ±R$ 0,02 do valor líquido ({fmt(liquido)}).
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
                  {/* Checkbox auto-envio de email */}
                  <label className="flex items-center gap-2 cursor-pointer select-none w-full">
                    <input
                      type="checkbox"
                      checked={autoEnviarEmail}
                      onChange={e => setAutoEnviarEmail(e.target.checked)}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                      📧 Enviar email automaticamente ao gerar
                    </span>
                  </label>
                  <button onClick={() => setModalInter(false)}
                    className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all">
                    Cancelar
                  </button>
                  <button
                    onClick={handleAprovarBoletos}
                    disabled={Math.abs(somaParcelasModal() - calcularValorLiquidoModal()) >= 0.02}
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
      {/* Modal Enviar Email */}
      {modalEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-black text-slate-900 dark:text-white mb-1">📧 Enviar Boleto por Email</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Boleto #{notaFiscal?.numero_nota} · Parcela {modalEmail.numero_parcela}/{modalEmail.total_parcelas} ·{' '}
              R$ {modalEmail.valor_nominal.toFixed(2).replace('.', ',')}
            </p>

            {emailEnviado ? (
              <div className="bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-700 rounded-xl p-4 mb-5 text-center">
                <p className="text-green-700 dark:text-green-400 font-bold text-sm">✅ {emailEnviado}</p>
              </div>
            ) : (
              <>
                {/* Contatos do condomínio */}
                {emailContatos.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-black text-slate-400 uppercase mb-2">Contatos do Condomínio</p>
                    <div className="space-y-2">
                      {emailContatos.map((c, i) => (
                        <label key={c.id} className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <input
                            type="checkbox"
                            checked={c.selecionado}
                            onChange={() => {
                              setEmailContatos(prev => prev.map((x, idx) => idx === i ? { ...x, selecionado: !x.selecionado } : x));
                            }}
                            className="w-4 h-4 rounded accent-blue-600"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{c.nome}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{c.email}</p>
                          </div>
                          {c.receber_boleto && (
                            <span className="ml-auto text-xs text-blue-600 dark:text-blue-400 font-bold shrink-0">padrão</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {/* Emails avulsos */}
                <div className="mb-4">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Adicionar Email Avulso</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={emailAvulso}
                      onChange={e => setEmailAvulso(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), adicionarEmailAvulso())}
                      placeholder="outro@email.com"
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={adicionarEmailAvulso}
                      className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:brightness-110"
                    >+</button>
                  </div>
                  {emailsAvulsos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {emailsAvulsos.map(e => (
                        <span key={e} className="flex items-center gap-1 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs px-2.5 py-1 rounded-full font-medium">
                          {e}
                          <button onClick={() => setEmailsAvulsos(prev => prev.filter(x => x !== e))} className="hover:text-red-500 font-black">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="flex flex-col gap-2 mt-2">
              {!emailEnviado && (
                <div className="flex gap-2">
                  <button
                    onClick={abrirComposer}
                    disabled={composerCarregando || (emailContatos.filter(c => c.selecionado).length + emailsAvulsos.length) === 0}
                    className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:brightness-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {composerCarregando
                      ? <><div className="w-3.5 h-3.5 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /> Carregando...</>
                      : '✏️ Ver / Editar email'}
                  </button>
                  <button
                    onClick={enviarEmail}
                    disabled={enviandoEmail || (emailContatos.filter(c => c.selecionado).length + emailsAvulsos.length) === 0}
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                  >
                    {enviandoEmail
                      ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
                      : `📧 Enviar direto (${emailContatos.filter(c => c.selecionado).length + emailsAvulsos.length})`}
                  </button>
                </div>
              )}
              <button
                onClick={() => { setModalEmail(null); setEmailEnviado(null); }}
                className="w-full py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all text-sm"
              >
                {emailEnviado ? 'Fechar' : 'Cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Composer de Email */}
      {composerAberto && modalEmail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col" style={{maxHeight: '92vh'}}>

            {/* Cabeçalho */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">✏️ Compor Email</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Boleto #{notaFiscal?.numero_nota} · Parcela {modalEmail.numero_parcela}/{modalEmail.total_parcelas} · {fmt(modalEmail.valor_nominal)}
                </p>
              </div>
              <button onClick={fecharComposer} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl font-bold">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">

              {/* Para */}
              <div>
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Para</p>
                <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-h-[42px]">
                  {emailContatos.filter(c => c.selecionado).map(c => (
                    <span key={c.id} className="flex items-center gap-1 bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs px-2.5 py-1 rounded-full font-medium">
                      {c.nome} &lt;{c.email}&gt;
                      <button onClick={() => setEmailContatos(prev => prev.map(x => x.id === c.id ? {...x, selecionado: false} : x))} className="hover:text-red-500 font-black ml-0.5">×</button>
                    </span>
                  ))}
                  {emailsAvulsos.map(e => (
                    <span key={e} className="flex items-center gap-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs px-2.5 py-1 rounded-full font-medium">
                      {e}
                      <button onClick={() => setEmailsAvulsos(prev => prev.filter(x => x !== e))} className="hover:text-red-500 font-black ml-0.5">×</button>
                    </span>
                  ))}
                  {(emailContatos.filter(c => c.selecionado).length + emailsAvulsos.length) === 0 && (
                    <span className="text-xs text-slate-400 italic">Nenhum destinatário selecionado</span>
                  )}
                </div>
              </div>

              {/* Assunto */}
              <div>
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Assunto</p>
                <input
                  type="text"
                  value={composerAssunto}
                  onChange={e => setComposerAssunto(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                />
              </div>

              {/* Corpo */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-black text-slate-400 uppercase">Corpo</p>
                  <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                    <button
                      onClick={() => setComposerAba('preview')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${composerAba === 'preview' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}
                    >👁️ Preview</button>
                    <button
                      onClick={() => setComposerAba('editar')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${composerAba === 'editar' ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white' : 'text-slate-500'}`}
                    >✏️ Editar Texto</button>
                  </div>
                </div>
                {composerAba === 'preview' ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <iframe
                      srcDoc={composerCorpoHtml}
                      className="w-full border-0"
                      style={{height: '320px'}}
                      title="Preview do email"
                      sandbox="allow-same-origin"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Saudação</label>
                      <input
                        type="text"
                        value={composerSaudacao}
                        onChange={e => setComposerSaudacao(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Corpo da mensagem</label>
                      <textarea
                        value={composerCorpo}
                        onChange={e => setComposerCorpo(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Rodapé / Observação</label>
                      <textarea
                        value={composerRodape}
                        onChange={e => setComposerRodape(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white resize-none"
                      />
                    </div>

                    {composerManutencao && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 mt-2">
                        <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase mb-3">Campos de Manutenção Preventiva</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Serviço / Título</label>
                            <input type="text" value={composerManutencao.servico} onChange={e => setComposerManutencao({ ...composerManutencao, servico: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Período (Ref.)</label>
                            <input type="text" value={composerManutencao.periodo} onChange={e => setComposerManutencao({ ...composerManutencao, periodo: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Data Educação</label>
                            <input type="text" value={composerManutencao.data_execucao} onChange={e => setComposerManutencao({ ...composerManutencao, data_execucao: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Número OS</label>
                            <input type="text" value={composerManutencao.numero_os} onChange={e => setComposerManutencao({ ...composerManutencao, numero_os: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Parcelas</label>
                            <input type="text" value={composerManutencao.quantidade_parcelas} onChange={e => setComposerManutencao({ ...composerManutencao, quantidade_parcelas: e.target.value })}
                              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Valor Bruto (R$)</label>
                            <input type="number" step="0.01" value={composerManutencao.valor_bruto} onChange={e => setComposerManutencao({ ...composerManutencao, valor_bruto: parseFloat(e.target.value) })}
                              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Valor Líquido (R$)</label>
                            <input type="number" step="0.01" value={composerManutencao.valor_liquido} onChange={e => setComposerManutencao({ ...composerManutencao, valor_liquido: parseFloat(e.target.value) })}
                              className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm outline-none" />
                          </div>
                          <div className="col-span-2 grid grid-cols-4 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">INSS</label>
                              <input type="number" step="0.01" value={composerManutencao.inss} onChange={e => setComposerManutencao({ ...composerManutencao, inss: parseFloat(e.target.value) })}
                                className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">COFINS</label>
                              <input type="number" step="0.01" value={composerManutencao.cofins} onChange={e => setComposerManutencao({ ...composerManutencao, cofins: parseFloat(e.target.value) })}
                                className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">PIS</label>
                              <input type="number" step="0.01" value={composerManutencao.pis} onChange={e => setComposerManutencao({ ...composerManutencao, pis: parseFloat(e.target.value) })}
                                className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs outline-none" />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">CSLL</label>
                              <input type="number" step="0.01" value={composerManutencao.csll} onChange={e => setComposerManutencao({ ...composerManutencao, csll: parseFloat(e.target.value) })}
                                className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs outline-none" />
                            </div>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-0.5">Descrição dos Serviços</label>
                            <textarea value={composerManutencao.descricao_servicos} onChange={e => setComposerManutencao({ ...composerManutencao, descricao_servicos: e.target.value })}
                              rows={2} className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm outline-none resize-none" />
                          </div>
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-slate-400 italic">O preview reflete o modelo padrão. As edições serão aplicadas no envio.</p>
                  </div>
                )}
              </div>

              {/* Anexos */}
              <div>
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Anexos</p>
                <div className="space-y-2">
                  {/* Automáticos */}
                  <div className="flex flex-wrap gap-2">
                    <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs px-3 py-1.5 rounded-lg font-medium">
                      📄 boleto_{modalEmail.codigo_solicitacao}.pdf <span className="text-slate-400 dark:text-slate-500">(automático)</span>
                    </span>
                    {notaFiscal?.pdf_object_key && (
                      <span className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs px-3 py-1.5 rounded-lg font-medium">
                        📄 nota_fiscal_{notaFiscal.numero_nota}.pdf <span className="text-amber-500 dark:text-amber-600">(automático)</span>
                      </span>
                    )}
                    {notaVinculada?.pdf_object_key && (
                      <span className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs px-3 py-1.5 rounded-lg font-medium">
                        📄 nota_fiscal_{notaVinculada.numero_nota}.pdf <span className="text-amber-500 dark:text-amber-600">(vinculada)</span>
                      </span>
                    )}
                    {servico?.numero_os && (
                      <span className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs px-3 py-1.5 rounded-lg font-medium">
                        🔧 os_{servico.numero_os}.pdf <span className="text-slate-400 dark:text-slate-500">(automático)</span>
                      </span>
                    )}
                    {termoGarantia && (
                      <span className="flex items-center gap-1.5 bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400 text-xs px-3 py-1.5 rounded-lg font-medium">
                        📜 Termo de Garantia <span className="text-teal-500 dark:text-teal-600">(automático)</span>
                      </span>
                    )}
                  </div>
                  {/* Extras adicionados */}
                  {composerAnexos.length > 0 ? (
                    <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/20">
                      {composerAnexos.map((f, i) => (
                        <span key={i} className="flex items-center gap-1.5 bg-white dark:bg-slate-800 text-blue-700 dark:text-blue-300 text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-sm border border-blue-100 dark:border-blue-500/20">
                          📎 {f.name} ({ (f.size / 1024).toFixed(0) } KB)
                          <button onClick={() => setComposerAnexos(prev => prev.filter((_, idx) => idx !== i))} className="hover:text-red-500 font-black ml-1 p-0.5 leading-none bg-slate-100 dark:bg-slate-700 rounded-full">×</button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400 italic px-1">Nenhum anexo extra adicionado.</p>
                  )}
                  {/* Upload */}
                  <label className="flex items-center gap-2 cursor-pointer w-full sm:w-fit px-4 py-2 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/5 transition-all group">
                    <span className="text-lg group-hover:scale-125 transition-transform">➕</span>
                    <span className="font-bold">Anexar Documento Manualmente</span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={e => {
                        const files = e.target.files ? Array.from(e.target.files) : [];
                        if (files.length > 0) {
                          setComposerAnexos(prev => [...prev, ...files]);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Rodapé */}
            <div className="flex gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700 shrink-0">
              <button
                onClick={fecharComposer}
                className="flex-1 py-2.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-bold text-sm transition-all"
              >
                ← Voltar
              </button>
              <button
                onClick={enviarDoComposer}
                disabled={composerEnviando || (emailContatos.filter(c => c.selecionado).length + emailsAvulsos.length) === 0}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {composerEnviando
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enviando...</>
                  : `📧 Enviar (${emailContatos.filter(c => c.selecionado).length + emailsAvulsos.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal Preview Termo de Garantia */}
      {modalPreviewTermo && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ width: 860, maxHeight: '95vh' }}>
            <div className="flex items-center justify-between px-5 py-3 bg-teal-600 text-white flex-shrink-0">
              <span className="font-bold text-sm flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                Preview — Termo de Garantia
              </span>
              <div className="flex items-center gap-2">
                {termoGarantia && (
                  <button onClick={() => baixarPdfTermo(termoGarantia.id)} disabled={termoBaixandoPdf}
                    className="px-3 py-1.5 text-xs font-bold text-teal-700 bg-white rounded-lg hover:bg-teal-50 transition-all disabled:opacity-60 flex items-center gap-1">
                    {termoBaixandoPdf
                      ? <div className="w-3 h-3 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                      : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>}
                    Baixar PDF
                  </button>
                )}
                <button onClick={() => setModalPreviewTermo(false)}
                  className="p-1.5 rounded-lg hover:bg-white/20 transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1 flex justify-center bg-gray-200 p-4">
              {carregandoPreviewTermo ? (
                <div className="flex items-center justify-center w-full">
                  <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : previewTermoHtml ? (
                <iframe
                  srcDoc={previewTermoHtml}
                  style={{ width: 794, height: 1123, border: 'none', flexShrink: 0, background: '#fff' }}
                  title="Preview Termo de Garantia"
                />
              ) : null}
            </div>
          </div>
        </div>
      )}
      {/* Modal Termo de Garantia */}
      {modalTermo && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-teal-600 text-white flex items-center justify-between">
              <h2 className="font-bold text-lg flex items-center gap-2">
                <span>📜</span>
                {termoEtapa === 1 ? 'Orçamentos Relacionados' : termoEtapa === 2 ? 'Produtos do Orçamento' : termoEtapa === 3 ? 'Gerar Termo de Garantia' : 'Termo Gerado'}
              </h2>
              <button onClick={() => setModalTermo(false)} className="text-white/80 hover:text-white text-xl">×</button>
            </div>

            <div className="p-6">
              {/* Etapa 1 — orçamentos candidatos */}
              {termoEtapa === 1 && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Orçamentos deste condomínio nos 90 dias anteriores ao serviço. Selecione um para pré-preencher a descrição, ou pule para digitar manualmente.
                  </p>
                  {termoCarregandoCandidatos ? (
                    <div className="flex justify-center py-6">
                      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : orcamentosCandidatos.length === 0 ? (
                    <p className="text-sm text-slate-400 italic text-center py-4">Nenhum orçamento encontrado no período.</p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {orcamentosCandidatos.map(orc => (
                        <button
                          key={orc.id}
                          onClick={() => handleSelecionarOrcamentoCandidato(orc)}
                          className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-500/10 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-teal-600 dark:text-teal-400">#{orc.auvo_public_id}</span>
                            <span className="text-xs text-slate-500">{orc.request_date ? new Date(orc.request_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span>
                          </div>
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5 truncate">{orc.customer_name || '—'}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            R$ {orc.net_total_value.toFixed(2).replace('.', ',')}
                            {orc.current_stage_description ? ` · ${orc.current_stage_description}` : ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setTermoEtapa(3)}
                    className="w-full py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  >
                    Pular (digitar manualmente)
                  </button>
                </div>
              )}

              {/* Etapa 2 — checklist de produtos do orçamento */}
              {termoEtapa === 2 && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Selecione os produtos que entrarão no termo. Remova os que não se aplicam ou adicione itens avulsos.
                  </p>
                  {termoCarregandoItens ? (
                    <div className="flex justify-center py-6">
                      <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {produtosChecklist.length === 0 ? (
                          <p className="text-sm text-slate-400 italic text-center py-3">Nenhum produto encontrado no orçamento.</p>
                        ) : (
                          produtosChecklist.map((p, idx) => (
                            <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                              <span className="text-sm text-slate-800 dark:text-slate-200">
                                <span className="font-bold text-teal-600 dark:text-teal-400 mr-1.5">{Number.isInteger(p.quantidade) ? p.quantidade : p.quantidade.toFixed(1)}x</span>
                                {p.nome}
                              </span>
                              <button
                                onClick={() => setProdutosChecklist(prev => prev.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-red-500 transition-colors text-lg leading-none ml-2"
                              >×</button>
                            </div>
                          ))
                        )}
                      </div>

                      {adicionandoItem ? (
                        <div className="flex gap-2 items-start">
                          <input
                            type="number"
                            min={1}
                            value={novoItemQtd}
                            onChange={e => setNovoItemQtd(Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm outline-none focus:ring-2 focus:ring-teal-500 text-center mt-0.5"
                          />
                          <div className="relative flex-1">
                            <input
                              type="text"
                              value={novoItemNome}
                              onChange={e => {
                                setNovoItemNome(e.target.value);
                                buscarProdutosSugestoes(e.target.value);
                              }}
                              placeholder="Nome do produto"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                              onKeyDown={e => {
                                if (e.key === 'Escape') { setMostraSugestoes(false); }
                                if (e.key === 'Enter' && novoItemNome.trim()) {
                                  setProdutosChecklist(prev => [...prev, { nome: novoItemNome.trim(), quantidade: novoItemQtd }]);
                                  setNovoItemNome(''); setNovoItemQtd(1); setAdicionandoItem(false);
                                  setMostraSugestoes(false);
                                }
                              }}
                              onBlur={() => setTimeout(() => setMostraSugestoes(false), 150)}
                            />
                            {mostraSugestoes && produtoSugestoes.length > 0 && (
                              <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                {produtoSugestoes.map((nome, i) => (
                                  <li
                                    key={i}
                                    onMouseDown={() => {
                                      setNovoItemNome(nome);
                                      setMostraSugestoes(false);
                                      setProdutoSugestoes([]);
                                    }}
                                    className="px-3 py-2 text-sm cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-500/10 text-slate-800 dark:text-slate-200 first:rounded-t-xl last:rounded-b-xl transition-colors"
                                  >
                                    {nome}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              if (novoItemNome.trim()) {
                                setProdutosChecklist(prev => [...prev, { nome: novoItemNome.trim(), quantidade: novoItemQtd }]);
                                setNovoItemNome(''); setNovoItemQtd(1);
                              }
                              setAdicionandoItem(false);
                              setMostraSugestoes(false);
                            }}
                            className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-all mt-0.5"
                          >OK</button>
                          <button
                            onClick={() => { setAdicionandoItem(false); setNovoItemNome(''); setNovoItemQtd(1); setMostraSugestoes(false); }}
                            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg text-sm hover:brightness-95 transition-all mt-0.5"
                          >✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAdicionandoItem(true)}
                          className="w-full py-2 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 rounded-xl text-sm hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400 transition-all"
                        >
                          + Adicionar item
                        </button>
                      )}

                      <div className="flex gap-2 pt-1">
                        <button onClick={() => setTermoEtapa(1)}
                          className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-medium text-sm hover:brightness-95 transition-all">
                          ← Voltar
                        </button>
                        <button
                          onClick={handleAvancarChecklist}
                          className="flex-1 py-2.5 bg-teal-600 text-white rounded-xl font-bold text-sm hover:bg-teal-700 transition-all"
                        >
                          Avançar →
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Etapa 3 — formulário */}
              {termoEtapa === 3 && (
                <div className="space-y-4">
                  {termoOrcamentoId && (
                    <p className="text-xs text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 rounded-lg px-3 py-2">
                      Orçamento #{orcamentosCandidatos.find(o => o.id === termoOrcamentoId)?.auvo_public_id} selecionado
                    </p>
                  )}
                  {notaFiscal?.descricao_servico && (
                    <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl p-3">
                      <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase mb-1">Descrição da Nota Fiscal (consulta)</p>
                      <p className="text-xs text-amber-900 dark:text-amber-200 whitespace-pre-wrap leading-relaxed">{notaFiscal.descricao_servico}</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Descrição do Produto/Serviço</label>
                    <textarea
                      value={termoProduto}
                      onChange={(e) => setTermoProduto(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                      placeholder="Ex: Instalação de Motor de Portão PPA..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Prazo (Meses)</label>
                      <select
                        value={termoPrazo}
                        onChange={(e) => setTermoPrazo(parseInt(e.target.value))}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                      >
                        <option value={3}>3 meses</option>
                        <option value={6}>6 meses</option>
                        <option value={12}>12 meses</option>
                        <option value={24}>24 meses</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data Início</label>
                      <input
                        type="date"
                        value={termoDataInicio}
                        onChange={(e) => setTermoDataInicio(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                  {termoDataInicio && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Validade: {new Date(termoDataInicio + 'T12:00:00').toLocaleDateString('pt-BR')} →{' '}
                      {(() => {
                        const d = new Date(termoDataInicio + 'T12:00:00');
                        d.setMonth(d.getMonth() + termoPrazo);
                        return d.toLocaleDateString('pt-BR');
                      })()}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => termoOrcamentoId ? setTermoEtapa(2) : setTermoEtapa(1)}
                      className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-medium text-sm hover:brightness-95 transition-all">
                      ← Voltar
                    </button>
                    <button
                      onClick={handleSalvarTermo}
                      disabled={termoSalvando || !termoProduto || !termoDataInicio}
                      className="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {termoSalvando ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Gerar Termo'}
                    </button>
                  </div>
                </div>
              )}

              {/* Etapa 4 — sucesso */}
              {termoEtapa === 4 && (
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400 rounded-full flex items-center justify-center mx-auto text-2xl">
                    ✅
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Termo Gerado com Sucesso!</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">O documento já pode ser baixado em PDF.</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => termoGarantia && baixarPdfTermo(termoGarantia.id)}
                      className="w-full py-3 bg-teal-600 text-white rounded-xl font-bold hover:bg-teal-700 transition-all flex items-center justify-center gap-2"
                    >
                      📥 Baixar Agora
                    </button>
                    <button
                      onClick={() => setModalTermo(false)}
                      className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:brightness-95 transition-all"
                    >
                      Fechar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal vincular orçamento */}
      {modalVincularOrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="font-black text-slate-900 dark:text-white text-lg">Vincular Orçamento</h3>
              <button onClick={() => setModalVincularOrc(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none">×</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {carregandoOrcsCondominio ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : orcamentosCondominio.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6 italic">
                  Nenhum orçamento encontrado para {condominio?.nome ?? 'este condomínio'}.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Orçamentos de <strong>{condominio?.nome}</strong>:
                  </p>
                  {orcamentosCondominio.map(orc => (
                    <button
                      key={orc.id}
                      onClick={() => handleVincularOrcamento(orc.id, orc.auvo_public_id)}
                      disabled={vinculandoOrc}
                      className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-all disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-600 dark:text-amber-400">#{orc.auvo_public_id}</span>
                        <span className="text-xs text-slate-500">{orc.request_date ? new Date(orc.request_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span>
                      </div>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5 truncate">{orc.customer_name || '—'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {Number(orc.net_total_value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        {orc.current_stage_description ? ` · ${orc.current_stage_description}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button onClick={() => setModalVincularOrc(false)}
                className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all text-sm hover:brightness-95">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal vincular OS manual */}
      {modalVincularOs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="font-black text-slate-900 dark:text-white text-lg">Vincular Ordem de Serviço</h3>
              <button onClick={() => setModalVincularOs(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-2xl leading-none">×</button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {carregandoOsDisponiveis ? (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : ordensDisponiveis.length === 0 ? (
                <div className="text-center py-10">
                   <p className="text-4xl mb-4">🔍</p>
                   <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                    Nenhuma Ordem de Serviço disponível para vinculação encontrada para <strong>{condominio?.nome}</strong>.
                   </p>
                   <p className="text-xs text-slate-400 mt-2">Certifique-se que a OS foi sincronizada e ainda não está vinculada a outro serviço.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 uppercase font-bold tracking-wider">
                    Ordens de Serviço Disponíveis ({condominio?.nome}):
                  </p>
                  {ordensDisponiveis.map(os => (
                    <button
                      key={os.id}
                      onClick={() => handleVincularOsManual(os.id)}
                      disabled={vinculandoOs}
                      className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/5 transition-all disabled:opacity-50 group"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-black text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">#{os.task_id}</span>
                        <span className="text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
                          {os.task_date ? new Date(os.task_date).toLocaleDateString('pt-BR') : '—'}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 line-clamp-1">{os.task_type_description || 'Sem tipo'}</p>
                      {os.report && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 italic">
                          {os.report}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-end">
                         <span className="text-[10px] font-black uppercase text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                           Vincular Agora <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                         </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <button onClick={() => setModalVincularOs(false)}
                className="w-full py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold transition-all text-sm hover:brightness-95">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
