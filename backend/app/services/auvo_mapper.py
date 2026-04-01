import re
from app.schemas.condominio_schema import CondominioCreate
from app.schemas.endereco_schema import EnderecoCreate


def parse_auvo_address(address_str):
    if not address_str:
        return {"rua": None, "numero": None, "bairro": None, "cidade": None, "estado": None, "cep": None}

    data = {"rua": None, "numero": None, "bairro": None, "cidade": None, "estado": None, "cep": None}

    try:
        remaining = address_str.strip()

        cep_match = re.search(r'(\d{5}-?\d{3})', remaining)
        if cep_match:
            data["cep"] = cep_match.group(1)
            remaining = remaining.replace(cep_match.group(0), "").strip()

        uf_match = re.search(r'[,\-\s]+([A-Z]{2})\s*$', remaining)
        if uf_match:
            data["estado"] = uf_match.group(1)
            remaining = remaining[:uf_match.start()].strip()

        parts = [p.strip() for p in remaining.split(',') if p.strip()]

        if len(parts) >= 1:
            first_part = parts[0]
            num_match = re.search(r'\s+(\d+|S/?N)\s*$', first_part)
            if num_match:
                data["numero"] = num_match.group(1).strip()
                data["rua"] = first_part[:num_match.start()].strip()
            else:
                data["rua"] = first_part.strip()

        if len(parts) >= 2:
            second = parts[1].strip()
            if not data["numero"]:
                if re.match(r'^(\d+|S/?N)$', second, re.IGNORECASE):
                    # Número isolado como 2º token (ex: "AV X, 123, BAIRRO") → desloca bairro e cidade
                    data["numero"] = second
                    if len(parts) >= 3:
                        data["bairro"] = parts[2].strip().lstrip('-').strip()
                    if len(parts) >= 4:
                        data["cidade"] = parts[3].strip().lstrip('-').strip()
                else:
                    num_match = re.match(r'^(\d+|S/?N)\s*[-\s]+(.+)$', second, re.IGNORECASE)
                    if num_match:
                        data["numero"] = num_match.group(1).strip()
                        data["bairro"] = num_match.group(2).strip()
                    else:
                        data["bairro"] = second.lstrip('-').strip()
                    if len(parts) >= 3:
                        data["cidade"] = parts[2].strip().lstrip('-').strip()
            else:
                data["bairro"] = second.lstrip('-').strip()
                if len(parts) >= 3:
                    data["cidade"] = parts[2].strip().lstrip('-').strip()

    except Exception as e:
        print(f"Erro ao parsear endereço '{address_str}': {e}")
        data["rua"] = address_str

    return data


def clean_string(value):
    if not value:
        return None
    cleaned = str(value).strip()
    return cleaned if cleaned else None


class AuvoMapper:

    @staticmethod
    def to_condominio_create(auvo_data: dict) -> CondominioCreate:
        nome = auvo_data.get("description") or auvo_data.get("legalName") or "Sem Nome"
        cnpj = clean_string(auvo_data.get("cpfCnpj"))
        razao_social = clean_string(auvo_data.get("legalName"))
        return CondominioCreate(
            nome=nome,
            cnpj=cnpj,
            razao_social=razao_social,
            observacao=f"Sincronizado do Auvo. ID: {auvo_data.get('id')}",
            ativo=True
        )

    @staticmethod
    def to_endereco_create(auvo_data: dict, condominio_id: int) -> EnderecoCreate:
        raw_address = auvo_data.get("address", "")
        parsed = parse_auvo_address(raw_address)
        return EnderecoCreate(
            condominio_id=condominio_id,
            rua=parsed["rua"],
            numero=parsed["numero"],
            bairro=parsed["bairro"],
            cidade=parsed["cidade"],
            estado=parsed["estado"],
            cep=parsed["cep"],
            complemento=None,
            latitude=auvo_data.get("latitude"),
            longitude=auvo_data.get("longitude")
        )

    @staticmethod
    def to_contato_create(auvo_contact: dict, condominio_id: int):
        return {
            "condominio_id": condominio_id,
            "nome": auvo_contact.get("name") or "Sem Nome",
            "telefone": clean_string(auvo_contact.get("phone")),
            "email": clean_string(auvo_contact.get("email")),
            "funcao": clean_string(auvo_contact.get("jobPosition")),
            "principal": False
        }
