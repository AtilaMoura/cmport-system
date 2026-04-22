"""
Script de Correção Imediata — CMPort
Executa uma sincronização em lote (bulk sync) dos últimos 30 dias para resolver
as discrepâncias entre o banco de dados local e o Banco Inter.
"""
import sys
import os
from datetime import date, timedelta

# Adiciona o diretório atual ao sys.path para importar os módulos do app
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from app.core.database import SessionLocal
# Importar todos os models para garantir que o SQLAlchemy os reconheça
import app.models.condominio_model
import app.models.endereco_model
import app.models.contato_model
import app.models.servico_model
import app.models.nota_fiscal_model
import app.models.boleto_model
from app.services.boleto_service import BoletoService

def main():
    db = SessionLocal()
    try:
        print("\n" + "="*60)
        print("  INICIANDO CORREÇÃO DE SINCRONIZAÇÃO (PRODUÇÃO)")
        print("="*60)
        
        # Define o período (últimos 30 dias)
        hoje = date.today()
        inicio = (hoje - timedelta(days=30)).isoformat()
        fim = hoje.isoformat()
        
        print(f"\n1. Sincronizando cobranças no período: {inicio} até {fim}...")
        res_bulk = BoletoService.sincronizar_do_inter(db, inicio, fim)
        
        print(f"\n2. Resultado da Sincronização em Lote:")
        print(f"   - Atualizados: {res_bulk.atualizados}")
        print(f"   - Criados:     {res_bulk.criados}")
        print(f"   - Sem vínculo: {res_bulk.sem_vinculo}")
        print(f"   - Erros:       {len(res_bulk.erros)}")
        
        print("\n3. Rodando verificação individual final para boletos pendentes...")
        res_indiv = BoletoService.sincronizar_status(db)
        print(f"   - Atualizados: {res_indiv.atualizados}")
        
        print("\n" + "="*60)
        print("  PROCESSO CONCLUÍDO COM SUCESSO")
        print("="*60 + "\n")

    except Exception as e:
        print(f"\n❌ ERRO CRÍTICO: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
