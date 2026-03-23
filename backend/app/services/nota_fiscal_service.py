from sqlalchemy.orm import Session
from typing import List, Optional
from fastapi import HTTPException, UploadFile
from datetime import datetime, date
import xml.etree.ElementTree as ET
import zipfile
import io
import re
import json

from app.repositories.nota_fiscal_repository import NotaFiscalRepository
from app.schemas.nota_fiscal_schema import NotaFiscalCreate, NotaFiscalResponse, NotaFiscalImportada, NotaFiscalUpdate
from app.schemas.servico_schema import ServicoCreate
from app.services.servico_service import ServicoService
from app.models.servico_model import ManutencaoAssistencia
from app.models.nota_fiscal_model import TipoNota, StatusNota


def limpar_cnpj(cnpj: str) -> str:
    return "".join(filter(str.isdigit, cnpj or ""))


def parse_date(data_str: str) -> date:
    if not data_str:
        return date.today()
    data_limpa = data_str.split('T')[0]
    return datetime.strptime(data_limpa, '%Y-%m-%d').date()


def find_text(root, xpath_expr, namespaces=None):
    el = root.find(xpath_expr, namespaces) if namespaces else root.find(xpath_expr)
    return el.text.strip() if el is not None and el.text else None


def detectar_tipo_automatico(tipo_fornecido: Optional[str], descricao: str) -> TipoNota:
    """Detecta tipo para NFSe — baseado no prefixo da discriminação."""
    if tipo_fornecido:
        tipo_upper = tipo_fornecido.upper()
        if tipo_upper == "ASSISTENCIA":
            return TipoNota.ASSISTENCIA
        elif tipo_upper == "MANUTENCAO":
            return TipoNota.MANUTENCAO

    desc_upper = (descricao or "").strip().upper()
    if desc_upper.startswith("MANUTENCAO"):
        return TipoNota.MANUTENCAO
    if desc_upper.startswith("SERVICOS PRESTADOS"):
        return TipoNota.ASSISTENCIA

    return TipoNota.OUTROS


def limpar_descricao(descricao: str) -> str:
    if not descricao:
        return None
    descricao = re.sub(r'\.{2,}', ' ', descricao)
    descricao = re.sub(r'\s+', ' ', descricao)
    return descricao.strip()


def extrair_numero_os(texto: str) -> Optional[str]:
    """
    Extrai o número da Ordem de Serviço da discriminação/infCpl.
    Suporta:
      NFSe: 'Numero ordem servico: 12345'
      NFe:  'Numero da ordem servico: 12345'
    """
    if not texto:
        return None
    match = re.search(r'[Nn]umero\s+(?:da\s+)?ordem\s+servi[cç]o[:\s]+(\d+)', texto)
    return match.group(1) if match else None


def extrair_data_servico(discriminacao: str) -> Optional[date]:
    """
    Extrai a data real de execução do serviço a partir da discriminação/infCpl.
    Suporta: 'Data servico executado: 13.01.2026' e 'Data servico executado:23.01.2026'
    Retorna None se não encontrar (o código usa data_emissao como fallback).
    """
    if not discriminacao:
        return None
    match = re.search(r'[Dd]ata\s+servi[cç]o\s+executado[:\s]+(\d{2})[.\-/](\d{2})[.\-/](\d{4})', discriminacao)
    if match:
        dia, mes, ano = match.group(1), match.group(2), match.group(3)
        try:
            return datetime.strptime(f"{dia}/{mes}/{ano}", '%d/%m/%Y').date()
        except ValueError:
            pass
    return None


def extrair_data_vencimento(discriminacao: str, fallback: date) -> date:
    """
    Extrai o primeiro vencimento da discriminação.
    Suporta NFSe: 'Vencimento:.....28.01.2026'
    Suporta NFe single: 'Vencimentos:....09.02.2026'
    Suporta NFe multi: '1 parcela R$:1.600,00 vencimentos 09.01.2026'
    """
    if not discriminacao:
        return fallback

    # Padrão 1 — "Vencimento(s):" seguido de pontos/espaços e depois DD.MM.YYYY
    match = re.search(r'[Vv]encimentos?[:\s\.]+(\d{2})[.\-](\d{2})[.\-](\d{4})', discriminacao)
    if match:
        dia, mes, ano = match.group(1), match.group(2), match.group(3)
        try:
            return datetime.strptime(f"{dia}/{mes}/{ano}", '%d/%m/%Y').date()
        except ValueError:
            pass

    # Padrão 2 — "N parcela R$:X vencimentos DD.MM.YYYY" (pega o primeiro)
    match = re.search(r'\d+\s+parcela\s+R\$[\s:\d\.,]+vencimentos?\s+(\d{2})[.\-](\d{2})[.\-](\d{4})', discriminacao, re.IGNORECASE)
    if match:
        dia, mes, ano = match.group(1), match.group(2), match.group(3)
        try:
            return datetime.strptime(f"{dia}/{mes}/{ano}", '%d/%m/%Y').date()
        except ValueError:
            pass

    return fallback


def _parse_valor_brl(s: str) -> Optional[float]:
    """Converte 'R$:1.600,00' ou '1.600,00' -> float."""
    if not s:
        return None
    s = re.sub(r'[R\$\s:]', '', s).strip()
    if re.match(r'^[\d\.]+,\d{2}$', s):
        s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except Exception:
        return None


def _extrair_lista_vencimentos(texto: str) -> list:
    """
    Extrai lista de parcelas com valores e datas.
    Padrão: '1 parcela R$:1.600,00 vencimentos 09.01.2026'
    """
    pattern = r'(\d+)\s+parcela\s+R\$[:\s]*([\d\.,]+)\s+vencimentos?\s+(\d{2})[.\-](\d{2})[.\-](\d{4})'
    matches = re.findall(pattern, texto, re.IGNORECASE)
    resultado = []
    for n, val_str, dd, mm, yyyy in matches:
        resultado.append({
            'parcela': int(n),
            'valor': _parse_valor_brl(val_str),
            'data': f'{yyyy}-{mm}-{dd}'
        })
    return resultado


