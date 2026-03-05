from sqlalchemy.orm import Session
from typing import List, Optional
from fastapi import HTTPException, UploadFile
from datetime import datetime, date
import xml.etree.ElementTree as ET
import zipfile
import io
import re

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
    desc_upper = (descricao or "").strip().upper()

    if desc_upper.startswith("MANUTENCAO"):
        return TipoNota.MANUTENCAO
    if desc_upper.startswith("SERVICOS PRESTADOS"):
        return TipoNota.ASSISTENCIA

    if tipo_fornecido:
        tipo_upper = tipo_fornecido.upper()
        if tipo_upper == "ASSISTENCIA":
            return TipoNota.ASSISTENCIA
        elif tipo_upper == "MANUTENCAO":
            return TipoNota.MANUTENCAO
        else:
            return TipoNota.OUTROS

    desc_lower = desc_upper.lower()
    if 'manutenção' in desc_lower or 'manut' in desc_lower or 'preventiva' in desc_lower:
        return TipoNota.MANUTENCAO
    elif 'assistencia' in desc_lower or 'assist' in desc_lower or 'corretiva' in desc_lower:
        return TipoNota.ASSISTENCIA

    return TipoNota.OUTROS


def limpar_descricao(descricao: str) -> str:
    if not descricao:
        return None
    descricao = re.sub(r'\.{2,}', ' ', descricao)
    descricao = re.sub(r'\s+', ' ', descricao)
    return descricao.strip()


def extrair_data_vencimento(discriminacao: str, fallback: date) -> date:
    if not discriminacao:
        return fallback

    match = re.search(r'[Vv]encimento[:\s\.]+(\d{2})\.(\d{2})\.(\d{4})', discriminacao)
    if match:
        dia, mes, ano = match.group(1), match.group(2), match.group(3)
        try:
            return datetime.strptime(f"{dia}/{mes}/{ano}", '%d/%m/%Y').date()
        except ValueError:
            pass

    match = re.search(r'vencimento[s]?\s+(\d{2})\.(\d{2})\.(\d{4})', discriminacao, re.IGNORECASE)
    if match:
        dia, mes, ano = match.group(1), match.group(2), match.group(3)
        try:
            return datetime.strptime(f"{dia}/{mes}/{ano}", '%d/%m/%Y').date()
        except ValueError:
            pass

    return fallback


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

    numero = get('NumeroNFe')
    data_emissao_str = get('DataEmissaoNFe')
    cnpj_emit = get('CPFCNPJPrestador/CNPJ')
    razao_emit = get('RazaoSocialPrestador')
    cnpj_dest = get('CPFCNPJTomador/CNPJ')
    razao_dest = get('RazaoSocialTomador')
    valor_servicos = get('ValorServicos')
    valor_total = float(valor_servicos) if valor_servicos else 0.0
    discriminacao = get('Discriminacao') or ''
    data_emissao = parse_date(data_emissao_str)
    tipo = detectar_tipo_automatico(tipo_fornecido, discriminacao)
    status_xml = get('StatusNFe')
    status = detectar_status_nfse(status_xml)

    parcelas = 1
    parcelas_match = re.search(r'parcela[s]?:\s*(\d+)', discriminacao.lower())
    if parcelas_match:
        parcelas = int(parcelas_match.group(1))

    condominio_id = None
    if cnpj_dest:
        cnpj_limpo = limpar_cnpj(cnpj_dest)
        condominio = NotaFiscalRepository.get_condominio_by_cnpj(db, cnpj_limpo)
        if condominio:
            condominio_id = condominio.id

    descricao_limpa = limpar_descricao(discriminacao)
    data_vencimento = extrair_data_vencimento(discriminacao, data_emissao)

    return {
        'numero_nota': numero or f"NFSE-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        'tipo': tipo,
        'status': status,
        'parcelas': parcelas,
        'valor': valor_total,
        'data_vencimento': data_vencimento,
        'data_emissao': data_emissao,
        'cliente_nome': razao_dest,
        'observacao': f"Emitente: {razao_emit} | CNPJ: {cnpj_emit}",
        'descricao_servico': descricao_limpa,
        'condominio_id': condominio_id,
        'xml_original': xml_str
    }


