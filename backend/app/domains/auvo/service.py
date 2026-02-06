from sqlalchemy.orm import Session
from .client import auvo_client
from .mapper import AuvoMapper
from app.domains.condominios.repository import CondominioRepository
from app.domains.enderecos.service import EnderecoService
# Adicione o import do repositório de contatos aqui embaixo
from app.domains.contatos.repository import ContatoRepository 

class AuvoSyncService:
    @staticmethod
    def sync_all_customers(db: Session):
        """Sincroniza todos os clientes do Auvo com o banco local"""
        auvo_customers = auvo_client.get_customers(page_size=100)
        
        relatorio = {"novos": 0, "atualizados": 0, "erros": 0}

        for customer in auvo_customers:
            try:
                auvo_id = customer.get("id")
                existing = CondominioRepository.get_by_auvo_id(db, auvo_id)
                condo_data = AuvoMapper.to_condominio_create(customer)
                
                if existing:
                    CondominioRepository.update(db, existing.id, condo_data)
                    condominio_id = existing.id
                    relatorio["atualizados"] += 1
                else:
                    new_condo = CondominioRepository.create_with_auvo(db, condo_data, auvo_id)
                    condominio_id = new_condo.id
                    relatorio["novos"] += 1
                
                # 1. Sincroniza o endereço
                addr_data = AuvoMapper.to_endereco_create(customer, condominio_id)
                EnderecoService.create_endereco(db, addr_data)
                
                # --- 2. NOVA PARTE: SINCRONIZAÇÃO DE CONTATOS ---
                auvo_contacts = customer.get("contacts", [])
                for contact in auvo_contacts:
                    contact_data = AuvoMapper.to_contato_create(contact, condominio_id)
                    # Aqui usamos o Repository de contatos para salvar
                    ContatoRepository.create(db, contact_data)
                # -----------------------------------------------

            except Exception as e:
                # Dica: troque 'name' por 'description' no print, já que o Auvo usa description
                print(f"Erro ao sincronizar cliente {customer.get('description')}: {e}")
                relatorio["erros"] += 1
        
        return relatorio