def detectar_status_nfse(status_xml: Optional[str]) -> StatusNota:
    if status_xml == "N":
        return StatusNota.AUTORIZADA
    if status_xml == "C":
        return StatusNota.CANCELADA
    return StatusNota.DESCONHECIDO


def detectar_status_nfe(c_stat: Optional[str]) -> StatusNota:
    if c_stat == "100":
        return StatusNota.AUTORIZADA
    if c_stat == "101":
        return StatusNota.CANCELADA
    return StatusNota.DESCONHECIDO


def extrair_dados_nfse(xml_str: str, db: Session, tipo_fornecido: Optional[str]) -> dict:
    root = ET.fromstring(xml_str)

    def get(tag):
        el = root.find(f".//{tag}")
        return el.text.strip() if el is not None and el.text else None

    def fv(tag):
        return float(get(tag) or 0)

    numero = get('NumeroNFe')
    data_emissao_str = get('DataEmissaoNFe')
    cnpj_emit = get('CPFCNPJPrestador/CNPJ') or get('InscricaoPrestador')
    razao_emit = get('RazaoSocialPrestador')
    cnpj_dest = get('CPFCNPJTomador/CNPJ')
    razao_dest = get('RazaoSocialTomador')
    valor_total = fv('ValorServicos')
    discriminacao = get('Discriminacao') or ''
    data_emissao = parse_date(data_emissao_str)
    tipo = detectar_tipo_automatico(tipo_fornecido, discriminacao)
    status_xml = get('StatusNFe')
    status = detectar_status_nfse(status_xml)

    # Parcelas: conta lista de vencimentos explícitos; fallback para campo "Quantidade parcelas"
    lista_vencimentos = _extrair_lista_vencimentos(discriminacao)
    if lista_vencimentos:
        parcelas = len(lista_vencimentos)
    else:
        m = re.search(r'[Qq]uantidade\s+parcela[s]?[:\s]+(\d+)', discriminacao)
        parcelas = int(m.group(1)) if m else 1

    # Vencimento da 1ª parcela
    data_vencimento = extrair_data_vencimento(discriminacao, data_emissao)

    # Valor por parcela
    valor_boleto_parcela = round(valor_total / parcelas, 2) if parcelas > 1 else valor_total

    # Impostos do XML
    iss    = fv('ValorISS')
    pis    = fv('ValorPIS')
    cofins = fv('ValorCOFINS')
    inss   = fv('ValorINSS')
    csll   = fv('ValorCSLL')

    condominio_id = None
    if cnpj_dest:
        cnpj_limpo = limpar_cnpj(cnpj_dest)
        condominio = NotaFiscalRepository.get_condominio_by_cnpj(db, cnpj_limpo)
        if condominio:
            condominio_id = condominio.id
            print(f"[NFSe] Condominio encontrado pelo CNPJ {cnpj_limpo} -> ID {condominio_id}")
        else:
            print(f"[NFSe] CNPJ {cnpj_limpo} nao encontrou condominio no banco")
    if not condominio_id and razao_dest:
        condominio = NotaFiscalRepository.get_condominio_by_nome(db, razao_dest)
        if condominio:
            condominio_id = condominio.id
            print(f"[NFSe] Condominio encontrado pelo nome '{razao_dest}' -> ID {condominio_id}")
            if cnpj_dest and not condominio.cnpj:
                condominio.cnpj = cnpj_dest
                db.commit()
                print(f"[NFSe] CNPJ {cnpj_dest} salvo no condominio ID {condominio_id}")
        else:
            print(f"[NFSe] Nome '{razao_dest}' nao encontrou condominio")

    descricao_limpa = limpar_descricao(discriminacao)
    data_servico_real = extrair_data_servico(discriminacao) or data_emissao
    numero_os = extrair_numero_os(discriminacao)

    return {
        'numero_nota': numero or f"NFSE-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        'tipo': tipo,
        'status': status,
        'parcelas': parcelas,
        'valor': valor_total,
        'valor_boleto_parcela': valor_boleto_parcela,
        'parcelas_json': lista_vencimentos if lista_vencimentos else None,
        'data_vencimento': data_vencimento,
        'data_emissao': data_emissao,
        'data_servico': data_servico_real,
        'numero_os': numero_os,
        'cliente_nome': razao_dest,
        'observacao': f"Emitente: {razao_emit} | CNPJ: {cnpj_emit}",
        'descricao_servico': descricao_limpa,
        'condominio_id': condominio_id,
        'xml_original': xml_str,
        # impostos
        'iss': iss or None,
        'pis': pis or None,
        'cofins': cofins or None,
        'inss': inss or None,
        'csll': csll or None,
    }


