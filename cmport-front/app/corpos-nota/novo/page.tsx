"use client"

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

const MESES_NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

interface ConfiguracaoInter {
  id: number;
  cnpj: string;
  razao_social: string | null;
  tipo_nota: string;
  ativo: boolean;
  numero_nf_servico: number | null;
  numero_nf_produto: number | null;
}

interface CondPendente {
  condominio_id: number;
  contrato_id: number | null;
  nome: string;
  descricao_contrato: string | null;  // ex: "Poste" — só preenchido quando há múltiplos contratos
  data_inicio_contrato: string | null;
  valor_fixo_mensal: number | null;
  dia_vencimento_padrao: number | null;
  descricao_padrao_servico: string | null;
}

interface OSItem {
  servico_id: number | null;
  numero_os: string | null;
  data_servico: string | null;
  descricao_preview: string;
  descricao_completa: string | null;
}

interface OSResultado {
  lista: OSItem[];
  preenchimento_manual: boolean;
}

interface OrcamentoItem {
  tipo: string;
  nome: string | null;
  descricao: string | null;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

interface Orcamento {
  id: number;
  auvo_public_id: number;
  observations: string | null;
  request_date: string | null;
  current_stage_description: string | null;
  total_services: number;
  total_products: number;
  gross_total_value: number;
  task_ids: number[];
  itens: OrcamentoItem[];
}

// ── Autocomplete de produto (busca na tabela de produtos Auvo) ─────────────────
function AutocompleteProduto({
  value,
  onChange,
  placeholder = 'Nome do produto',
}: {
  value: string;
  onChange: (nome: string) => void;
  placeholder?: string;
}) {
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const [aberto, setAberto] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = (q: string) => {
    onChange(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 2) { setSugestoes([]); setAberto(false); return; }
    debounce.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/produtos?search=${encodeURIComponent(q)}&page_size=8`);
        const nomes: string[] = (data.items || []).map((p: { nome: string }) => p.nome);
        setSugestoes(nomes);
        setAberto(nomes.length > 0);
      } catch {
        setSugestoes([]); setAberto(false);
      }
    }, 300);
  };

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={value}
        onChange={e => buscar(e.target.value)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={e => { if (e.key === 'Escape') setAberto(false); }}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
      />
      {aberto && sugestoes.length > 0 && (
        <ul className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg max-h-48 overflow-y-auto">
          {sugestoes.map(nome => (
            <li
              key={nome}
              onMouseDown={() => { onChange(nome); setSugestoes([]); setAberto(false); }}
              className="px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-violet-50 dark:hover:bg-violet-500/10 cursor-pointer"
            >
              {nome}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const LABELS_STEP_MANUT = ['Emitente', 'Condomínio', 'Origem', 'Dados', 'Confirmar'];
const LABELS_STEP_SERV  = ['Emitente', 'Condomínio', 'Origem', 'Dados', 'Parcelas', 'Confirmar'];
const TOTAL_STEPS_MANUT = 5;
const TOTAL_STEPS_SERV  = 6;

function StepIndicator({ atual, labels }: { atual: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
      {labels.map((label, idx) => {
        const n = idx + 1;
        const concluido = n < atual;
        const ativo = n === atual;
        return (
          <div key={n} className="flex items-center gap-1 shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-colors ${
                concluido ? 'bg-violet-600 text-white' :
                ativo    ? 'bg-violet-600 text-white ring-4 ring-violet-100 dark:ring-violet-500/20' :
                           'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                {concluido ? '✓' : n}
              </div>
              <span className={`text-[10px] font-semibold whitespace-nowrap ${
                ativo ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'
              }`}>{label}</span>
            </div>
            {n < labels.length && (
              <div className={`h-0.5 w-6 sm:w-10 mb-4 shrink-0 ${n < atual ? 'bg-violet-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function NovoCorpoNotaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const now = new Date();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Step 1 — Conta Inter + Tipo + Período
  const [configuracaosInter, setConfiguracaosInter] = useState<ConfiguracaoInter[]>([]);
  const [cnpjSelecionado, setCnpjSelecionado] = useState<ConfiguracaoInter | null>(null);
  const [carregandoInter, setCarregandoInter] = useState(false);
  const [tipoNota, setTipoNota] = useState('MANUTENCAO');
  const [mes, setMes] = useState(() => {
    const p = searchParams.get('mes');
    return p ? Number(p) : now.getMonth() + 1;
  });
  const [ano, setAno] = useState(() => {
    const p = searchParams.get('ano');
    return p ? Number(p) : now.getFullYear();
  });

  // Step 2 — Condomínio
  const [condsPendentes, setCondsPendentes] = useState<CondPendente[]>([]);
  const [buscandoConds, setBuscandoConds] = useState(false);
  const [condSelecionado, setCondSelecionado] = useState<CondPendente | null>(null);
  const [filtroCond, setFiltroCond] = useState('');

  // Step 3 — OS + Orçamento simultâneos
  const [osResultado, setOsResultado] = useState<OSResultado | null>(null);
  const [buscandoOS, setBuscandoOS] = useState(false);
  const [ossSelecionadas, setOssSelecionadas] = useState<OSItem[]>([]);   // multi-select
  const [servicoId, setServicoId] = useState<number | null>(null);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [buscandoOrcamentos, setBuscandoOrcamentos] = useState(false);
  const [orcamentoSelecionado, setOrcamentoSelecionado] = useState<Orcamento | null>(null);

  // Step 4 — Dados financeiros
  const [numeroOs, setNumeroOs] = useState('');
  const [dataServico, setDataServico] = useState('');
  const [descricaoServico, setDescricaoServico] = useState('');
  const [valorBruto, setValorBruto] = useState('');
  const [dataVencimento, setDataVencimento] = useState('');
  const [observacoes, setObservacoes] = useState('');
  // Campos específicos SERVIÇO / PRODUTO
  const [dataServicoTexto, setDataServicoTexto] = useState('');
  const [descricaoGarantia, setDescricaoGarantia] = useState('');
  const [valorNotaProduto, setValorNotaProduto] = useState('');
  const [temNotaProduto, setTemNotaProduto] = useState(false);
  // Produtos listados na nota
  const [listarProdutos, setListarProdutos] = useState(false);
  const [produtos, setProdutos] = useState<{nome: string; quantidade: string}[]>([]);
  // Garantia com prazo fixo + Termo automático no wizard
  const [prazoGarantia, setPrazoGarantia] = useState<3 | 6 | 12 | null>(null);
  const [showModalTermoWizard, setShowModalTermoWizard] = useState(false);
  const [termoWizardId, setTermoWizardId] = useState<number | null>(null);
  const [modalProdutoDesc, setModalProdutoDesc] = useState('');
  const [modalDataInicio, setModalDataInicio] = useState('');
  const [salvandoTermo, setSalvandoTermo] = useState(false);
  // Parcelas livres: cada uma tem valor + data
  const [parcelas, setParcelas] = useState<{valor: string; data: string}[]>([{valor:'',data:''}]);
  // Salvar novo valor no contrato ao confirmar
  const [salvarNoContrato, setSalvarNoContrato] = useState(false);

  // Toggle: omitir retenção de imposto no corpo da nota
  const [semRetencao, setSemRetencao] = useState(false);

  // Step 5 — Parcelas (impostos calculados no Step 4→5)
  const [impostosCalculados, setImpostosCalculados] = useState<{
    valor_liquido: number;
    percentual_inss: number; percentual_cofins: number; percentual_pis: number; percentual_csll: number;
    valor_inss: number; valor_cofins: number; valor_pis: number; valor_csll: number;
  } | null>(null);
  const [calculandoImpostos, setCalculandoImpostos] = useState(false);

  // Step 6 — Preview
  const [preview, setPreview] = useState<{
    conteudo_gerado: string;
    impostos_calculados: { valor_liquido: number } | null;
  } | null>(null);
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [proximoNumero, setProximoNumero] = useState<string | null>(null);

  // Carrega contas Inter na montagem
  useEffect(() => {
    const carregarInter = async () => {
      setCarregandoInter(true);
      try {
        const r = await api.get('/configuracoes/inter');
        const ativas = (r.data as ConfiguracaoInter[]).filter(c => c.ativo);
        setConfiguracaosInter(ativas);
      } catch {
        setConfiguracaosInter([]);
      } finally {
        setCarregandoInter(false);
      }
    };
    carregarInter();
  }, []);

  // Todos os emitentes ativos aparecem para qualquer tipo de nota
  const emitentesFiltratos = configuracaosInter;

  // Helper: próxima NF do emitente para o tipo atual
  const proximaNfEmitente = (c: ConfiguracaoInter): number | null =>
    tipoNota === 'PRODUTO' ? c.numero_nf_produto : c.numero_nf_servico;

  const fmtNf = (n: number) => String(n).padStart(9, '0').replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3');

  const buscarProximoNumero = async (tipo: string, anoRef: number) => {
    try {
      const r = await api.get('/corpos-nota/proximo-numero', { params: { tipo_nota: tipo, ano: anoRef } });
      setProximoNumero(r.data.numero_referencia);
    } catch {
      setProximoNumero(null);
    }
  };

  const buscarCondominios = async (tipoRef: string, anoRef: number, mesRef: number) => {
    setBuscandoConds(true);
    setCondsPendentes([]);
    setCondSelecionado(null);
    setFiltroCond('');
    try {
      const r = await api.get('/corpos-nota/condominios-pendentes', {
        params: { tipo_nota: tipoRef, ano: anoRef, mes: mesRef },
      });
      setCondsPendentes(r.data);
    } catch {
      setCondsPendentes([]);
    } finally {
      setBuscandoConds(false);
    }
  };

  // Ao mudar tipo, redefine emitente (respeitar filtro) e toggle produto
  useEffect(() => {
    setCnpjSelecionado(null);
    setTemNotaProduto(false);
    setValorNotaProduto('');
    setParcelas([{valor:'',data:''}]);
    setProdutos([]);
    setListarProdutos(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoNota]);

  // Auto-seleciona se só houver 1 emitente compatível
  useEffect(() => {
    if (emitentesFiltratos.length === 1) setCnpjSelecionado(emitentesFiltratos[0]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitentesFiltratos.length, tipoNota]);

  // Re-busca condomínios quando estiver no step 2 e mudar período ou tipo
  useEffect(() => {
    if (step === 2) {
      buscarCondominios(tipoNota, ano, mes);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mes, ano, tipoNota]);

  // ── Step 1 → 2 ──────────────────────────────────────────────────────────────
  const avancarStep1 = () => {
    if (!cnpjSelecionado) {
      setErro('Selecione o emitente (CNPJ) para continuar.');
      return;
    }
    setErro(null);
    buscarProximoNumero(tipoNota, ano);
    setStep(2);
  };

  // ── Step 2 → 3: condomínio selecionado, busca OSs ────────────────────────────
  const avancarStep2 = async (cond: CondPendente) => {
    setCondSelecionado(cond);
    setErro(null);

    if (cond.descricao_padrao_servico) setDescricaoServico(cond.descricao_padrao_servico);
    if (cond.valor_fixo_mensal) setValorBruto(String(cond.valor_fixo_mensal));
    if (cond.dia_vencimento_padrao) {
      const dia = String(cond.dia_vencimento_padrao).padStart(2, '0');
      // Vencimento é no mês seguinte ao período de referência
      const mesVenc = mes === 12 ? 1 : mes + 1;
      const anoVenc = mes === 12 ? ano + 1 : ano;
      setDataVencimento(`${anoVenc}-${String(mesVenc).padStart(2, '0')}-${dia}`);
    }

    await buscarOSsParaCond(cond);
    if (tipoNota !== 'MANUTENCAO') buscarOrcamentos(cond.condominio_id);
    setStep(3);
  };

  const buscarOSsParaCond = async (cond: CondPendente) => {
    setBuscandoOS(true);
    setOsResultado(null);
    setOssSelecionadas([]);
    setServicoId(null);
    try {
      const r = await api.get('/corpos-nota/buscar-os', {
        params: { condominio_id: cond.condominio_id, mes, ano, tipo_nota: tipoNota },
      });
      setOsResultado(r.data);
    } catch {
      setOsResultado({ lista: [], preenchimento_manual: true });
    } finally {
      setBuscandoOS(false);
    }
  };

  const buscarOrcamentos = async (condId: number) => {
    setBuscandoOrcamentos(true);
    setOrcamentos([]);
    try {
      const r = await api.get('/corpos-nota/buscar-orcamentos', {
        params: { condominio_id: condId },
      });
      setOrcamentos(r.data);
    } catch {
      setOrcamentos([]);
    } finally {
      setBuscandoOrcamentos(false);
    }
  };

  // ── Step 3 — toggle multi-select OS ────────────────────────────────────────
  const toggleOS = (os: OSItem) => {
    setOssSelecionadas(prev => {
      const jaEsta = prev.some(o => o.numero_os === os.numero_os);
      const novas = jaEsta ? prev.filter(o => o.numero_os !== os.numero_os) : [...prev, os];
      // Atualiza campos derivados
      const nums = novas.map(o => o.numero_os ? `OS nº ${o.numero_os}` : '').filter(Boolean);
      setNumeroOs(nums.join(' e '));
      const datas = novas.map(o => o.data_servico ? o.data_servico.split('-').reverse().join('.') : '').filter(Boolean);
      const datasUnicas = [...new Set(datas)];
      setDataServicoTexto(datasUnicas.join(' e '));
      // Para MANUTENCAO, pré-preenche o date picker com a data da primeira OS selecionada
      if (novas.length > 0 && novas[0].data_servico) setDataServico(novas[0].data_servico);
      else if (novas.length === 0) setDataServico('');
      if (novas.length === 1 && novas[0].descricao_completa) setDescricaoServico(novas[0].descricao_completa);
      if (novas.length === 1 && novas[0].servico_id) setServicoId(novas[0].servico_id);
      return novas;
    });
  };

  // ── Step 3 — selecionar Orçamento (radio com toggle-deselect) ──────────────
  const selecionarOrcamento = (orc: Orcamento) => {
    if (orcamentoSelecionado?.id === orc.id) {
      setOrcamentoSelecionado(null);
      return;
    }
    setOrcamentoSelecionado(orc);

    if (orc.task_ids.length > 0 && ossSelecionadas.length === 0) {
      setNumeroOs(orc.task_ids.map(id => `OS nº ${id}`).join(' e '));
    }
    const descItens = orc.itens
      .filter(i => i.tipo === 'SERVICO')
      .map(i => i.nome || i.descricao || '')
      .filter(Boolean)
      .join(', ');
    if (descItens) setDescricaoServico(descItens);
    if (orc.total_services > 0) setValorBruto(String(orc.total_services));
    if (orc.request_date) {
      setDataServicoTexto(orc.request_date.split('-').reverse().join('.'));
    }
    // Pré-preenche produtos do orçamento
    const prodOrc = orc.itens
      .filter(i => i.tipo === 'PRODUTO' && i.nome)
      .map(i => ({ nome: i.nome || '', quantidade: String(Math.round(i.quantidade || 1)) }));
    if (prodOrc.length > 0) {
      setProdutos(prodOrc);
      setListarProdutos(true);
    }
    // Nota de produto do orçamento
    if (orc.total_products > 0) {
      setValorNotaProduto(String(orc.total_products));
      setTemNotaProduto(true);
    }
  };

  const avancarStep3 = () => {
    setErro(null);
    setStep(4);
  };

  const selecionarPrazoGarantia = (meses: 3 | 6 | 12) => {
    if (prazoGarantia === meses) {
      setPrazoGarantia(null);
      setDescricaoGarantia('');
      return;
    }
    const desc = meses === 12 ? '1 ano' : `${meses} meses`;
    setPrazoGarantia(meses);
    setDescricaoGarantia(desc);
    if (servicoId) {
      const produtosDesc = produtos.filter(p => p.nome).map(p => `${p.quantidade}x ${p.nome}`).join(' · ');
      setModalProdutoDesc(produtosDesc || '');
      setModalDataInicio(dataServico || '');
      setShowModalTermoWizard(true);
    }
  };

  const salvarTermoWizard = async () => {
    if (!servicoId || !prazoGarantia) return;
    setSalvandoTermo(true);
    try {
      const dataFim = modalDataInicio
        ? (() => { const d = new Date(modalDataInicio + 'T00:00:00'); d.setMonth(d.getMonth() + prazoGarantia); return d.toISOString().split('T')[0]; })()
        : null;
      const r = await api.post('/termos-garantia/', {
        servico_id: servicoId,
        produto_descricao: modalProdutoDesc,
        prazo_meses: prazoGarantia,
        data_inicio: modalDataInicio || null,
        data_fim: dataFim,
        orcamento_id: orcamentoSelecionado?.id || null,
      });
      setTermoWizardId(r.data.id);
      setShowModalTermoWizard(false);
    } catch {
      setErro('Erro ao salvar Termo de Garantia.');
    } finally {
      setSalvandoTermo(false);
    }
  };

  // helper para montar o payload base (sem parcelas)
  const payloadBase = () => {
    const mesRef = `${String(mes).padStart(2, '0')}/${ano}`;
    return {
      condominio_id: condSelecionado!.condominio_id,
      tipo_nota: tipoNota,
      mes_referencia: mesRef,
      numero_os: numeroOs || null,
      data_servico: dataServico || null,
      descricao_servico: descricaoServico,
      valor_bruto: Number(valorBruto),
      data_vencimento: (tipoNota === 'SERVICO' || tipoNota === 'PRODUTO') && parcelas[0]?.data
        ? parcelas[0].data : dataVencimento,
      observacoes: observacoes || null,
      data_servico_texto: (tipoNota === 'SERVICO' || tipoNota === 'PRODUTO') ? (dataServicoTexto || null) : null,
      descricao_garantia: (tipoNota === 'SERVICO' || tipoNota === 'PRODUTO') ? (descricaoGarantia || null) : null,
      valor_nota_produto: tipoNota === 'SERVICO' && temNotaProduto && valorNotaProduto ? Number(valorNotaProduto) : null,
      numero_nf: cnpjSelecionado ? (tipoNota === 'PRODUTO' ? cnpjSelecionado.numero_nf_produto : cnpjSelecionado.numero_nf_servico) : null,
      produtos_json: listarProdutos && produtos.filter(p => p.nome).length > 0
        ? produtos.filter(p => p.nome).map(p => ({nome: p.nome, quantidade: Number(p.quantidade) || 1}))
        : null,
      termo_garantia_id: termoWizardId || null,
      sem_retencao: semRetencao,
    };
  };

  // ── Step 4 → 5: calcula impostos (SERVICO/PRODUTO) ou gera preview direto (MANUTENCAO)
  const avancarStep4 = async () => {
    if (!valorBruto || !descricaoServico) {
      setErro('Preencha valor bruto e descrição do serviço.');
      return;
    }
    if (tipoNota === 'MANUTENCAO' && !dataVencimento) {
      setErro('Preencha a data de vencimento.');
      return;
    }
    setErro(null);

    if (tipoNota === 'MANUTENCAO') {
      // Manutenção vai direto para o preview (step 5 = confirm)
      setGerandoPreview(true);
      try {
        const r = await api.post('/corpos-nota/preview', { ...payloadBase(), numero_parcelas: 1 });
        setPreview(r.data);
        setStep(5);
      } catch (e: unknown) {
        const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setErro(msg || 'Erro ao gerar preview.');
      } finally {
        setGerandoPreview(false);
      }
      return;
    }

    // SERVICO ou PRODUTO → calcula impostos e vai para step 5 (parcelas)
    setCalculandoImpostos(true);
    try {
      const r = await api.post('/corpos-nota/preview', { ...payloadBase(), numero_parcelas: 1 });
      if (r.data.impostos_calculados) {
        setImpostosCalculados(r.data.impostos_calculados);
      }
      setStep(5);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao calcular impostos.');
    } finally {
      setCalculandoImpostos(false);
    }
  };

  // ── Step 5 → 6: gera preview final com parcelas (SERVICO/PRODUTO)
  const gerarPreview = async () => {
    const temParcelas = parcelas.some(p => p.valor && p.data);
    if (!temParcelas) {
      setErro('Adicione ao menos uma parcela com valor e data de vencimento.');
      return;
    }
    setErro(null);
    setGerandoPreview(true);
    try {
      const parcelasPayload = parcelas.filter(p => p.valor && p.data).map(p => ({valor: Number(p.valor), data: p.data}));
      const r = await api.post('/corpos-nota/preview', {
        ...payloadBase(),
        numero_parcelas: parcelasPayload.length,
        parcelas_json: parcelasPayload,
      });
      setPreview(r.data);
      setStep(6);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao gerar preview.');
    } finally {
      setGerandoPreview(false);
    }
  };

  // ── Confirmar criação (step 5 para MANUTENCAO, step 6 para SERVICO/PRODUTO)
  const confirmar = async () => {
    setLoading(true);
    setErro(null);
    const parcelasPayload = tipoNota !== 'MANUTENCAO'
      ? parcelas.filter(p => p.valor && p.data).map(p => ({valor: Number(p.valor), data: p.data}))
      : null;
    try {
      const r = await api.post('/corpos-nota', {
        ...payloadBase(),
        mes,
        ano,
        contrato_id: condSelecionado?.contrato_id ?? null,
        servico_id: servicoId || null,
        configuracao_inter_id: cnpjSelecionado?.id ?? null,
        orcamento_id: orcamentoSelecionado?.id ?? null,
        numero_parcelas: parcelasPayload ? parcelasPayload.length : 1,
        parcelas_json: parcelasPayload,
      });

      // Atualiza o valor fixo mensal do contrato se solicitado
      if (salvarNoContrato && condSelecionado?.contrato_id && valorBruto) {
        try {
          await api.patch(`/contratos/${condSelecionado.contrato_id}`, {
            valor_fixo_mensal: Number(valorBruto),
          });
        } catch {
          // Não bloqueia o fluxo — corpo já foi criado
        }
      }

      router.push(`/corpos-nota/${r.data.id}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setErro(msg || 'Erro ao criar corpo de nota.');
    } finally {
      setLoading(false);
    }
  };

  const voltar = () => { setErro(null); setStep(s => s - 1); };

  const fmtValor = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const condsFiltrados = condsPendentes.filter(c =>
    filtroCond === '' || c.nome.toLowerCase().includes(filtroCond.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-6">
          <div className="flex items-center gap-3">
            <Link href="/corpos-nota" className="text-slate-500 hover:text-violet-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                Novo Corpo de Nota
              </h1>
              <p className="text-xs text-slate-500">Passo {step} de {tipoNota === 'MANUTENCAO' ? TOTAL_STEPS_MANUT : TOTAL_STEPS_SERV}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm">
          <StepIndicator
            atual={step}
            labels={tipoNota === 'MANUTENCAO' ? LABELS_STEP_MANUT : LABELS_STEP_SERV}
          />

          {/* ── STEP 1 — Conta Inter + Tipo de nota + Período ──────────────── */}
          {step === 1 && (
            <div className="space-y-6">

              {/* Seleção de CNPJ */}
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white mb-1">Emitente da Nota</h2>
                <p className="text-sm text-slate-500 mb-3">Selecione o CNPJ que aparecerá como emitente</p>

                {carregandoInter ? (
                  <div className="text-slate-400 text-sm animate-pulse">Carregando emitentes...</div>
                ) : emitentesFiltratos.length === 0 ? (
                  <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-sm text-amber-700 dark:text-amber-400">
                    Nenhum emitente cadastrado para tipo {tipoNota === 'PRODUTO' ? 'Produto' : 'Serviço/Manutenção'}. Cadastre em Configurações → Banco Inter.
                  </div>
                ) : emitentesFiltratos.length === 1 ? (
                  <div className="bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-700 rounded-xl p-4">
                    <div className="font-bold text-violet-700 dark:text-violet-400 text-sm">
                      {emitentesFiltratos[0].razao_social || emitentesFiltratos[0].cnpj}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{emitentesFiltratos[0].cnpj}</div>
                    {proximaNfEmitente(emitentesFiltratos[0]) != null && (
                      <div className="text-xs font-mono text-violet-600 dark:text-violet-400 mt-1">
                        Próxima NF: {fmtNf(proximaNfEmitente(emitentesFiltratos[0])!)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {emitentesFiltratos.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCnpjSelecionado(c)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          cnpjSelecionado?.id === c.id
                            ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                            : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                        }`}
                      >
                        <div className={`font-bold text-sm ${cnpjSelecionado?.id === c.id ? 'text-violet-700 dark:text-violet-400' : 'text-slate-800 dark:text-white'}`}>
                          {c.razao_social || c.cnpj}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{c.cnpj}</div>
                        {proximaNfEmitente(c) != null && (
                          <div className="text-xs font-mono text-violet-600 dark:text-violet-400 mt-0.5">
                            NF: {fmtNf(proximaNfEmitente(c)!)}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Tipo de Nota */}
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white mb-3">Tipo de Nota</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => setTipoNota('MANUTENCAO')}
                    className={`p-5 rounded-2xl border-2 text-left transition-all ${
                      tipoNota === 'MANUTENCAO'
                        ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                    }`}
                  >
                    <div className="text-2xl mb-2">🛠️</div>
                    <div className={`font-bold text-sm ${tipoNota === 'MANUTENCAO' ? 'text-violet-700 dark:text-violet-400' : 'text-slate-800 dark:text-white'}`}>
                      Manutenção
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Serviços mensais de manutenção predial</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTipoNota('SERVICO')}
                    className={`p-5 rounded-2xl border-2 text-left transition-all ${
                      tipoNota === 'SERVICO'
                        ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                    }`}
                  >
                    <div className="text-2xl mb-2">🔧</div>
                    <div className={`font-bold text-sm ${tipoNota === 'SERVICO' ? 'text-violet-700 dark:text-violet-400' : 'text-slate-800 dark:text-white'}`}>
                      Serviço
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Serviços executados sob demanda</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setTipoNota('PRODUTO')}
                    className={`p-5 rounded-2xl border-2 text-left transition-all ${
                      tipoNota === 'PRODUTO'
                        ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                        : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                    }`}
                  >
                    <div className="text-2xl mb-2">📦</div>
                    <div className={`font-bold text-sm ${tipoNota === 'PRODUTO' ? 'text-violet-700 dark:text-violet-400' : 'text-slate-800 dark:text-white'}`}>
                      Produto
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Nota de produto para clientes com contrato</div>
                  </button>
                </div>
              </div>

              {/* Período de referência */}
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                  Período de Referência
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <select
                    value={mes}
                    onChange={e => setMes(Number(e.target.value))}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {MESES_NOMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                  <input
                    type="number"
                    value={ano}
                    onChange={e => setAno(Number(e.target.value))}
                    min={2020}
                    max={2099}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <button
                onClick={avancarStep1}
                className="w-full py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors"
              >
                Próximo →
              </button>
            </div>
          )}

          {/* ── STEP 2 — Condomínio pendente ──────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-black text-slate-800 dark:text-white">Selecionar Condomínio</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Com contrato ativo sem corpo em {MESES_NOMES[mes - 1]}/{ano}
                  </p>
                </div>
                {/* Alteração rápida de período */}
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={mes}
                    onChange={e => setMes(Number(e.target.value))}
                    className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  >
                    {MESES_NOMES.map((m, i) => <option key={i + 1} value={i + 1}>{m.slice(0, 3)}</option>)}
                  </select>
                  <input
                    type="number"
                    value={ano}
                    onChange={e => setAno(Number(e.target.value))}
                    min={2020}
                    max={2099}
                    className="w-[5.5rem] px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Filtro por nome */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={filtroCond}
                  onChange={e => setFiltroCond(e.target.value)}
                  placeholder="Filtrar por nome do condomínio..."
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  autoFocus
                />
                {filtroCond && (
                  <button
                    onClick={() => setFiltroCond('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {buscandoConds ? (
                <div className="text-slate-400 text-sm animate-pulse py-8 text-center">Buscando condomínios pendentes...</div>
              ) : condsPendentes.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-3xl mb-3">✅</div>
                  <div className="font-semibold text-slate-700 dark:text-white mb-1">
                    Todos os condomínios já possuem corpo de nota em {MESES_NOMES[mes - 1]}/{ano}
                  </div>
                  <div className="text-sm text-slate-500">Ou não há contratos ativos cadastrados.</div>
                </div>
              ) : condsFiltrados.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-sm">
                  Nenhum condomínio encontrado para &quot;{filtroCond}&quot;
                </div>
              ) : (
                <>
                  <div className="text-xs text-slate-500 font-medium">
                    {condsFiltrados.length} de {condsPendentes.length} condomínio(s)
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {condsFiltrados.map(c => (
                      <button
                        key={`${c.condominio_id}-${c.contrato_id ?? 'x'}`}
                        type="button"
                        onClick={() => avancarStep2(c)}
                        className="p-4 rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-violet-400 dark:hover:border-violet-500 text-left transition-all group"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-white group-hover:text-violet-700 dark:group-hover:text-violet-400 transition-colors">
                            {c.nome}
                          </span>
                          {c.descricao_contrato && (
                            <span className="px-2 py-0.5 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 text-[10px] font-bold rounded-full uppercase tracking-wide">
                              {c.descricao_contrato}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex gap-3 flex-wrap">
                          {c.data_inicio_contrato && (
                            <span>Desde {c.data_inicio_contrato.slice(0, 7).split('-').reverse().join('/')}</span>
                          )}
                          {c.valor_fixo_mensal && (
                            <span className="text-violet-600 font-semibold">{fmtValor(c.valor_fixo_mensal)}</span>
                          )}
                          {c.dia_vencimento_padrao && (
                            <span>Vence dia {c.dia_vencimento_padrao}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="flex gap-3">
                <button onClick={voltar} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  ← Voltar
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3 — Origem: OS + Orçamento simultâneos ─────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">
                  {tipoNota === 'SERVICO' ? 'Origem dos Dados' : 'Ordem de Serviço'}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {condSelecionado?.nome} · {MESES_NOMES[mes - 1]}/{ano}
                </p>
              </div>

              {/* Bloco OS — sempre visível */}
              <>
                {buscandoOS && (
                  <div className="text-slate-400 text-sm animate-pulse py-4 text-center">Buscando OSs...</div>
                )}
                {osResultado && !buscandoOS && (
                  <>
                    {osResultado.lista.length === 0 ? (
                      <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                        <div className="font-bold text-slate-700 dark:text-slate-300 text-sm mb-1">Nenhuma OS sincronizada para este condomínio</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Digite o número da OS no campo abaixo e prossiga.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center justify-between">
                          <span>{osResultado.lista.length} OS(s) encontrada(s) — selecione uma ou mais:</span>
                          {ossSelecionadas.length > 0 && (
                            <span className="text-violet-600 dark:text-violet-400">{ossSelecionadas.length} selecionada(s)</span>
                          )}
                        </div>
                        {osResultado.lista.map(os => {
                          const marcada = ossSelecionadas.some(o => o.numero_os === os.numero_os);
                          return (
                            <button
                              key={os.numero_os ?? String(os.servico_id)}
                              type="button"
                              onClick={() => toggleOS(os)}
                              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                                marcada
                                  ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                                  : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${marcada ? 'bg-violet-600 border-violet-600' : 'border-slate-300 dark:border-slate-600'}`}>
                                  {marcada && <span className="text-white text-[10px] font-black">✓</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm text-slate-900 dark:text-white">
                                    OS #{os.numero_os ?? '—'}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5 flex gap-3">
                                    {os.data_servico && <span>{os.data_servico.split('-').reverse().join('/')}</span>}
                                    <span className="truncate">{os.descricao_preview}</span>
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
                {tipoNota === 'MANUTENCAO' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                      {osResultado?.lista.length === 0 ? 'Número da OS — digite para continuar' : 'Número da OS (opcional)'}
                    </label>
                    <input
                      type="text"
                      value={numeroOs}
                      onChange={e => setNumeroOs(e.target.value)}
                      placeholder="Ex: 73787278"
                      className={`w-full px-4 py-3 border rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white ${
                        osResultado?.lista.length === 0
                          ? 'border-violet-400 dark:border-violet-600 ring-2 ring-violet-100 dark:ring-violet-500/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                      autoFocus={osResultado?.lista.length === 0}
                    />
                  </div>
                )}
              </>

              {/* Bloco Orçamento — SERVIÇO e PRODUTO, sempre visível */}
              {tipoNota !== 'MANUTENCAO' && (
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide flex items-center gap-2">
                    <span>Orçamento (opcional)</span>
                    {orcamentoSelecionado && (
                      <span className="text-violet-600 dark:text-violet-400 normal-case font-normal">
                        · Orç. #{orcamentoSelecionado.auvo_public_id} selecionado
                      </span>
                    )}
                  </div>
                  {buscandoOrcamentos && (
                    <div className="text-slate-400 text-sm animate-pulse py-4 text-center">Buscando orçamentos...</div>
                  )}
                  {!buscandoOrcamentos && orcamentos.length === 0 && (
                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-sm text-slate-500">
                      Nenhum orçamento encontrado para este condomínio.
                    </div>
                  )}
                  {orcamentos.map(orc => (
                    <button
                      key={orc.id}
                      type="button"
                      onClick={() => selecionarOrcamento(orc)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        orcamentoSelecionado?.id === orc.id
                          ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10'
                          : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full border-2 shrink-0 ${orcamentoSelecionado?.id === orc.id ? 'bg-violet-600 border-violet-600' : 'border-slate-300 dark:border-slate-600'}`} />
                          <div className="font-bold text-sm text-slate-900 dark:text-white">
                            Orç. #{orc.auvo_public_id}
                          </div>
                        </div>
                        <div className="text-sm font-black text-violet-700 dark:text-violet-400">
                          {fmtValor(orc.total_services)}
                        </div>
                      </div>
                      {orc.observations && (
                        <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 ml-7 line-clamp-2">{orc.observations}</div>
                      )}
                      <div className="text-xs text-slate-400 mt-1 ml-7 flex gap-3">
                        {orc.request_date && <span>{orc.request_date.split('-').reverse().join('/')}</span>}
                        {orc.current_stage_description && <span>{orc.current_stage_description}</span>}
                        {orc.task_ids.length > 0 && <span>{orc.task_ids.length} OS(s)</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Campo texto OS — sempre visível para SERVIÇO e PRODUTO */}
              {tipoNota !== 'MANUTENCAO' && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Número(s) da OS — texto livre
                  </label>
                  <input
                    type="text"
                    value={numeroOs}
                    onChange={e => setNumeroOs(e.target.value)}
                    placeholder="Ex: OS nº 73787278 e OS nº 74220219"
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  <p className="text-xs text-slate-500 mt-1">Você pode digitar múltiplos números separados por &quot;e&quot;.</p>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={voltar} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  ← Voltar
                </button>
                <button onClick={avancarStep3} className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors">
                  Próximo →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4 — Dados financeiros ────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">Dados do Corpo de Nota</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {condSelecionado?.nome} · {MESES_NOMES[mes - 1]}/{ano}
                  {condSelecionado?.valor_fixo_mensal
                    ? ` · Valor padrão: ${fmtValor(condSelecionado.valor_fixo_mensal)}`
                    : ''}
                </p>
              </div>

              {/* Data do Serviço — MANUTENCAO usa date picker; SERVIÇO e PRODUTO usam texto livre */}
              {tipoNota === 'SERVICO' || tipoNota === 'PRODUTO' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Data(s) do Serviço (texto)
                  </label>
                  <input
                    type="text"
                    value={dataServicoTexto}
                    onChange={e => setDataServicoTexto(e.target.value)}
                    placeholder="Ex: 14.05.2026"
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Data do Serviço
                  </label>
                  <input
                    type="date"
                    value={dataServico}
                    onChange={e => setDataServico(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                  Descrição do Serviço <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={descricaoServico}
                  onChange={e => setDescricaoServico(e.target.value)}
                  rows={3}
                  placeholder="Descreva os serviços prestados..."
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Valor Bruto (R$) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={valorBruto}
                    onChange={e => { setValorBruto(e.target.value); setSalvarNoContrato(false); }}
                    placeholder="0,00"
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                  {tipoNota === 'MANUTENCAO' && condSelecionado?.contrato_id && valorBruto &&
                   Number(valorBruto) !== condSelecionado.valor_fixo_mensal && (
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={salvarNoContrato}
                        onChange={e => setSalvarNoContrato(e.target.checked)}
                        className="w-4 h-4 rounded accent-violet-600"
                      />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Salvar como novo valor padrão do contrato
                      </span>
                    </label>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                    Vencimento <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dataVencimento}
                    onChange={e => setDataVencimento(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Garantia — SERVIÇO e PRODUTO */}
              {(tipoNota === 'SERVICO' || tipoNota === 'PRODUTO') && (
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wide">
                    Garantia (opcional)
                  </label>
                  <div className="flex gap-2">
                    {([3, 6, 12] as const).map(meses => (
                      <button
                        key={meses}
                        type="button"
                        onClick={() => selecionarPrazoGarantia(meses)}
                        className={`flex-1 py-2.5 text-sm font-bold rounded-xl border-2 transition-all ${
                          prazoGarantia === meses
                            ? 'border-violet-600 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-violet-300'
                        }`}
                      >
                        {meses === 12 ? '1 ano' : `${meses} meses`}
                      </button>
                    ))}
                  </div>
                  {prazoGarantia && !servicoId && (
                    <p className="text-xs text-slate-500 mt-2">
                      Vincule uma OS no passo anterior para gerar o Termo automaticamente.
                    </p>
                  )}
                  {termoWizardId && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Termo #{termoWizardId} gerado</span>
                      <button type="button" onClick={() => setShowModalTermoWizard(true)} className="text-xs text-violet-600 underline">editar</button>
                    </div>
                  )}
                  {prazoGarantia && servicoId && !termoWizardId && (
                    <button type="button" onClick={() => { setModalProdutoDesc(produtos.filter(p=>p.nome).map(p=>`${p.quantidade}x ${p.nome}`).join(' · ')); setModalDataInicio(dataServico||''); setShowModalTermoWizard(true); }} className="mt-2 text-xs text-violet-600 underline">
                      Pré-gerar Termo de Garantia
                    </button>
                  )}
                </div>
              )}

              {/* Lista de produtos na nota — SERVIÇO e PRODUTO */}
              {(tipoNota === 'SERVICO' || tipoNota === 'PRODUTO') && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <label className="flex items-center gap-3 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={listarProdutos}
                      onChange={e => {
                        setListarProdutos(e.target.checked);
                        if (!e.target.checked) setProdutos([]);
                        else if (produtos.length === 0) setProdutos([{nome:'',quantidade:'1'}]);
                      }}
                      className="w-4 h-4 rounded accent-violet-600"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Listar produtos na nota?</span>
                  </label>
                  {listarProdutos && (
                    <div className="space-y-2">
                      {produtos.map((p, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            type="number"
                            min="1"
                            value={p.quantidade}
                            onChange={e => setProdutos(prev => prev.map((x,j) => j===i ? {...x,quantidade:e.target.value} : x))}
                            placeholder="Qtd"
                            className="w-16 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white text-center"
                          />
                          <AutocompleteProduto
                            value={p.nome}
                            onChange={nome => setProdutos(prev => prev.map((x,j) => j===i ? {...x,nome} : x))}
                          />
                          <button type="button" onClick={() => setProdutos(prev => prev.filter((_,j) => j!==i))}
                            className="text-red-400 hover:text-red-600 text-lg font-bold w-8 shrink-0">×</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => setProdutos(prev => [...prev, {nome:'',quantidade:'1'}])}
                        className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-semibold">
                        + Adicionar produto
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Toggle nota de produto — só SERVIÇO */}
              {tipoNota === 'SERVICO' && (
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={temNotaProduto}
                      onChange={e => {
                        setTemNotaProduto(e.target.checked);
                        if (!e.target.checked) setValorNotaProduto('');
                      }}
                      className="w-4 h-4 rounded accent-violet-600"
                    />
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Tem nota de produto junto?</span>
                  </label>
                  {temNotaProduto && (
                    <div className="mt-3">
                      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                        Valor da Nota de Produto (R$) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={valorNotaProduto}
                        onChange={e => setValorNotaProduto(e.target.value)}
                        placeholder="0,00"
                        className="w-full px-4 py-3 border border-violet-400 dark:border-violet-600 ring-2 ring-violet-100 dark:ring-violet-500/20 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">Observações</label>
                <textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
                />
              </div>

              {(tipoNota === 'MANUTENCAO' || tipoNota === 'SERVICO') && (
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={semRetencao}
                    onChange={e => setSemRetencao(e.target.checked)}
                    className="rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                  />
                  <span className="text-slate-700 dark:text-slate-300">Sem retenção de imposto</span>
                </label>
              )}

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <div className="flex gap-3">
                <button onClick={voltar} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  ← Voltar
                </button>
                <button
                  onClick={avancarStep4}
                  disabled={calculandoImpostos || gerandoPreview}
                  className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-50"
                >
                  {(calculandoImpostos || gerandoPreview) ? 'Calculando...' : 'Próximo →'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 5 — Parcelas (só SERVICO / PRODUTO) ─────────────────────── */}
          {step === 5 && tipoNota !== 'MANUTENCAO' && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-black text-slate-800 dark:text-white">Parcelamento</h2>
                <p className="text-sm text-slate-500 mt-1">{condSelecionado?.nome}</p>
              </div>

              {/* Resumo financeiro */}
              {(impostosCalculados || semRetencao) && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      {tipoNota === 'PRODUTO' ? 'Valor da nota de produto' : semRetencao ? 'Valor total serviço' : 'Valor bruto serviço'}
                    </span>
                    <span className="font-semibold">{fmtValor(Number(valorBruto))}</span>
                  </div>
                  {tipoNota !== 'PRODUTO' && !semRetencao && impostosCalculados && (
                    <>
                      {impostosCalculados.valor_inss > 0 && (
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>INSS {impostosCalculados.percentual_inss}%</span>
                          <span>− {fmtValor(impostosCalculados.valor_inss)}</span>
                        </div>
                      )}
                      {impostosCalculados.valor_cofins > 0 && (
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>COFINS {impostosCalculados.percentual_cofins}%</span>
                          <span>− {fmtValor(impostosCalculados.valor_cofins)}</span>
                        </div>
                      )}
                      {impostosCalculados.valor_pis > 0 && (
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>PIS {impostosCalculados.percentual_pis}%</span>
                          <span>− {fmtValor(impostosCalculados.valor_pis)}</span>
                        </div>
                      )}
                      {impostosCalculados.valor_csll > 0 && (
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>CSLL {impostosCalculados.percentual_csll}%</span>
                          <span>− {fmtValor(impostosCalculados.valor_csll)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1.5">
                        <span className="text-slate-600 dark:text-slate-300 font-semibold">Líquido serviço</span>
                        <span className="font-bold text-violet-700 dark:text-violet-400">{fmtValor(impostosCalculados.valor_liquido)}</span>
                      </div>
                    </>
                  )}
                  {temNotaProduto && valorNotaProduto && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Valor nota produto</span>
                        <span className="font-semibold">{fmtValor(Number(valorNotaProduto))}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1.5">
                        <span className="font-bold text-slate-800 dark:text-white">Total do boleto</span>
                        <span className="font-black text-violet-700 dark:text-violet-400 text-base">
                          {fmtValor((semRetencao ? Number(valorBruto) : (impostosCalculados?.valor_liquido ?? 0)) + Number(valorNotaProduto))}
                        </span>
                      </div>
                    </>
                  )}
                  {!temNotaProduto && tipoNota !== 'PRODUTO' && (
                    <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1.5">
                      <span className="font-bold text-slate-800 dark:text-white">Total do boleto</span>
                      <span className="font-black text-violet-700 dark:text-violet-400 text-base">
                        {fmtValor(semRetencao ? Number(valorBruto) : (impostosCalculados?.valor_liquido ?? 0))}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Editor de parcelas */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                    Definir Parcelas
                  </label>
                  <button type="button"
                    onClick={() => setParcelas(prev => [...prev, {valor:'',data:''}])}
                    className="text-xs text-violet-600 dark:text-violet-400 hover:underline font-semibold">
                    + Parcela
                  </button>
                </div>
                <div className="space-y-2">
                  {parcelas.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="text-xs text-slate-500 w-5 shrink-0 font-bold">{i+1}ª</span>
                      <input
                        type="number" step="0.01" min="0"
                        value={p.valor}
                        onChange={e => setParcelas(prev => prev.map((x,j) => j===i ? {...x,valor:e.target.value} : x))}
                        placeholder="Valor R$"
                        className="flex-1 px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                      />
                      <input
                        type="date"
                        value={p.data}
                        onChange={e => setParcelas(prev => prev.map((x,j) => j===i ? {...x,data:e.target.value} : x))}
                        className="flex-1 px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                      />
                      {parcelas.length > 1 && (
                        <button type="button" onClick={() => setParcelas(prev => prev.filter((_,j) => j!==i))}
                          className="text-red-400 hover:text-red-600 text-lg font-bold w-8 shrink-0">×</button>
                      )}
                    </div>
                  ))}
                </div>
                {/* Validação da soma */}
                {(() => {
                  const soma = parcelas.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
                  const liquido = tipoNota === 'PRODUTO'
                    ? Number(valorBruto)
                    : semRetencao ? Number(valorBruto) : (impostosCalculados?.valor_liquido ?? 0);
                  const total = liquido + (temNotaProduto && valorNotaProduto ? Number(valorNotaProduto) : 0);
                  const diff = Math.abs(soma - total);
                  if (soma === 0 || total === 0) return null;
                  return (
                    <div className={`mt-2 text-xs flex justify-between px-1 ${diff > 0.01 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                      <span>Soma das parcelas: {fmtValor(soma)}</span>
                      <span>{diff > 0.01 ? `Diferença: ${fmtValor(diff)}` : '✓ Soma correta'}</span>
                    </div>
                  );
                })()}
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <div className="flex gap-3">
                <button onClick={voltar} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  ← Voltar
                </button>
                <button
                  onClick={gerarPreview}
                  disabled={gerandoPreview}
                  className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-50"
                >
                  {gerandoPreview ? 'Gerando...' : 'Prévia →'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 5 (MANUTENCAO) / STEP 6 (SERVICO/PRODUTO) — Preview e confirmação */}
          {((step === 5 && tipoNota === 'MANUTENCAO') || step === 6) && preview && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-slate-800 dark:text-white">Confirmar Corpo de Nota</h2>
                {proximoNumero && (
                  <span className="px-3 py-1.5 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 text-xs font-black rounded-lg tracking-widest">
                    {proximoNumero}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-1">Valor Bruto</div>
                  <div className="text-xl font-black text-slate-900 dark:text-white">
                    {fmtValor(Number(valorBruto))}
                  </div>
                </div>
                <div className="bg-violet-50 dark:bg-violet-500/10 rounded-xl p-4">
                  <div className="text-xs text-violet-600 dark:text-violet-400 uppercase font-bold mb-1">{semRetencao ? 'Valor Total' : 'Valor Líquido'}</div>
                  <div className="text-xl font-black text-violet-700 dark:text-violet-400">
                    {semRetencao
                      ? fmtValor(Number(valorBruto))
                      : preview.impostos_calculados
                        ? fmtValor(preview.impostos_calculados.valor_liquido)
                        : '—'}
                  </div>
                </div>
              </div>

              {/* Conta selecionada */}
              {cnpjSelecionado && (
                <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold mb-0.5">Emitente</div>
                    <div className="font-semibold text-sm text-slate-800 dark:text-white">{cnpjSelecionado.razao_social || cnpjSelecionado.cnpj}</div>
                    <div className="text-xs text-slate-500">{cnpjSelecionado.cnpj}</div>
                  </div>
                  {proximaNfEmitente(cnpjSelecionado) != null && (
                    <div className="text-right">
                      <div className="text-xs text-slate-400 uppercase font-bold mb-0.5">NF prevista</div>
                      <div className="font-mono font-bold text-violet-700 dark:text-violet-400 text-sm">
                        {fmtNf(proximaNfEmitente(cnpjSelecionado)!)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Corpo da Nota (prévia)
                </div>
                <pre className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                  {preview.conteudo_gerado}
                </pre>
              </div>

              {erro && <p className="text-sm text-red-600 bg-red-50 dark:bg-red-500/10 rounded-xl p-3">{erro}</p>}

              <div className="flex gap-3">
                <button onClick={voltar} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors">
                  ← Voltar
                </button>
                <button
                  onClick={confirmar}
                  disabled={loading}
                  className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-50 shadow-lg shadow-violet-600/20"
                >
                  {loading ? 'Criando...' : '✓ Confirmar e Criar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Modal Termo de Garantia — wizard */}
      {showModalTermoWizard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-800 dark:text-white">Termo de Garantia</h3>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                Produtos / Serviços Garantidos
              </label>
              <textarea
                value={modalProdutoDesc}
                onChange={e => setModalProdutoDesc(e.target.value)}
                rows={3}
                placeholder="Ex: 3x Motor MKN · 2x Manta asfáltica"
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-none"
              />
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
              Prazo: <span className="font-bold text-violet-700 dark:text-violet-400">
                {prazoGarantia === 12 ? '1 ano' : `${prazoGarantia} meses`}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wide">
                Data de início da garantia
              </label>
              <input
                type="date"
                value={modalDataInicio}
                onChange={e => setModalDataInicio(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
              <p className="text-xs text-slate-500 mt-1">Deixe vazio se a execução ainda não ocorreu.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModalTermoWizard(false)}
                className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                Pular por agora
              </button>
              <button
                type="button"
                onClick={salvarTermoWizard}
                disabled={salvandoTermo || !modalProdutoDesc.trim()}
                className="flex-1 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-colors disabled:opacity-60"
              >
                {salvandoTermo ? 'Salvando...' : 'Salvar Termo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NovoCorpoNotaPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-400">
        Carregando...
      </div>
    }>
      <NovoCorpoNotaContent />
    </Suspense>
  );
}
