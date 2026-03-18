from app.domains.condominios.schema import CondominioCreate
from app.domains.enderecos.schema import EnderecoCreate

import re

def parse_auvo_address(address_str):
    """
    Tenta quebrar a string de endereço do Auvo em componentes separados.
    Exemplo: "Rua Exemplo, 123 - Bairro, Cidade - UF, 00000-000"
    """
    if not address_str:
        return {
            "rua": None,
            "numero": None,
            "bairro": None,
            "cidade": None,
            "estado": None,
            "cep": None
        }
    
    data = {
        "rua": None,
        "numero": None,
        "bairro": None,
        "cidade": None,
        "estado": None,
        "cep": None
    }
    
    try:
        # Trabalha com uma cópia para manipular
        remaining = address_str.strip()
        
        # 1. Extrair CEP (formato 00000-000 ou 00000000)
        cep_match = re.search(r'(\d{5}-?\d{3})', remaining)
        if cep_match:
            data["cep"] = cep_match.group(1)
            remaining = remaining.replace(cep_match.group(0), "").strip()

        # 2. Extrair Estado (UF) - Geralmente no final
        # Procura por ", SP" ou "- SP" ou " SP" no final
        uf_match = re.search(r'[,\-\s]+([A-Z]{2})\s*$', remaining)
        if uf_match:
            data["estado"] = uf_match.group(1)
            remaining = remaining[:uf_match.start()].strip()
        
        # 3. Quebrar por vírgulas
        parts = [p.strip() for p in remaining.split(',') if p.strip()]
        
        if len(parts) >= 1:
            # Primeira parte: Rua + Número
            first_part = parts[0]
            # Tenta separar número do final da rua
            num_match = re.search(r'\s+(\d+|S/?N)\s*$', first_part)
            if num_match:
                data["numero"] = num_match.group(1).strip()
                data["rua"] = first_part[:num_match.start()].strip()
            else:
                data["rua"] = first_part.strip()
        
        if len(parts) >= 2:
            # Segunda parte: pode ser Bairro ou "Número - Bairro"
            second_part = parts[1]
            
            # Se não pegamos número antes, tenta pegar aqui
            if not data["numero"]:
                num_match = re.match(r'^(\d+|S/?N)\s*[-\s]+(.+)$', second_part)
                if num_match:
                    data["numero"] = num_match.group(1).strip()
                    data["bairro"] = num_match.group(2).strip()
                else:
                    data["bairro"] = second_part.strip()
            else:
                # Remove traço inicial se houver
                data["bairro"] = second_part.strip().lstrip('-').strip()
        
        if len(parts) >= 3:
            # Terceira parte: Cidade
            data["cidade"] = parts[2].strip().lstrip('-').strip()
        
    except Exception as e:
        print(f"Erro ao parsear endereço '{address_str}': {e}")
        # Em caso de erro, mantém pelo menos a string original na rua
        data["rua"] = address_str
        
    return data


def clean_string(value):
    """Converte string vazia ou apenas espaços em None"""
    if not value:
        return None
    cleaned = str(value).strip()
    return cleaned if cleaned else None


class AuvoMapper:
    
    @staticmethod
    def to_condominio_create(auvo_data: dict) -> CondominioCreate:
        """Mapeia dados do cliente Auvo para CondominioCreate"""
        # Pega o nome do campo correto do Auvo
        nome = auvo_data.get("description") or auvo_data.get("legalName") or "Sem Nome"
        
        # IMPORTANTE: Limpa o CNPJ - converte vazio para None
        cnpj = clean_string(auvo_data.get("cpfCnpj"))
        razao_social = clean_string(auvo_data.get("legalName"))
        
        return CondominioCreate(
            nome=nome,
            cnpj=cnpj,  # Agora será None se vazio
            razao_social=razao_social,
            observacao=f"Sincronizado do Auvo. ID: {auvo_data.get('id')}",
            ativo=True
        )

    @staticmethod
    def to_endereco_create(auvo_data: dict, condominio_id: int) -> EnderecoCreate:
        """Mapeia endereço do cliente Auvo para EnderecoCreate"""
        # Pega o endereço bruto do Auvo
        raw_address = auvo_data.get("address", "")
        
        # Parseia o endereço em componentes
        parsed = parse_auvo_address(raw_address)
        
        # Log para debug (opcional - pode remover depois)
        # print(f"Endereço parseado de '{raw_address}': {parsed}")

        return EnderecoCreate(
            condominio_id=condominio_id,
            rua=parsed["rua"],
            numero=parsed["numero"],
            bairro=parsed["bairro"],
            cidade=parsed["cidade"],
            estado=parsed["estado"],
            cep=parsed["cep"],
            complemento=None,  # Auvo geralmente não tem complemento separado
            latitude=auvo_data.get("latitude"),
            longitude=auvo_data.get("longitude")
        )
    
    @staticmethod
    def to_contato_create(auvo_contact: dict, condominio_id: int):
        """Mapeia contato do Auvo para criar no banco"""
        return {
            "condominio_id": condominio_id,
            "nome": auvo_contact.get("name") or "Sem Nome",
            "telefone": clean_string(auvo_contact.get("phone")),
            "email": clean_string(auvo_contact.get("email")),
            "funcao": clean_string(auvo_contact.get("jobPosition")),
            "principal": False  
        }