def extrair_dados_nfe(xml_str: str, db: Session, tipo_fornecido: Optional[str]) -> dict:
    root = ET.fromstring(xml_str)
    ns = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}

    def get(xpath):
        return find_text(root, xpath, ns)

    numero = get('.//nfe:ide/nfe:nNF')
    serie = get('.//nfe:ide/nfe:serie')
    data_emissao_str = get('.//nfe:ide/nfe:dhEmi')
    cnpj_emit = get('.//nfe:emit/nfe:CNPJ')
    razao_emit = get('.//nfe:emit/nfe:xNome')
    cnpj_dest = get('.//nfe:dest/nfe:CNPJ')
    razao_dest = get('.//nfe:dest/nfe:xNome')
    valor_total_str = get('.//nfe:total/nfe:ICMSTot/nfe:vNF')
    valor_total = float(valor_total_str) if valor_total_str else 0.0
    inf_compl = get('.//nfe:infAdic/nfe:infCpl') or ''
    data_emissao = parse_date(data_emissao_str)
    tipo = detectar_tipo_automatico(tipo_fornecido, inf_compl)
    c_stat = get('.//nfe:protNFe/nfe:infProt/nfe:cStat')
    status = detectar_status_nfe(c_stat)

    parcelas = 1
    parcelas_match = re.search(r'parcela[s]?:\s*(\d+)', inf_compl.lower())
    if parcelas_match:
        parcelas = int(parcelas_match.group(1))

    condominio_id = None
    if cnpj_dest:
        cnpj_limpo = limpar_cnpj(cnpj_dest)
        condominio = NotaFiscalRepository.get_condominio_by_cnpj(db, cnpj_limpo)
        if condominio:
            condominio_id = condominio.id

    descricao_limpa = limpar_descricao(inf_compl)
    data_vencimento = extrair_data_vencimento(inf_compl, data_emissao)

    return {
        'numero_nota': f"{numero}-{serie}" if serie and numero else (numero or f"NFE-{datetime.now().strftime('%Y%m%d%H%M%S')}"),
        'tipo': tipo,
        'status': status,
        'parcelas': parcelas,
        'valor': valor_total,
        'data_vencimento': data_vencimento,
        'data_emissao': data_emissao,
        'cliente_nome': razao_dest,
        'observacao': f"Emitente: {razao_emit} | CNPJ: {cnpj_emit}",
        'descricao_servico': descricao_limpa,
        'condominio_id': condominio_id,
        'xml_original': xml_str
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
    async def importar_xmls(db: Session, files: List[UploadFile], tipo_fornecido: Optional[str] = None):
        processados = 0
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

                if dados_nota.get('status') == StatusNota.CANCELADA:
                    canceladas += 1
                    erros.append({"arquivo": filename, "numero": dados_nota['numero_nota'], "erro": "Nota cancelada — não importada.", "tipo_erro": "cancelada"})
                    continue

                if NotaFiscalRepository.get_by_numero(db, dados_nota['numero_nota']):
                    continue

                nota_importada = NotaFiscalImportada(**dados_nota)
                db_nota = NotaFiscalRepository.create_importada(db, nota_importada)

                if dados_nota['condominio_id'] and dados_nota['tipo'] in [TipoNota.ASSISTENCIA, TipoNota.MANUTENCAO]:
                    try:
                        tipo_servico_str = "assistencia" if dados_nota['tipo'] == TipoNota.ASSISTENCIA else "manutencao"
                        servico = ServicoCreate(
                            condominio_id=dados_nota['condominio_id'],
                            tipo=tipo_servico_str,
                            data_servico=dados_nota['data_emissao'],
                            descricao=dados_nota['descricao_servico'],
                            nota_fiscal_id=db_nota.id
                        )
                        ServicoService.create_servico(db, servico)
                    except Exception as e:
                        erros.append({"arquivo": filename, "erro": f"Nota importada, mas falhou ao criar serviço: {e}"})

                processados += 1

            except (ET.ParseError, ValueError) as e:
                erros.append({"arquivo": filename, "erro": f"Erro de parsing: {e}"})
            except Exception as e:
                erros.append({"arquivo": filename, "erro": str(e)})

        return {"processados": processados, "canceladas": canceladas, "erros": erros}
