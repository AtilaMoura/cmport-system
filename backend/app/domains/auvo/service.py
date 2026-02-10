from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from .client import auvo_client
from .mapper import AuvoMapper
from app.domains.condominios.repository import CondominioRepository
from app.domains.enderecos.service import EnderecoService
from app.domains.contatos.repository import ContatoRepository 


class AuvoSyncService:
    @staticmethod
    def sync_all_customers(db: Session):
        """Sincroniza todos os clientes do Auvo com o banco local"""
        auvo_customers = auvo_client.get_customers(page_size=100)
        
        relatorio = {
            "novos": 0, 
            "atualizados": 0, 
            "erros": 0,
            "detalhes_erros": []
        }

        for customer in auvo_customers:
            # Nome do cliente para debug
            cliente_nome = customer.get("description") or customer.get("legalName") or f"ID {customer.get('id')}"
            
            try:
                auvo_id = customer.get("id")
                
                # Verifica se já existe
                existing = CondominioRepository.get_by_auvo_id(db, auvo_id)
                
                # Mapeia os dados do Auvo
                condo_data = AuvoMapper.to_condominio_create(customer)
                
                # Valida se o nome tem pelo menos 3 caracteres
                if not condo_data.nome or len(condo_data.nome.strip()) < 3:
                    print(f"⚠️  Cliente '{cliente_nome}' ignorado: nome inválido ('{condo_data.nome}')")
                    relatorio["erros"] += 1
                    relatorio["detalhes_erros"].append({
                        "cliente": cliente_nome,
                        "erro": "Nome deve ter pelo menos 3 caracteres",
                        "nome_recebido": condo_data.nome
                    })
                    continue
                
                # Cria ou atualiza o condomínio
                if existing:
                    CondominioRepository.update(db, existing.id, condo_data)
                    condominio_id = existing.id
                    relatorio["atualizados"] += 1
                    print(f"✅ Condomínio '{cliente_nome}' atualizado (ID: {condominio_id})")
                else:
                    new_condo = CondominioRepository.create_with_auvo(db, condo_data, auvo_id)
                    condominio_id = new_condo.id
                    relatorio["novos"] += 1
                    print(f"✨ Novo condomínio '{cliente_nome}' criado (ID: {condominio_id})")
                
                # 1. Sincroniza o endereço
                try:
                    addr_data = AuvoMapper.to_endereco_create(customer, condominio_id)
                    EnderecoService.create_endereco(db, addr_data)
                    print(f"   📍 Endereço sincronizado")
                except Exception as e:
                    print(f"   ⚠️  Erro ao sincronizar endereço: {e}")
                
                # 2. Sincroniza contatos
                try:
                    auvo_contacts = customer.get("contacts", [])
                    for contact in auvo_contacts:
                        contact_data = AuvoMapper.to_contato_create(contact, condominio_id)
                        ContatoRepository.create(db, contact_data)
                    if auvo_contacts:
                        print(f"   👥 {len(auvo_contacts)} contato(s) sincronizado(s)")
                except Exception as e:
                    print(f"   ⚠️  Erro ao sincronizar contatos: {e}")

            except IntegrityError as e:
                # Erro de integridade (CNPJ duplicado, etc)
                db.rollback()  # IMPORTANTE: Faz rollback para limpar a sessão
                error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
                print(f"❌ Erro de integridade ao sincronizar '{cliente_nome}': {error_msg}")
                relatorio["erros"] += 1
                relatorio["detalhes_erros"].append({
                    "cliente": cliente_nome,
                    "erro": f"Erro de integridade: {error_msg}"
                })
                
            except Exception as e:
                # Outros erros
                db.rollback()  # IMPORTANTE: Faz rollback para limpar a sessão
                print(f"❌ Erro ao sincronizar cliente '{cliente_nome}': {e}")
                relatorio["erros"] += 1
                relatorio["detalhes_erros"].append({
                    "cliente": cliente_nome,
                    "erro": str(e)
                })
        
        print(f"\n📊 Sincronização finalizada:")
        print(f"   ✨ Novos: {relatorio['novos']}")
        print(f"   ✅ Atualizados: {relatorio['atualizados']}")
        print(f"   ❌ Erros: {relatorio['erros']}")
        
        return relatorio