from sqlalchemy.orm import Session
from typing import List, Optional
from fastapi import UploadFile
from datetime import datetime, date
import xml.etree.ElementTree as ET
import zipfile
import io
import re

from .repository import NotaFiscalRepository
from .schema import NotaFiscalCreate, NotaFiscalResponse, NotaFiscalImportada
from ..manutencoes_assistencias.schema import ServicoCreate
from ..manutencoes_assistencias.service import ServicoService
from .model import TipoNota


def limpar_cnpj(cnpj: str) -> str:
    """Remove caracteres não numéricos do CNPJ"""
    return "".join(filter(str.isdigit, cnpj or ""))


def parse_date(data_str: str) -> date:
    """Converte string de data ISO para date"""
    if not data_str:
        return date.today()
    
    # Remove timezone e pega apenas a data
    data_limpa = data_str.split('T')[0]
    return datetime.strptime(data_limpa, '%Y-%m-%d').date()


def find_text(root, xpath_expr, namespaces=None):
    """Busca texto em um elemento XML"""
    el = root.find(xpath_expr, namespaces) if namespaces else root.find(xpath_expr)
    return el.text if el is not None and el.text else None


def detectar_tipo_automatico(tipo_fornecido: Optional[str], descricao: str) -> TipoNota:
    """Detecta o tipo da nota fiscal"""
    if tipo_fornecido:
        tipo_upper = tipo_fornecido.upper()
        if tipo_upper == "ASSISTENCIA":
            return TipoNota.ASSISTENCIA
        elif tipo_upper == "MANUTENCAO":
            return TipoNota.MANUTENCAO
        else:
            return TipoNota.OUTROS
    
    # Auto-detecção
    desc_lower = descricao.lower()
    if 'manutencao' in desc_lower or 'manut' in desc_lower or 'preventiva' in desc_lower:
        return TipoNota.MANUTENCAO
    elif 'assistencia' in desc_lower or 'assist' in desc_lower or 'corretiva' in desc_lower:
        return TipoNota.ASSISTENCIA
    
    return TipoNota.OUTROS


def extrair_dados_nfse(xml_str: str, db: Session, tipo_fornecido: Optional[str]) -> dict:
    """
    Extrai dados de NFSe (Nota Fiscal de Serviço Eletrônica)
    Formato: Prefeitura de São Paulo
    """
    root = ET.fromstring(xml_str)
    
    # NFSe não usa namespace (ou usa vazio)
    def get(tag):
        el = root.find(f".//{tag}")
        return el.text.strip() if el is not None and el.text else None
    
    # Dados principais
    numero = get('NumeroNFe')
    data_emissao_str = get('DataEmissaoNFe')
    
    # Prestador (emitente)
    cnpj_emit = get('CPFCNPJPrestador/CNPJ')
    razao_emit = get('RazaoSocialPrestador')
    
    # Tomador (destinatário/cliente)
    cnpj_dest = get('CPFCNPJTomador/CNPJ')
    razao_dest = get('RazaoSocialTomador')
    
    # Valores
    valor_servicos = get('ValorServicos')
    valor_total = float(valor_servicos) if valor_servicos else 0.0
    
    # Discriminação (descrição do serviço)
    discriminacao = get('Discriminacao') or ''
    
    # Data de vencimento
    data_vencimento = parse_date(data_emissao_str)
    
    # Detecta tipo
    tipo = detectar_tipo_automatico(tipo_fornecido, discriminacao)
    
    # Detecta número de parcelas
    parcelas = 1
    parcelas_match = re.search(r'parcela[s]?:\s*(\d+)', discriminacao.lower())
    if parcelas_match:
        parcelas = int(parcelas_match.group(1))
    
    # Tenta vincular ao condomínio
    condominio_id = None
    if cnpj_dest:
        cnpj_limpo = limpar_cnpj(cnpj_dest)
        condominio = NotaFiscalRepository.get_condominio_by_cnpj(db, cnpj_limpo)
        if condominio:
            condominio_id = condominio.id
    
    return {
        'numero_nota': numero or f"NFSE-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        'tipo': tipo,
        'parcelas': parcelas,
        'valor': valor_total,
        'data_vencimento': data_vencimento,
        'data_emissao': data_vencimento,
        'cliente_nome': razao_dest,
        'observacao': f"Emitente: {razao_emit} | CNPJ: {cnpj_emit}",
        'descricao_servico': discriminacao[:500] if discriminacao else None,
        'condominio_id': condominio_id,
        'xml_original': xml_str
    }