def extrair_dados_nfe(xml_str: str, db: Session, tipo_fornecido: Optional[str]) -> dict:
    root = ET.fromstring(xml_str)
    ns = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}

    def get(xpath):
        return find_text(root, xpath, ns)

    def fv(xpath):
        return float(get(xpath) or 0)

    numero = get('.//nfe:ide/nfe:nNF')
    serie  = get('.//nfe:ide/nfe:serie')
    data_emissao_str = get('.//nfe:ide/nfe:dhEmi')
    cnpj_emit = get('.//nfe:emit/nfe:CNPJ')
    razao_emit = get('.//nfe:emit/nfe:xNome')
    cnpj_dest = get('.//nfe:dest/nfe:CNPJ')
    razao_dest = get('.//nfe:dest/nfe:xNome')
    valor_total = fv('.//nfe:total/nfe:ICMSTot/nfe:vNF')
    inf_compl = get('.//nfe:infAdic/nfe:infCpl') or ''
    data_emissao = parse_date(data_emissao_str)
    c_stat = get('.//nfe:protNFe/nfe:infProt/nfe:cStat')
    status = detectar_status_nfe(c_stat)

    # Tipo: NFe série 2 = ASSISTENCIA; tipo_fornecido pode sobrescrever
    if tipo_fornecido:
        tipo_upper = tipo_fornecido.upper()
        if tipo_upper == "MANUTENCAO":
            tipo = TipoNota.MANUTENCAO
        elif tipo_upper == "ASSISTENCIA":
            tipo = TipoNota.ASSISTENCIA
        else:
            tipo = TipoNota.OUTROS
    elif serie == '2':
        tipo = TipoNota.ASSISTENCIA
    else:
        tipo = TipoNota.OUTROS

    # Parcelas: conta vencimentos listados; fallback campo "Quantidade parcelas"
    lista_vencimentos = _extrair_lista_vencimentos(inf_compl)
    if lista_vencimentos:
        parcelas = len(lista_vencimentos)
    else:
        m = re.search(r'[Qq]uantidade\s+parcela[s]?[:\s]+(\d+)', inf_compl)
        parcelas = int(m.group(1)) if m else 1

    # Vencimento da 1ª parcela
    data_vencimento = extrair_data_vencimento(inf_compl, data_emissao)

    # Valor por parcela
    valor_boleto_parcela = round(valor_total / parcelas, 2) if parcelas > 1 else valor_total

    # Impostos do ICMSTot
    pref = './/nfe:total/nfe:ICMSTot/'
    icms   = fv(pref + 'nfe:vICMS') or None
    pis    = fv(pref + 'nfe:vPIS') or None
    cofins = fv(pref + 'nfe:vCOFINS') or None

    # Retenções da infCpl: "Retencoes de Tributos: - PIS: 7,80 - COFINS: 36,00 - CSLL: 12,00 - PREV: 132,00"
    prev = csll = inss = None
    m_ret = re.search(r'Retencoes de Tributos[:\s]+(.*?)(?:\||$)', inf_compl, re.IGNORECASE)
    if m_ret:
        bloco = m_ret.group(1)
        def _ret(campo):
            m = re.search(rf'{campo}[:\s]+([\d\.,]+)', bloco, re.IGNORECASE)
            return _parse_valor_brl(m.group(1)) if m else None
        pis    = _ret('PIS')   or pis
        cofins = _ret('COFINS') or cofins
        csll   = _ret('CSLL')
        prev   = _ret('PREV')

    condominio_id = None
    if cnpj_dest:
        cnpj_limpo = limpar_cnpj(cnpj_dest)
        condominio = NotaFiscalRepository.get_condominio_by_cnpj(db, cnpj_limpo)
        if condominio:
            condominio_id = condominio.id
            print(f"[NFe] Condominio encontrado pelo CNPJ {cnpj_limpo} -> ID {condominio_id}")
        else:
            print(f"[NFe] CNPJ {cnpj_limpo} nao encontrou condominio no banco")
    if not condominio_id and razao_dest:
        condominio = NotaFiscalRepository.get_condominio_by_nome(db, razao_dest)
        if condominio:
            condominio_id = condominio.id
            print(f"[NFe] Condominio encontrado pelo nome '{razao_dest}' -> ID {condominio_id}")
            if cnpj_dest and not condominio.cnpj:
                condominio.cnpj = cnpj_dest
                db.commit()
                print(f"[NFe] CNPJ {cnpj_dest} salvo no condominio ID {condominio_id}")
        else:
            print(f"[NFe] Nome '{razao_dest}' nao encontrou condominio")

    descricao_limpa = limpar_descricao(inf_compl)
    data_servico_real = extrair_data_servico(inf_compl) or data_emissao
    numero_os = extrair_numero_os(inf_compl)

    return {
        'numero_nota': f"{numero}-{serie}" if serie and numero else (numero or f"NFE-{datetime.now().strftime('%Y%m%d%H%M%S')}"),
        'tipo': tipo,
        'status': status,
        'parcelas': parcelas,
        'valor': valor_total,
        'valor_boleto_parcela': valor_boleto_parcela,
        'parcelas_json': lista_vencimentos if lista_vencimentos else None,
        'data_vencimento': data_vencimento,
        'data_emissao': data_emissao,
        'data_servico': data_servico_real,
        'cliente_nome': razao_dest,
        'observacao': f"Emitente: {razao_emit} | CNPJ: {cnpj_emit}",
        'numero_os': numero_os,
        'descricao_servico': descricao_limpa,
        'condominio_id': condominio_id,
        'xml_original': xml_str,
        # impostos
        'icms':   icms,
        'pis':    pis,
        'cofins': cofins,
        'csll':   csll,
        'prev':   prev,
    }


def detectar_tipo_xml(xml_str: str) -> str:
    if 'procEventoNFe' in xml_str:
        return 'EventoCancelamentoNFe'
    if '<RazaoSocialPrestador>' in xml_str and '<ValorServicos>' in xml_str:
        return 'NFSe'
    if '<infNFe' in xml_str and 'http://www.portalfiscal.inf.br/nfe' in xml_str:
        return 'NFe'
    try:
        root = ET.fromstring(xml_str)
        if root.find('.//RazaoSocialPrestador') is not None:
            return 'NFSe'
        if root.find('.//{http://www.portalfiscal.inf.br/nfe}infNFe') is not None:
            return 'NFe'
    except ET.ParseError:
        raise ValueError("Arquivo não parece ser um XML válido.")
    return 'NFe'


def processar_cancelamento_nfe(xml_str: str, db: Session) -> dict:
    try:
        root = ET.fromstring(xml_str)

        ch_nfe = None
        for tag in ['chNFe', '{http://www.portalfiscal.inf.br/nfe}chNFe']:
            el = root.find(f'.//{tag}')
            if el is not None and el.text:
                ch_nfe = el.text.strip()
                break

        if not ch_nfe:
            return {'status': 'erro', 'mensagem': 'chNFe não encontrada no evento de cancelamento'}

        numero_nota_raw = ch_nfe[25:34].lstrip('0')
        serie = ch_nfe[22:25].lstrip('0')
        numero_nota = f"{numero_nota_raw}-{serie}" if serie else numero_nota_raw

        db_nota = NotaFiscalRepository.get_by_numero(db, numero_nota)

        if not db_nota:
            return {'status': 'nao_encontrada', 'numero': numero_nota, 'ch_nfe': ch_nfe}

        if db_nota.status == StatusNota.CANCELADA:
            return {'status': 'ja_cancelada', 'numero': numero_nota}

        db_nota.status = StatusNota.CANCELADA
        db.commit()
        return {'status': 'cancelada', 'numero': numero_nota, 'nota_id': db_nota.id}

    except Exception as e:
        return {'status': 'erro', 'mensagem': str(e)}




