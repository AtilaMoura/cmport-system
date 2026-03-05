from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.services.auvo_client import auvo_client
from app.services.auvo_mapper import AuvoMapper
from app.repositories.condominio_repository import CondominioRepository
from app.services.endereco_service import EnderecoService
from app.repositories.contato_repository import ContatoRepository


class AuvoSyncService:

    @staticmethod
    def sync_all_customers(db: Session):
        auvo_customers = auvo_client.get_customers(page_size=100)

        relatorio = {"novos": 0, "atualizados": 0, "erros": 0, "detalhes_erros": []}

        for customer in auvo_customers:
            cliente_nome = customer.get("description") or customer.get("legalName") or f"ID {customer.get('id')}"
            try:
                auvo_id = customer.get("id")
                existing = CondominioRepository.get_by_auvo_id(db, auvo_id)
                condo_data = AuvoMapper.to_condominio_create(customer)

                if not condo_data.nome or len(condo_data.nome.strip()) < 3:
                    print(f"Cliente '{cliente_nome}' ignorado: nome inválido")
                    relatorio["erros"] += 1
                    relatorio["detalhes_erros"].append({"cliente": cliente_nome, "erro": "Nome inválido"})
                    continue

                if existing:
                    CondominioRepository.update(db, existing.id, condo_data)
                    condominio_id = existing.id
                    relatorio["atualizados"] += 1
                else:
                    new_condo = CondominioRepository.create_with_auvo(db, condo_data, auvo_id)
                    condominio_id = new_condo.id
                    relatorio["novos"] += 1

                try:
                    addr_data = AuvoMapper.to_endereco_create(customer, condominio_id)
                    EnderecoService.create_endereco(db, addr_data)
                except Exception as e:
                    print(f"Erro ao sincronizar endereço: {e}")

                try:
                    for contact in customer.get("contacts", []):
                        contact_data = AuvoMapper.to_contato_create(contact, condominio_id)
                        ContatoRepository.create(db, contact_data)
                except Exception as e:
                    print(f"Erro ao sincronizar contatos: {e}")

            except IntegrityError as e:
                db.rollback()
                error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
                relatorio["erros"] += 1
                relatorio["detalhes_erros"].append({"cliente": cliente_nome, "erro": f"Integridade: {error_msg}"})
            except Exception as e:
                db.rollback()
                relatorio["erros"] += 1
                relatorio["detalhes_erros"].append({"cliente": cliente_nome, "erro": str(e)})

        return relatorio
