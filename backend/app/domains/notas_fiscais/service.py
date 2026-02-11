# service.py
from sqlalchemy.orm import Session
from typing import List, Optional
from fastapi import UploadFile
from datetime import datetime, date
import xml.etree.ElementTree as ET
import zipfile
import io
import re

# --- Verifique se estes imports correspondem à sua estrutura de projeto ---
from .repository import NotaFiscalRepository
from .schema import NotaFiscalCreate, NotaFiscalResponse, NotaFiscalImportada
from ..manutencoes_assistencias.schema import ServicoCreate
from ..manutencoes_assistencias.service import ServicoService
from .model import TipoNota
# --------------------------------------------------------------------------


def limpar_cnpj(cnpj: str) -> str:
    """Remove caracteres não numéricos do CNPJ."""
    return "".join(filter(str.isdigit, cnpj or ""))


def parse_date(data_str: str) -> date:
    """Converte string de data ISO para objeto date."""
    if not data_str:
        return date.today()
    data_limpa = data_str.split('T')[0]
    return datetime.strptime(data_limpa, '%Y-%m-%d').date()


def find_text(root, xpath_expr, namespaces=None):
    """Busca texto em um elemento XML de forma segura."""
    el = root.find(xpath_expr, namespaces) if namespaces else root.find(xpath_expr)
    return el.text.strip() if el is not None and el.text else None


def detectar_tipo_automatico(tipo_fornecido: Optional[str], descricao: str) -> TipoNota:
    """Detecta o tipo da nota fiscal (ASSISTENCIA ou MANUTENCAO) pela descrição."""
    if tipo_fornecido:
        tipo_upper = tipo_fornecido.upper()
        if tipo_upper == "ASSISTENCIA":
            return TipoNota.ASSISTENCIA
        elif tipo_upper == "MANUTENCAO":
            return TipoNota.MANUTENCAO
        else:
            return TipoNota.OUTROS

    desc_lower = (descricao or "").lower()
    if 'manutenção' in desc_lower or 'manut' in desc_lower or 'preventiva' in desc_lower:
        return TipoNota.MANUTENCAO
    elif 'assistencia' in desc_lower or 'assist' in desc_lower or 'corretiva' in desc_lower:
        return TipoNota.ASSISTENCIA

    return TipoNota.OUTROS


def extrair_dados_nfse(xml_str: str, db: Session, tipo_fornecido: Optional[str]) -> dict:
    """Extrai dados de NFSe (Nota Fiscal de Serviço Eletrônica)."""
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

    return {
        'numero_nota': numero or f"NFSE-{datetime.now().strftime('%Y%m%d%H%M%S')}",
        'tipo': tipo,
        'parcelas': parcelas,
        'valor': valor_total,
        'data_vencimento': data_emissao,
        'data_emissao': data_emissao,
        'cliente_nome': razao_dest,
        'observacao': f"Emitente: {razao_emit} | CNPJ: {cnpj_emit}",
        'descricao_servico': discriminacao[:500] if discriminacao else None,
        'condominio_id': condominio_id,
        'xml_original': xml_str
    }


def extrair_dados_nfe(xml_str: str, db: Session, tipo_fornecido: Optional[str]) -> dict:
    """Extrai dados de NFe (modelo 55, produtos)."""
    root = ET.fromstring(xml_str)
    ns = {'nfe': 'http://www.portalfiscal.inf.br/nfe'}

    def get(xpath ):
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
        'data_vencimento': data_emissao,
        'data_emissao': data_emissao,
        'cliente_nome': razao_dest,
        'observacao': f"Emitente: {razao_emit} | CNPJ: {cnpj_emit}",
        'descricao_servico': inf_compl[:500] if inf_compl else None,
        'condominio_id': condominio_id,
        'xml_original': xml_str
    }