def _validar_impostos_vs_config(db: Session, db_nota) -> None:
    """
    Compara os valores de impostos do XML contra os percentuais da configuração.
    Se houver divergência > R$0,10, seta alerta_impostos=True e divergencia_impostos com detalhes.
    Não bloqueia o fluxo.
    """
    try:
        from app.models.configuracao_impostos_model import ConfiguracaoImpostosServico, TipoServicoConfig
        tipo_config = TipoServicoConfig(db_nota.tipo.value)
        config = db.query(ConfiguracaoImpostosServico).filter_by(tipo_servico=tipo_config, ativo=True).first()
        if not config:
            return

        valor = float(db_nota.valor or 0)
        campos = {
            'pis':    (float(config.pct_pis),    float(db_nota.pis or 0)),
            'cofins': (float(config.pct_cofins), float(db_nota.cofins or 0)),
            'inss':   (float(config.pct_inss),   float(db_nota.inss or 0)),
            'csll':   (float(config.pct_csll),   float(db_nota.csll or 0)),
        }

        divergencias = {}
        for campo, (pct, xml_val) in campos.items():
            config_val = round(valor * pct / 100, 2)
            if abs(config_val - xml_val) > 0.10:
                divergencias[campo] = {
                    'pct': pct,
                    'config': config_val,
                    'xml': xml_val,
                }

        if divergencias:
            db_nota.alerta_impostos = 1
            db_nota.divergencia_impostos = divergencias
            print(f"[ValidarImpostos] Nota {db_nota.numero_nota}: divergencias={list(divergencias.keys())}")
    except Exception as e:
        print(f"[ValidarImpostos] Erro: {e}")


def corrigir_datas_servico(db: Session) -> dict:
    """
    Re-parseia o XML de todas as notas vinculadas a ManutencaoAssistencia e
    atualiza data_servico usando a função extrair_data_servico().
    Deve ser executado uma vez para corrigir registros importados antes do fix.
    """
    from app.models.servico_model import ManutencaoAssistencia
    from app.models.nota_fiscal_model import NotaFiscal

    servicos = db.query(ManutencaoAssistencia).filter(
        ManutencaoAssistencia.nota_fiscal_id.isnot(None)
    ).all()

    atualizados = 0
    sem_data = 0

    for servico in servicos:
        nota = db.get(NotaFiscal, servico.nota_fiscal_id)
        if not nota or not nota.xml_original:
            sem_data += 1
            continue

        try:
            tipo_xml = detectar_tipo_xml(nota.xml_original)
            if tipo_xml == 'NFSe':
                root = ET.fromstring(nota.xml_original)
                el = root.find('.//Discriminacao')
                texto = el.text.strip() if el is not None and el.text else ''
            elif tipo_xml == 'NFe':
                root = ET.fromstring(nota.xml_original)
                ns = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}
                el = root.find('.//nfe:infAdic/nfe:infCpl', ns)
                texto = el.text.strip() if el is not None and el.text else ''
            else:
                sem_data += 1
                continue

            data_corrigida = extrair_data_servico(texto)
            if data_corrigida and data_corrigida != servico.data_servico:
                servico.data_servico = data_corrigida
                atualizados += 1
                print(f"[CorrigirData] ServID={servico.id} NotaID={nota.id}: {servico.data_servico} -> {data_corrigida}")
            elif not data_corrigida:
                sem_data += 1
        except Exception as e:
            print(f"[CorrigirData] Erro ServID={servico.id}: {e}")
            sem_data += 1

    db.commit()
    return {"total": len(servicos), "atualizados": atualizados, "sem_data_no_xml": sem_data}