def extrair_dados_nfe(xml_str: str, db: Session, tipo_fornecido: Optional[str]) -> dict:
    """Extrai dados de NFe (modelo 55)"""
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
    
    inf_compl = get('.//nfe:infCpl') or ''
    
    data_vencimento = parse_date(data_emissao_str)
    tipo = detectar_tipo_automatico(tipo_fornecido, inf_compl)
    
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
    
    return {
        'numero_nota': f"{numero}-{serie}" if serie and numero else (numero or f"NFE-{datetime.now().strftime('%Y%m%d%H%M%S')}"),
        'tipo': tipo,
        'parcelas': parcelas,
        'valor': valor_total,
        'data_vencimento': data_vencimento,
        'data_emissao': data_vencimento,
        'cliente_nome': razao_dest,
        'observacao': f"Emitente: {razao_emit} | CNPJ: {cnpj_emit}",
        'descricao_servico': inf_compl[:500] if inf_compl else None,
        'condominio_id': condominio_id,
        'xml_original': xml_str
    }


def detectar_tipo_xml(xml_str: str) -> str:
    """Detecta se é NFe ou NFSe pelo conteúdo do XML"""
    if 'http://www.portalfiscal.inf.br/nfe' in xml_str or '<nfe:' in xml_str or '<NFe' in xml_str:
        return 'NFe'
    elif '<NFe xmlns="">' in xml_str or '<NumeroNFe>' in xml_str or '<RazaoSocialPrestador>' in xml_str:
        return 'NFSe'
    else:
        # Tenta detectar pela estrutura
        root = ET.fromstring(xml_str)
        if root.find('.//NumeroNFe') is not None:
            return 'NFSe'
        elif root.find('.//{http://www.portalfiscal.inf.br/nfe}nNF') is not None:
            return 'NFe'
    
    return 'NFe'  # Default