def detectar_tipo_xml(xml_str: str) -> str:
    """Detecta de forma mais inteligente se o XML é NFe (produto) ou NFSe (serviço)."""
    if '<RazaoSocialPrestador>' in xml_str and '<ValorServicos>' in xml_str:
        return 'NFSe'
    if '<infNFe' in xml_str and 'http://www.portalfiscal.inf.br/nfe' in xml_str:
        return 'NFe'

    try:
        root = ET.fromstring(xml_str )
        if root.find('.//RazaoSocialPrestador') is not None:
            return 'NFSe'
        if root.find('.//{http://www.portalfiscal.inf.br/nfe}infNFe' ) is not None:
            return 'NFe'
    except ET.ParseError:
        raise ValueError("Arquivo não parece ser um XML válido.")

    print("⚠️  Não foi possível detectar o tipo do XML com certeza, assumindo NFe.")
    return 'NFe'


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
        return NotaFiscalResponse.model_validate(nota) if nota else None

    @staticmethod
    def get_nota_by_numero(db: Session, numero: str):
        nota = NotaFiscalRepository.get_by_numero(db, numero)
        return NotaFiscalResponse.model_validate(nota) if nota else None

    @staticmethod
    async def importar_xmls(db: Session, files: List[UploadFile], tipo_fornecido: Optional[str] = None):
        """Importa múltiplos arquivos XML de NFe/NFSe, inclusive de dentro de arquivos ZIP."""
        processados = 0
        erros = []
        xmls_para_processar = []

        for file in files:
            try:
                conteudo = await file.read()
                filename = file.filename

                if filename.lower().endswith('.zip'):
                    print(f"📦 Processando arquivo ZIP: {filename}")
                    try:
                        with zipfile.ZipFile(io.BytesIO(conteudo)) as zip_ref:
                            for zip_info in zip_ref.filelist:
                                if not zip_info.is_dir() and zip_info.filename.lower().endswith('.xml'):
                                    xml_content = zip_ref.read(zip_info.filename)
                                    xmls_para_processar.append({'filename': f"{filename}/{zip_info.filename}", 'content': xml_content})
                                    print(f"   -> Extraído: {zip_info.filename}")
                    except zipfile.BadZipFile:
                        erros.append({"arquivo": filename, "erro": "Arquivo ZIP corrompido ou inválido."})

                elif filename.lower().endswith('.xml'):
                    xmls_para_processar.append({'filename': filename, 'content': conteudo})
                else:
                    erros.append({"arquivo": filename, "erro": "Formato não suportado. Use apenas .xml ou .zip."})
            except Exception as e:
                erros.append({"arquivo": file.filename, "erro": f"Erro inesperado ao ler arquivo: {e}"})

        for xml_data in xmls_para_processar:
            filename = xml_data['filename']
            try:
                xml_bytes = xml_data['content']
                try:
                    xml_str = xml_bytes.decode('utf-8')
                except UnicodeDecodeError:
                    xml_str = xml_bytes.decode('latin-1')

                tipo_xml = detectar_tipo_xml(xml_str)
                print(f"🔍 Arquivo '{filename}' detectado como: {tipo_xml}")

                if tipo_xml == 'NFSe':
                    dados_nota = extrair_dados_nfse(xml_str, db, tipo_fornecido)
                else:
                    dados_nota = extrair_dados_nfe(xml_str, db, tipo_fornecido)

                if NotaFiscalRepository.get_by_numero(db, dados_nota['numero_nota']):
                    print(f"⚠️  Nota {dados_nota['numero_nota']} já existe. Pulando.")
                    continue

                nota_importada = NotaFiscalImportada(**dados_nota)
                db_nota = NotaFiscalRepository.create_importada(db, nota_importada)
                print(f"✅ Nota {db_nota.numero_nota} importada com sucesso!")

                if dados_nota['condominio_id']:
                    print(f"   🏢 Vinculada ao condomínio ID: {dados_nota['condominio_id']}")

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
                        print(f"   🔧 Serviço de {tipo_servico_str} criado e vinculado.")
                    except Exception as e:
                        print(f"   ❌ Erro ao criar serviço associado: {e}")
                        erros.append({"arquivo": filename, "erro": f"Nota importada, mas falhou ao criar serviço: {e}"})
                
                processados += 1

            except (ET.ParseError, ValueError) as e:
                erros.append({"arquivo": filename, "erro": f"Erro de parsing no XML: {e}"})
            except Exception as e:
                print(f"❌ Erro crítico ao processar o arquivo {filename}: {e}")
                erros.append({"arquivo": filename, "erro": str(e)})

        print("\n--- Relatório Final da Importação ---")
        print(f"   ✅ {processados} notas fiscais importadas com sucesso.")
        print(f"   ❌ {len(erros)} arquivos com erro.")
        if erros:
            print("   Detalhes dos erros:")
            for erro in erros:
                print(f"     - Arquivo: {erro['arquivo']}, Erro: {erro['erro']}")

        return {"processados": processados, "erros": erros}