class NotaFiscalService:

    @staticmethod
    def create_nota(db: Session, nota: NotaFiscalCreate):
        db_nota = NotaFiscalRepository.create(db, nota)
        return NotaFiscalResponse.model_validate(db_nota)

    @staticmethod
    def update_nota(db: Session, nota_id: int, nota_update: NotaFiscalUpdate):
        from app.models.nota_fiscal_model import NotaFiscal
        db_nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_id).first()
        if not db_nota:
            return None
        update_data = nota_update.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_nota, key, value)
        db.commit()
        db.refresh(db_nota)
        return db_nota

    @staticmethod
    def get_all_notas(db: Session):
        notas = NotaFiscalRepository.get_all(db)
        return [NotaFiscalResponse.model_validate(n) for n in notas]

    @staticmethod
    def get_nota_by_id(db: Session, id: int):
        nota = NotaFiscalRepository.get_by_id(db, id)
        return NotaFiscalResponse.model_validate(nota) if nota else None

    @staticmethod
    def get_nota_by_numero(db: Session, numero: str):
        nota = NotaFiscalRepository.get_by_numero(db, numero)
        return NotaFiscalResponse.model_validate(nota) if nota else None

    @staticmethod
    def vincular_condominio(db: Session, nota_id: int, condominio_id: int):
        from app.models.nota_fiscal_model import NotaFiscal
        from app.models.condominio_model import Condominio

        db_nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_id).first()
        if not db_nota:
            raise HTTPException(status_code=404, detail="Nota não encontrada.")

        condominio = db.query(Condominio).filter(Condominio.id == condominio_id).first()
        if not condominio:
            raise HTTPException(status_code=404, detail="Condomínio não encontrado.")

        db_nota.condominio_id = condominio_id
        db.commit()
        db.refresh(db_nota)

        # Gerar serviço se MANUT/ASSIST e ainda não há serviço vinculado
        if db_nota.tipo in [TipoNota.ASSISTENCIA, TipoNota.MANUTENCAO]:
            servico_existente = db.query(ManutencaoAssistencia).filter(
                ManutencaoAssistencia.nota_fiscal_id == nota_id
            ).first()
            if not servico_existente:
                try:
                    tipo_str = "assistencia" if db_nota.tipo == TipoNota.ASSISTENCIA else "manutencao"
                    # Extrair numero_os do XML se disponível
                    numero_os = None
                    if db_nota.xml_original:
                        try:
                            tipo_xml = detectar_tipo_xml(db_nota.xml_original)
                            if tipo_xml == 'NFSe':
                                root_os = ET.fromstring(db_nota.xml_original)
                                el_os = root_os.find('.//Discriminacao')
                                numero_os = extrair_numero_os(el_os.text if el_os is not None else '')
                            elif tipo_xml == 'NFe':
                                root_os = ET.fromstring(db_nota.xml_original)
                                ns_os = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}
                                el_os = root_os.find('.//nfe:infAdic/nfe:infCpl', ns_os)
                                numero_os = extrair_numero_os(el_os.text if el_os is not None else '')
                        except Exception:
                            pass
                    servico = ServicoCreate(
                        condominio_id=condominio_id,
                        tipo=tipo_str,
                        data_servico=db_nota.data_vencimento,
                        descricao=db_nota.descricao_servico or db_nota.observacao or "",
                        nota_fiscal_id=nota_id,
                        numero_os=numero_os,
                    )
                    ServicoService.create_servico(db, servico)
                except Exception as e:
                    print(f"[VincularCondominio] Erro ao criar servico: {e}")

        aviso = None if condominio.cnpj else "Condominio sem CNPJ - nao sera possivel gerar boleto Inter."
        return NotaFiscalResponse.model_validate(db_nota), aviso

    @staticmethod
    def delete_nota(db: Session, nota_id: int, motivo: Optional[str] = None, deletar_servicos: bool = False) -> bool:
        from app.routers.auditoria_router import registrar_exclusao

        db_nota = NotaFiscalRepository.get_by_id(db, nota_id)
        if not db_nota:
            return False

        servicos_vinculados = db.query(ManutencaoAssistencia).filter(
            ManutencaoAssistencia.nota_fiscal_id == nota_id
        ).all()

        if servicos_vinculados and not deletar_servicos:
            raise HTTPException(
                status_code=400,
                detail="Esta nota está vinculada a serviços. Confirme deletar os serviços também (deletar_servicos=true)."
            )

        dados_nota = {
            "id": db_nota.id,
            "numero_nota": db_nota.numero_nota,
            "tipo": db_nota.tipo.value,
            "valor": db_nota.valor,
            "data_vencimento": db_nota.data_vencimento.isoformat() if db_nota.data_vencimento else None,
        }
        registrar_exclusao(db=db, tipo="nota_fiscal", registro_id=nota_id, dados=dados_nota, motivo=motivo or "Exclusão manual")

        if deletar_servicos:
            for servico in servicos_vinculados:
                dados_servico = {
                    "id": servico.id,
                    "condominio_id": servico.condominio_id,
                    "tipo": servico.tipo.value,
                    "data_servico": servico.data_servico.isoformat(),
                    "descricao": servico.descricao,
                }
                registrar_exclusao(db=db, tipo="servico", registro_id=servico.id, dados=dados_servico, motivo=f"Exclusão em cascata por deleção da nota {nota_id}")
                db.delete(servico)

        db.delete(db_nota)
        db.commit()
        return True

    @staticmethod
    def revalidar_nota_do_xml(db: Session, nota_id: int) -> dict:
        """Re-parseia o xml_original e atualiza o status da nota."""
        from app.models.nota_fiscal_model import NotaFiscal
        db_nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_id).first()
        if not db_nota:
            return {"nota_id": nota_id, "resultado": "nao_encontrada"}
        if not db_nota.xml_original:
            return {"nota_id": nota_id, "resultado": "sem_xml"}
        try:
            tipo_xml = detectar_tipo_xml(db_nota.xml_original)
            if tipo_xml == 'NFSe':
                root = ET.fromstring(db_nota.xml_original)
                el = root.find('.//StatusNFe')
                status_xml = el.text.strip() if el is not None and el.text else None
                novo_status = detectar_status_nfse(status_xml)
            elif tipo_xml == 'NFe':
                root = ET.fromstring(db_nota.xml_original)
                ns = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}
                c_stat = find_text(root, './/nfe:protNFe/nfe:infProt/nfe:cStat', ns)
                novo_status = detectar_status_nfe(c_stat)
            else:
                return {"nota_id": nota_id, "resultado": "tipo_nao_suportado"}

            status_anterior = db_nota.status.value
            alterado = status_anterior != novo_status.value
            db_nota.status = novo_status
            db.commit()
            return {
                "nota_id": nota_id,
                "numero_nota": db_nota.numero_nota,
                "status_anterior": status_anterior,
                "status_novo": novo_status.value,
                "alterado": alterado,
                "resultado": "ok",
            }
        except Exception as e:
            return {"nota_id": nota_id, "resultado": "erro", "mensagem": str(e)}

    @staticmethod
    def revalidar_campos_do_xml(db: Session, nota_id: int) -> dict:
        """Re-parseia xml_original e atualiza TODOS os campos: tipo, status, vencimento, parcelas, impostos."""
        from app.models.nota_fiscal_model import NotaFiscal
        db_nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_id).first()
        if not db_nota:
            return {"nota_id": nota_id, "resultado": "nao_encontrada"}
        if not db_nota.xml_original:
            return {"nota_id": nota_id, "resultado": "sem_xml"}
        try:
            tipo_xml = detectar_tipo_xml(db_nota.xml_original)
            if tipo_xml == 'NFSe':
                # Não precisamos do db para busca de condomínio aqui — só re-parse dos campos
                dados = extrair_dados_nfse(db_nota.xml_original, db, None)
            elif tipo_xml == 'NFe':
                dados = extrair_dados_nfe(db_nota.xml_original, db, None)
            else:
                return {"nota_id": nota_id, "resultado": "tipo_nao_suportado"}

            campos = ['tipo', 'status', 'parcelas', 'valor', 'data_vencimento',
                      'valor_boleto_parcela', 'parcelas_json',
                      'iss', 'pis', 'cofins', 'inss', 'csll', 'icms', 'prev']
            alteracoes = {}
            for campo in campos:
                if campo in dados:
                    val_antigo = getattr(db_nota, campo, None)
                    val_novo = dados[campo]
                    if str(val_antigo) != str(val_novo):
                        alteracoes[campo] = {"de": str(val_antigo), "para": str(val_novo)}
                    setattr(db_nota, campo, val_novo)

            db.commit()
            return {
                "nota_id": nota_id,
                "numero_nota": db_nota.numero_nota,
                "alteracoes": alteracoes,
                "resultado": "ok",
            }
        except Exception as e:
            return {"nota_id": nota_id, "resultado": "erro", "mensagem": str(e)}

    @staticmethod
    def revalidar_todas(db: Session) -> dict:
        """Re-parseia o XML de todas as notas e atualiza status."""
        from app.models.nota_fiscal_model import NotaFiscal
        notas = db.query(NotaFiscal).filter(NotaFiscal.xml_original.isnot(None)).all()
        total = len(notas)
        alteradas = 0
        erros = 0
        detalhes = []
        for nota in notas:
            r = NotaFiscalService.revalidar_nota_do_xml(db, nota.id)
            if r.get("alterado"):
                alteradas += 1
            if r.get("resultado") in ("erro", "tipo_nao_suportado"):
                erros += 1
            if r.get("alterado") or r.get("resultado") != "ok":
                detalhes.append(r)
        return {
            "total": total,
            "alteradas": alteradas,
            "erros": erros,
            "detalhes": detalhes,
            "mensagem": f"Revalidação concluída: {total} notas verificadas, {alteradas} status alterados, {erros} erros.",
        }

    @staticmethod
    async def importar_xmls(db: Session, files: List[UploadFile], tipo_fornecido: Optional[str] = None):
        print(f"\n[IMPORT] >>> Requisicao recebida: {len(files)} arquivo(s)")
        processados = 0
        ja_existentes = 0
        canceladas = 0
        erros = []
        xmls_para_processar = []

        for file in files:
            try:
                conteudo = await file.read()
                filename = file.filename

                if filename.lower().endswith('.zip'):
                    try:
                        with zipfile.ZipFile(io.BytesIO(conteudo)) as zip_ref:
                            for zip_info in zip_ref.filelist:
                                if not zip_info.is_dir() and zip_info.filename.lower().endswith('.xml'):
                                    xml_content = zip_ref.read(zip_info.filename)
                                    xmls_para_processar.append({'filename': f"{filename}/{zip_info.filename}", 'content': xml_content})
                    except zipfile.BadZipFile:
                        erros.append({"arquivo": filename, "erro": "Arquivo ZIP corrompido ou inválido."})
                elif filename.lower().endswith('.xml'):
                    xmls_para_processar.append({'filename': filename, 'content': conteudo})
                else:
                    erros.append({"arquivo": filename, "erro": "Formato não suportado. Use .xml ou .zip."})
            except Exception as e:
                erros.append({"arquivo": file.filename, "erro": f"Erro ao ler arquivo: {e}"})

        print(f"[IMPORT] Total de XMLs para processar: {len(xmls_para_processar)}")

        for xml_data in xmls_para_processar:
            filename = xml_data['filename']
            try:
                xml_bytes = xml_data['content']
                try:
                    xml_str = xml_bytes.decode('utf-8')
                except UnicodeDecodeError:
                    xml_str = xml_bytes.decode('latin-1')

                tipo_xml = detectar_tipo_xml(xml_str)

                if tipo_xml == 'EventoCancelamentoNFe':
                    resultado_canc = processar_cancelamento_nfe(xml_str, db)
                    if resultado_canc['status'] == 'cancelada':
                        canceladas += 1
                    elif resultado_canc['status'] not in ['nao_encontrada', 'ja_cancelada']:
                        erros.append({"arquivo": filename, "erro": f"Erro no cancelamento: {resultado_canc.get('mensagem')}"})
                    continue

                if tipo_xml == 'NFSe':
                    dados_nota = extrair_dados_nfse(xml_str, db, tipo_fornecido)
                else:
                    dados_nota = extrair_dados_nfe(xml_str, db, tipo_fornecido)

                print(f"[IMPORT] Nota {dados_nota['numero_nota']} | tipo={dados_nota['tipo']} | status={dados_nota['status']} | condominio_id={dados_nota['condominio_id']}")

                if dados_nota.get('status') == StatusNota.CANCELADA:
                    canceladas += 1
                    # Tenta atualizar nota existente no BD para CANCELADA
                    db_existente = NotaFiscalRepository.get_by_numero(db, dados_nota['numero_nota'])
                    if db_existente and db_existente.status != StatusNota.CANCELADA:
                        db_existente.status = StatusNota.CANCELADA
                        db.commit()
                        print(f"[IMPORT] Nota {dados_nota['numero_nota']} marcada como CANCELADA no BD")
                    erros.append({"arquivo": filename, "numero": dados_nota['numero_nota'], "erro": "Nota cancelada - nao importada.", "tipo_erro": "cancelada"})
                    continue

                if NotaFiscalRepository.get_by_numero(db, dados_nota['numero_nota']):
                    print(f"[IMPORT] Nota {dados_nota['numero_nota']} ja existe - pulando")
                    ja_existentes += 1
                    continue

                nota_importada = NotaFiscalImportada(**dados_nota)
                db_nota = NotaFiscalRepository.create_importada(db, nota_importada)
                print(f"[IMPORT] Nota {db_nota.numero_nota} salva com ID={db_nota.id}")

                # Validar impostos vs configuração (alerta não-bloqueante)
                _validar_impostos_vs_config(db, db_nota)
                db.commit()

                if dados_nota['condominio_id'] and dados_nota['tipo'] in [TipoNota.ASSISTENCIA, TipoNota.MANUTENCAO]:
                    try:
                        tipo_servico_str = "assistencia" if dados_nota['tipo'] == TipoNota.ASSISTENCIA else "manutencao"
                        servico = ServicoCreate(
                            condominio_id=dados_nota['condominio_id'],
                            tipo=tipo_servico_str,
                            data_servico=dados_nota.get('data_servico') or dados_nota['data_emissao'],
                            descricao=dados_nota['descricao_servico'],
                            nota_fiscal_id=db_nota.id,
                            numero_os=dados_nota.get('numero_os'),
                        )
                        ServicoService.create_servico(db, servico)
                        print(f"[IMPORT] Servico '{tipo_servico_str}' criado para nota {db_nota.numero_nota} OS={dados_nota.get('numero_os')}")
                    except Exception as e:
                        print(f"[IMPORT] ERRO ao criar servico: {e}")
                        erros.append({"arquivo": filename, "erro": f"Nota importada, mas erro ao criar servico: {e}"})
                else:
                    print(f"[IMPORT] Sem servico - condominio_id={dados_nota['condominio_id']} tipo={dados_nota['tipo']}")

                processados += 1

            except (ET.ParseError, ValueError) as e:
                print(f"[IMPORT] ERRO de parsing em {filename}: {e}")
                erros.append({"arquivo": filename, "erro": f"Erro de parsing: {e}"})
            except Exception as e:
                print(f"[IMPORT] ERRO critico em {filename}: {e}")
                erros.append({"arquivo": filename, "erro": str(e)})

        print(f"[IMPORT] <<< Resultado: {processados} importadas | {ja_existentes} ja existentes | {canceladas} canceladas | {len(erros)} erros\n")
        return {"processados": processados, "ja_existentes": ja_existentes, "canceladas": canceladas, "erros": erros}

    @staticmethod
    def vincular_notas(db: Session, nota_a_id: int, nota_b_id: int) -> dict:
        """
        Vincula duas notas do mesmo condomínio de forma simétrica.
        Deleta os dois serviços existentes e cria um serviço único combinado.
        O serviço combinado fica com nota_fiscal_id = nota_a.id.
        """
        from app.models.nota_fiscal_model import NotaFiscal
        from app.models.boleto_model import SituacaoBoleto
        from app.repositories.boleto_repository import BoletoRepository

        nota_a = db.query(NotaFiscal).filter(NotaFiscal.id == nota_a_id).first()
        nota_b = db.query(NotaFiscal).filter(NotaFiscal.id == nota_b_id).first()

        if not nota_a:
            raise HTTPException(status_code=404, detail=f"Nota {nota_a_id} não encontrada.")
        if not nota_b:
            raise HTTPException(status_code=404, detail=f"Nota {nota_b_id} não encontrada.")

        # Validar mesmo condomínio
        if nota_a.condominio_id != nota_b.condominio_id:
            raise HTTPException(status_code=400, detail="As notas pertencem a condomínios diferentes.")

        # Validar que nenhuma já está vinculada
        if nota_a.nota_vinculada_id is not None:
            raise HTTPException(status_code=400, detail=f"A nota {nota_a.numero_nota} já está vinculada a outra nota.")
        if nota_b.nota_vinculada_id is not None:
            raise HTTPException(status_code=400, detail=f"A nota {nota_b.numero_nota} já está vinculada a outra nota.")

        # Validar que nenhuma tem boleto ativo
        boletos_a = BoletoRepository.get_all_by_nota_fiscal(db, nota_a_id)
        boletos_b = BoletoRepository.get_all_by_nota_fiscal(db, nota_b_id)
        situacoes_ativas = {SituacaoBoleto.EMABERTO, SituacaoBoleto.VENCIDO}
        if any(b.situacao in situacoes_ativas for b in boletos_a):
            raise HTTPException(status_code=400, detail=f"A nota {nota_a.numero_nota} tem boleto ativo. Cancele antes de vincular.")
        if any(b.situacao in situacoes_ativas for b in boletos_b):
            raise HTTPException(status_code=400, detail=f"A nota {nota_b.numero_nota} tem boleto ativo. Cancele antes de vincular.")

        # Deletar serviços existentes das duas notas
        servicos = db.query(ManutencaoAssistencia).filter(
            ManutencaoAssistencia.nota_fiscal_id.in_([nota_a_id, nota_b_id])
        ).all()
        for s in servicos:
            db.delete(s)

        # Criar serviço único combinado (nota_fiscal_id = nota_a.id)
        tipo_str = "assistencia" if nota_a.tipo == TipoNota.ASSISTENCIA else "manutencao"
        numero_os = None
        if nota_a.xml_original:
            try:
                tipo_xml = detectar_tipo_xml(nota_a.xml_original)
                if tipo_xml == 'NFSe':
                    root_os = ET.fromstring(nota_a.xml_original)
                    el_os = root_os.find('.//Discriminacao')
                    numero_os = extrair_numero_os(el_os.text if el_os is not None else '')
                elif tipo_xml == 'NFe':
                    root_os = ET.fromstring(nota_a.xml_original)
                    ns_os = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}
                    el_os = root_os.find('.//nfe:infAdic/nfe:infCpl', ns_os)
                    numero_os = extrair_numero_os(el_os.text if el_os is not None else '')
            except Exception:
                pass

        valor_total = float(nota_a.valor) + float(nota_b.valor)
        servico_combinado = ServicoCreate(
            condominio_id=nota_a.condominio_id,
            tipo=tipo_str,
            data_servico=nota_a.data_vencimento,
            descricao=f"Notas vinculadas: {nota_a.numero_nota} + {nota_b.numero_nota} | Valor total: R$ {valor_total:.2f}",
            nota_fiscal_id=nota_a_id,
            numero_os=numero_os,
        )
        novo_servico = ServicoService.create_servico(db, servico_combinado)

        # Vínculo simétrico
        nota_a.nota_vinculada_id = nota_b_id
        nota_b.nota_vinculada_id = nota_a_id

        db.commit()
        db.refresh(nota_a)
        db.refresh(nota_b)

        print(f"[VincularNotas] Notas {nota_a.numero_nota} <-> {nota_b.numero_nota} vinculadas. Serviço combinado ID={novo_servico.id}")
        return {
            "nota_a": NotaFiscalResponse.model_validate(nota_a),
            "nota_b": NotaFiscalResponse.model_validate(nota_b),
            "servico_id": novo_servico.id,
        }

    @staticmethod
    def desvincular_notas(db: Session, nota_id: int) -> dict:
        """
        Desfaz o vínculo entre duas notas.
        Deleta o serviço combinado e recria os dois serviços individuais
        usando o pattern de vincular_condominio() (extração do xml_original).
        """
        from app.models.nota_fiscal_model import NotaFiscal

        nota = db.query(NotaFiscal).filter(NotaFiscal.id == nota_id).first()
        if not nota:
            raise HTTPException(status_code=404, detail="Nota não encontrada.")
        if nota.nota_vinculada_id is None:
            raise HTTPException(status_code=400, detail="Esta nota não está vinculada a outra nota.")

        parceira = db.query(NotaFiscal).filter(NotaFiscal.id == nota.nota_vinculada_id).first()
        if not parceira:
            raise HTTPException(status_code=404, detail="Nota parceira não encontrada.")

        # Deletar o serviço combinado (vinculado a qualquer uma das duas notas)
        servicos = db.query(ManutencaoAssistencia).filter(
            ManutencaoAssistencia.nota_fiscal_id.in_([nota.id, parceira.id])
        ).all()
        for s in servicos:
            db.delete(s)

        # Recriar serviços individuais via xml_original (mesmo pattern de vincular_condominio)
        for db_nota in [nota, parceira]:
            if db_nota.tipo not in [TipoNota.ASSISTENCIA, TipoNota.MANUTENCAO]:
                continue
            if not db_nota.condominio_id:
                continue
            try:
                tipo_str = "assistencia" if db_nota.tipo == TipoNota.ASSISTENCIA else "manutencao"
                numero_os = None
                if db_nota.xml_original:
                    try:
                        tipo_xml = detectar_tipo_xml(db_nota.xml_original)
                        if tipo_xml == 'NFSe':
                            root_os = ET.fromstring(db_nota.xml_original)
                            el_os = root_os.find('.//Discriminacao')
                            numero_os = extrair_numero_os(el_os.text if el_os is not None else '')
                        elif tipo_xml == 'NFe':
                            root_os = ET.fromstring(db_nota.xml_original)
                            ns_os = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}
                            el_os = root_os.find('.//nfe:infAdic/nfe:infCpl', ns_os)
                            numero_os = extrair_numero_os(el_os.text if el_os is not None else '')
                    except Exception:
                        pass
                servico = ServicoCreate(
                    condominio_id=db_nota.condominio_id,
                    tipo=tipo_str,
                    data_servico=db_nota.data_vencimento,
                    descricao=db_nota.descricao_servico or db_nota.observacao or "",
                    nota_fiscal_id=db_nota.id,
                    numero_os=numero_os,
                )
                ServicoService.create_servico(db, servico)
                print(f"[DesvincularNotas] Serviço recriado para nota {db_nota.numero_nota}")
            except Exception as e:
                print(f"[DesvincularNotas] Erro ao recriar serviço para nota {db_nota.numero_nota}: {e}")

        # Limpar vínculo e config de imposto
        nota.nota_vinculada_id = None
        nota.imposto_config_vinculo = None
        parceira.nota_vinculada_id = None
        parceira.imposto_config_vinculo = None

        db.commit()
        print(f"[DesvincularNotas] Vínculo removido entre notas ID={nota.id} e ID={parceira.id}")
        return {"mensagem": f"Notas {nota.numero_nota} e {parceira.numero_nota} desvinculadas com sucesso."}

    @staticmethod
    def get_candidatas_vinculo(db: Session, servico_id: int) -> list:
        """
        Retorna notas do mesmo condomínio do serviço que podem ser vinculadas:
        - AUTORIZADA
        - Sem nota_vinculada_id (não já vinculadas)
        - Sem boleto ativo (EMABERTO ou VENCIDO)
        - Tipo ASSISTENCIA ou MANUTENCAO
        - Diferente da nota atual do serviço
        """
        from app.models.nota_fiscal_model import NotaFiscal
        from app.models.boleto_model import Boleto, SituacaoBoleto

        servico = db.query(ManutencaoAssistencia).filter(ManutencaoAssistencia.id == servico_id).first()
        if not servico:
            raise HTTPException(status_code=404, detail="Serviço não encontrado.")

        nota_atual_id = servico.nota_fiscal_id
        condominio_id = servico.condominio_id

        # Subquery: ids de notas com boleto ativo
        from sqlalchemy import select
        notas_com_boleto_ativo = db.query(Boleto.nota_fiscal_id).filter(
            Boleto.situacao.in_([SituacaoBoleto.EMABERTO, SituacaoBoleto.VENCIDO])
        ).subquery()

        candidatas = db.query(NotaFiscal).filter(
            NotaFiscal.condominio_id == condominio_id,
            NotaFiscal.status == StatusNota.AUTORIZADA,
            NotaFiscal.tipo.in_([TipoNota.ASSISTENCIA, TipoNota.MANUTENCAO]),
            NotaFiscal.nota_vinculada_id.is_(None),
            NotaFiscal.id != nota_atual_id,
            NotaFiscal.id.notin_(notas_com_boleto_ativo),
        ).order_by(NotaFiscal.data_vencimento.desc()).all()

        from app.schemas.nota_fiscal_schema import CandidataVinculoResponse
        return [CandidataVinculoResponse.model_validate(n) for n in candidatas]