class NotaFiscalService:

    @staticmethod
    def create_nota(db: Session, nota: NotaFiscalCreate):
        db_nota = NotaFiscalRepository.create(db, nota)
        return NotaFiscalResponse.model_validate(db_nota)

    @staticmethod
    def get_all_notas(db: Session):
        notas = NotaFiscalRepository.get_all(db)
        return [NotaFiscalResponse.model_validate(n) for n in notas]

    @staticmethod
    def get_nota_by_id(db: Session, id: int):
        nota = NotaFiscalRepository.get_by_id(db, id)
        if not nota:
            return None
        return NotaFiscalResponse.model_validate(nota)

    @staticmethod
    def get_nota_by_numero(db: Session, numero: str):
        nota = NotaFiscalRepository.get_by_numero(db, numero)
        if not nota:
            return None
        return NotaFiscalResponse.model_validate(nota)

    @staticmethod
    async def importar_xmls(db: Session, files: List[UploadFile], tipo_fornecido: Optional[str] = None):
        """Importa XMLs de NFe/NFSe"""
        processados = 0
        erros = []
        xmls_para_processar = []
        
        # FASE 1: Coleta XMLs
        for file in files:
            try:
                conteudo = await file.read()
                
                if file.filename.lower().endswith('.zip'):
                    print(f"📦 Processando ZIP: {file.filename}")
                    
                    try:
                        with zipfile.ZipFile(io.BytesIO(conteudo)) as zip_ref:
                            for zip_info in zip_ref.filelist:
                                if zip_info.is_dir():
                                    continue
                                
                                if zip_info.filename.lower().endswith('.xml'):
                                    xml_content = zip_ref.read(zip_info.filename)
                                    xmls_para_processar.append({
                                        'filename': f"{file.filename}/{zip_info.filename}",
                                        'content': xml_content
                                    })
                                    print(f"   ✓ Extraído: {zip_info.filename}")
                    
                    except zipfile.BadZipFile:
                        erros.append({
                            "arquivo": file.filename,
                            "erro": "Arquivo ZIP corrompido ou inválido"
                        })
                        continue
                
                elif file.filename.lower().endswith('.xml'):
                    xmls_para_processar.append({
                        'filename': file.filename,
                        'content': conteudo
                    })
                
                else:
                    erros.append({
                        "arquivo": file.filename,
                        "erro": "Formato não suportado (use .xml ou .zip)"
                    })
            
            except Exception as e:
                erros.append({
                    "arquivo": file.filename,
                    "erro": f"Erro ao ler arquivo: {str(e)}"
                })
        
        # FASE 2: Processa XMLs
        for xml_data in xmls_para_processar:
            try:
                filename = xml_data['filename']
                xml_bytes = xml_data['content']
                xml_str = xml_bytes.decode('utf-8')
                
                # Detecta tipo de XML
                tipo_xml = detectar_tipo_xml(xml_str)
                print(f"🔍 Detectado: {tipo_xml} - {filename}")
                
                # Extrai dados conforme o tipo
                if tipo_xml == 'NFSe':
                    dados_nfe = extrair_dados_nfse(xml_str, db, tipo_fornecido)
                else:
                    dados_nfe = extrair_dados_nfe(xml_str, db, tipo_fornecido)
                
                # Verifica duplicidade
                if NotaFiscalRepository.get_by_numero(db, dados_nfe['numero_nota']):
                    print(f"⚠️  {dados_nfe['numero_nota']} já existe - pulando")
                    continue
                
                # Cria nota
                nota = NotaFiscalImportada(**dados_nfe)
                db_nota = NotaFiscalRepository.create_importada(db, nota)
                
                # Cria serviço se aplicável
                if dados_nfe['condominio_id'] and dados_nfe['tipo'] in [TipoNota.ASSISTENCIA, TipoNota.MANUTENCAO]:
                    try:
                        tipo_servico = "assistencia" if dados_nfe['tipo'] == TipoNota.ASSISTENCIA else "manutencao"
                        
                        servico = ServicoCreate(
                            condominio_id=dados_nfe['condominio_id'],
                            tipo=tipo_servico,
                            data_servico=dados_nfe['data_emissao'],
                            descricao=dados_nfe['descricao_servico'],
                            nota_fiscal_id=db_nota.id
                        )
                        
                        ServicoService.create_servico(db, servico)
                        print(f"   🔧 Serviço de {tipo_servico} criado")
                    
                    except Exception as e:
                        print(f"   ⚠️  Erro ao criar serviço: {e}")
                
                processados += 1
                print(f"✅ {dados_nfe['numero_nota']} importada")
                
                if dados_nfe['condominio_id']:
                    print(f"   🏢 Vinculada ao condomínio ID: {dados_nfe['condominio_id']}")
            
            except ET.ParseError as e:
                erros.append({
                    "arquivo": filename,
                    "erro": f"XML inválido: {str(e)}"
                })
            
            except Exception as e:
                print(f"❌ Erro em {filename}: {e}")
                erros.append({
                    "arquivo": filename,
                    "erro": str(e)
                })
        
        print(f"\n📊 Importação finalizada:")
        print(f"   ✅ Processados: {processados}")
        print(f"   ❌ Erros: {len(erros)}")
        
        return {
            "processados": processados,
            "erros": erros
        }