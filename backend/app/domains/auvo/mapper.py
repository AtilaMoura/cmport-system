from app.domains.condominios.schema import CondominioCreate
from app.domains.enderecos.schema import EnderecoCreate

class AuvoMapper:
    @staticmethod
    def to_condominio_create(auvo_data: dict) -> CondominioCreate:
        """Mapeia dados do cliente Auvo para CondominioCreate"""
        return CondominioCreate(
            nome=auvo_data.get("legalName"),
            auvo_id=auvo_data.get("id"),
            cnpj=auvo_data.get("cpfCnpj"),
            razao_social=auvo_data.get("legalName"),
            observacao=f"Sincronizado do Auvo. ID: {auvo_data.get('id')}",
            ativo=True
        )

    @staticmethod
    def to_endereco_create(auvo_data: dict, condominio_id: int) -> EnderecoCreate:
        """Mapeia endereço do cliente Auvo para EnderecoCreate"""
        # O Auvo geralmente retorna 'address', 'addressNumber', etc.
        return EnderecoCreate(
            condominio_id=condominio_id,
            rua=auvo_data.get("address"),
            complemento=auvo_data.get("legalName"),
            latitude=auvo_data.get("latitude"),
            longitude=auvo_data.get("longitude")
        )
    
    @staticmethod
    def to_contato_create(auvo_contact: dict, condominio_id: int):
        # Função auxiliar interna para transformar "" em None
        def clean(value):
            return value if value and str(value).strip() != "" else None
    
        return {
            "condominio_id": condominio_id,
            "nome": auvo_contact.get("name") or "Sem Nome",
            "telefone": clean(auvo_contact.get("phone")),
            "email": clean(auvo_contact.get("email")),
            "funcao": clean(auvo_contact.get("jobPosition")),
            "principal": False  
        }