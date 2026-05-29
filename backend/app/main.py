import sys
import io
from contextlib import asynccontextmanager

# Força UTF-8 no stdout/stderr (necessário no Windows com cp1252)
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler

from app.core.database import engine, Base
from app.core.dependencies import get_current_user

# Importar todos os models para registrar no Base antes do create_all
import app.models.condominio_model
import app.models.endereco_model
import app.models.contato_model
import app.models.servico_model
import app.models.nota_fiscal_model
import app.models.exclusao_model
import app.models.boleto_model
import app.models.configuracao_impostos_model
import app.models.usuario_model          # tabela de usuários
import app.models.configuracao_model      # configurações de email e empresa
import app.models.ordem_servico_model     # ordens de serviço (cache Auvo)
import app.models.produto_model           # produtos (cache Auvo)
import app.models.orcamento_model         # orçamentos (cache Auvo)
import app.models.termo_garantia_model     # termos de garantia
import app.models.contrato_condominio_model  # contratos simples por condomínio
import app.models.ciclo_nota_model           # ciclos mensais de faturamento
import app.models.corpo_nota_model           # corpo da nota (pré-nota)
import app.models.fin_categoria_model        # financeiro — categorias
import app.models.fin_movimentacao_model     # financeiro — movimentações
import app.models.fin_saldo_inicial_model    # financeiro — saldo inicial mensal

# Importar todos os routers
from app.routers.auth_router import router as auth_router
from app.routers.condominio_router import router as condominios_router
from app.routers.endereco_router import router as enderecos_router
from app.routers.contato_router import router as contatos_router
from app.routers.servico_router import router as servicos_router
from app.routers.nota_fiscal_router import router as notas_router
from app.routers.dashboard_router import router as dashboard_router
from app.routers.auditoria_router import router as auditoria_router
from app.routers.boleto_router import router as boletos_router
from app.routers.dev_router import router as dev_router
from app.routers.configuracao_router import router as configuracoes_router
from app.routers.ordem_servico_router import router as ordens_servico_router
from app.routers.produto_router import router as produtos_router
from app.routers.orcamento_router import router as orcamentos_router
from app.routers.termo_garantia_router import router as termo_garantia_router
from app.routers.contrato_router import router as contratos_router
from app.routers.ciclo_nota_router import router as ciclos_nota_router
from app.routers.corpo_nota_router import router as corpos_nota_router
from app.routers.fin_movimentacao_router import router as fin_mov_router
from app.routers.fin_categoria_router    import router as fin_cat_router
from app.routers.cliente_router import router as clientes_router
from app.routers.recibo_router import router as recibos_router

# Criar tabelas no banco (inclui a nova tabela usuarios)
Base.metadata.create_all(bind=engine)


def _run_migrations():
    """Aplica ALTER TABLE incrementais para colunas que não existem ainda."""
    from sqlalchemy import text
    from app.core.database import SessionLocal
    db = SessionLocal()
    stmts = [
        "ALTER TABLE manutencoes_assistencias ADD COLUMN orcamento_id INT NULL",
        "ALTER TABLE manutencoes_assistencias ADD INDEX idx_servico_orcamento (orcamento_id)",
        "ALTER TABLE manutencoes_assistencias ADD CONSTRAINT fk_servico_orcamento FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE SET NULL",
        "ALTER TABLE notas_fiscais ADD COLUMN pdf_object_key VARCHAR(500) NULL",
        "ALTER TABLE manutencoes_assistencias ADD COLUMN email_enviado_em DATETIME NULL",
        "ALTER TABLE manutencoes_assistencias ADD COLUMN email_destinatarios TEXT NULL",
        "ALTER TABLE configuracao_empresa ADD COLUMN emails_copia TEXT NULL",
        "ALTER TABLE notas_fiscais ADD COLUMN cnpj_emitente VARCHAR(18) NULL",
        # Módulo Corpo da Nota — FKs em tabelas existentes
        "ALTER TABLE notas_fiscais ADD COLUMN corpo_nota_id INT NULL",
        "ALTER TABLE notas_fiscais ADD CONSTRAINT fk_nf_corpo_nota FOREIGN KEY (corpo_nota_id) REFERENCES corpos_nota(id) ON DELETE SET NULL",
        "ALTER TABLE notas_fiscais ADD UNIQUE INDEX uq_nf_corpo_nota (corpo_nota_id)",
        "ALTER TABLE boletos ADD COLUMN corpo_nota_id INT NULL",
        "ALTER TABLE boletos ADD CONSTRAINT fk_boleto_corpo_nota FOREIGN KEY (corpo_nota_id) REFERENCES corpos_nota(id) ON DELETE SET NULL",
        "ALTER TABLE boletos ADD INDEX ix_boleto_corpo_nota (corpo_nota_id)",
        # Contrato — campos opcionais para auto-preenchimento
        "ALTER TABLE contratos_condominio ADD COLUMN dia_vencimento_padrao SMALLINT NULL",
        "ALTER TABLE contratos_condominio ADD COLUMN valor_fixo_mensal DECIMAL(10,2) NULL",
        "ALTER TABLE contratos_condominio ADD COLUMN descricao_padrao_servico TEXT NULL",
        "ALTER TABLE contratos_condominio ADD COLUMN observacoes_contrato TEXT NULL",
        # ConfiguracaoImpostosServico — ISS
        "ALTER TABLE configuracao_impostos_servico ADD COLUMN pct_iss DECIMAL(5,2) NOT NULL DEFAULT 0",
        # CorpoNota — número de referência sequencial interno
        "ALTER TABLE corpos_nota ADD COLUMN numero_referencia VARCHAR(20) NULL",
        "ALTER TABLE corpos_nota ADD UNIQUE INDEX uq_corpo_numero_referencia (numero_referencia)",
        # Boleto — PDF manual para boletos sem API Inter
        "ALTER TABLE boletos ADD COLUMN pdf_object_key VARCHAR(500) NULL",
        # ConfiguracaoInter — campos bancários agora opcionais (emitente sem Inter)
        "ALTER TABLE configuracao_inter MODIFY client_id VARCHAR(300) NULL",
        "ALTER TABLE configuracao_inter MODIFY client_secret VARCHAR(300) NULL",
        "ALTER TABLE configuracao_inter MODIFY conta_corrente VARCHAR(50) NULL",
        "ALTER TABLE configuracao_inter MODIFY cert_path VARCHAR(500) NULL",
        # ConfiguracaoInter — tipo_nota e razao_social
        "ALTER TABLE configuracao_inter ADD COLUMN tipo_nota VARCHAR(20) NOT NULL DEFAULT 'SERVICO'",
        "ALTER TABLE configuracao_inter ADD COLUMN razao_social VARCHAR(255) NULL",
        # CorpoNota — novos campos para tipo SERVICO
        "ALTER TABLE corpos_nota ADD COLUMN configuracao_inter_id INT NULL",
        "ALTER TABLE corpos_nota ADD CONSTRAINT fk_corpo_config_inter FOREIGN KEY (configuracao_inter_id) REFERENCES configuracao_inter(id) ON DELETE SET NULL",
        "ALTER TABLE corpos_nota ADD COLUMN orcamento_id INT NULL",
        "ALTER TABLE corpos_nota ADD CONSTRAINT fk_corpo_orcamento FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE SET NULL",
        "ALTER TABLE corpos_nota ADD COLUMN data_servico_texto VARCHAR(200) NULL",
        "ALTER TABLE corpos_nota ADD COLUMN descricao_garantia TEXT NULL",
        "ALTER TABLE corpos_nota ADD COLUMN valor_nota_produto DECIMAL(10,2) NULL",
        "ALTER TABLE corpos_nota MODIFY numero_os VARCHAR(200) NULL",
        # CorpoNota — número NF e parcelas
        "ALTER TABLE corpos_nota ADD COLUMN numero_nf INT NULL",
        "ALTER TABLE corpos_nota ADD COLUMN numero_parcelas SMALLINT NULL DEFAULT 1",
        # CorpoNota — parcelas customizadas e lista de produtos
        "ALTER TABLE corpos_nota ADD COLUMN parcelas_json JSON NULL",
        "ALTER TABLE corpos_nota ADD COLUMN produtos_json JSON NULL",
        # ConfiguracaoInter — sequências de numeração NF por CNPJ
        "ALTER TABLE configuracao_inter ADD COLUMN numero_nf_servico INT NULL",
        "ALTER TABLE configuracao_inter ADD COLUMN numero_nf_produto INT NULL",
        # Múltiplos contratos por condomínio
        "ALTER TABLE contratos_condominio DROP FOREIGN KEY contratos_condominio_ibfk_1",
        "ALTER TABLE contratos_condominio DROP INDEX ix_contratos_condominio_condominio_id",
        "ALTER TABLE contratos_condominio ADD INDEX ix_contrato_condo (condominio_id)",
        "ALTER TABLE contratos_condominio ADD CONSTRAINT fk_contrato_condo FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE",
        "ALTER TABLE contratos_condominio ADD COLUMN descricao VARCHAR(100) NULL AFTER ativo",
        "ALTER TABLE ciclos_nota ADD COLUMN contrato_id INT NULL",
        "ALTER TABLE ciclos_nota ADD INDEX ix_ciclo_contrato (contrato_id)",
        "ALTER TABLE ciclos_nota ADD CONSTRAINT fk_ciclo_contrato FOREIGN KEY (contrato_id) REFERENCES contratos_condominio(id) ON DELETE SET NULL",
        "ALTER TABLE ciclos_nota DROP INDEX uq_ciclo_condominio_tipo_mes",
        "ALTER TABLE ciclos_nota ADD UNIQUE INDEX uq_ciclo_condominio_contrato_tipo_mes (condominio_id, contrato_id, tipo_nota, ano, mes)",
        # Módulo Clientes/Recibos
        "ALTER TABLE clientes MODIFY condominio_id INT NULL",
        "ALTER TABLE manutencoes_assistencias ADD COLUMN recibo_id INT NULL",
        "ALTER TABLE manutencoes_assistencias ADD INDEX idx_servico_recibo (recibo_id)",
        "ALTER TABLE manutencoes_assistencias ADD CONSTRAINT fk_servico_recibo FOREIGN KEY (recibo_id) REFERENCES recibos(id) ON DELETE SET NULL",
    ]
    try:
        for stmt in stmts:
            try:
                db.execute(text(stmt))
                db.commit()
            except Exception:
                db.rollback()
    finally:
        db.close()


_run_migrations()


# ── Seeds de startup ─────────────────────────────────────────────────────────

def _seed_configuracao_impostos():
    from app.core.database import SessionLocal
    from app.models.configuracao_impostos_model import ConfiguracaoImpostosServico, TipoServicoConfig
    db = SessionLocal()
    try:
        if db.query(ConfiguracaoImpostosServico).count() == 0:
            defaults = [
                ConfiguracaoImpostosServico(tipo_servico=TipoServicoConfig.MANUTENCAO, pct_pis=0.65, pct_cofins=3.00, pct_inss=11.00, pct_csll=1.00),
                ConfiguracaoImpostosServico(tipo_servico=TipoServicoConfig.ASSISTENCIA, pct_pis=0.65, pct_cofins=3.00, pct_inss=11.00, pct_csll=1.00),
                ConfiguracaoImpostosServico(tipo_servico=TipoServicoConfig.OUTROS,      pct_pis=0.00, pct_cofins=0.00, pct_inss=0.00,  pct_csll=0.00),
            ]
            db.add_all(defaults)
            db.commit()
    finally:
        db.close()


def _seed_usuarios():
    """Cria os usuários iniciais se a tabela estiver vazia."""
    from app.core.database import SessionLocal
    from app.core.security import hash_senha
    from app.models.usuario_model import Usuario, RoleUsuario
    db = SessionLocal()
    try:
        if db.query(Usuario).count() == 0:
            usuarios_iniciais = [
                Usuario(
                    nome="Atila Dev",
                    email="atila.dev@cmport.com",
                    senha_hash=hash_senha("CMport@dev2026"),
                    role=RoleUsuario.DEV,
                ),
                Usuario(
                    nome="Administrador",
                    email="admin@cmport.com",
                    senha_hash=hash_senha("CMport@adm2026"),
                    role=RoleUsuario.ADMIN,
                ),
                Usuario(
                    nome="Usuário",
                    email="usuario@cmport.com",
                    senha_hash=hash_senha("CMport@usr2026"),
                    role=RoleUsuario.USUARIO,
                ),
            ]
            db.add_all(usuarios_iniciais)
            db.commit()
            print("[seed] 3 usuários iniciais criados.")
    finally:
        db.close()


_seed_configuracao_impostos()
_seed_usuarios()



def _seed_categorias_financeiras():
    """Insere 49 categorias padrão se a tabela estiver vazia."""
    from app.core.database import SessionLocal
    from app.models.fin_categoria_model import CategoriaFinanceira
    FIN_CATEGORIAS_SEED = [
        # RECEITAS
        ("Contrato Manutenção","RECEITA","ENTRADA",1), ("Assistência","RECEITA","ENTRADA",2),
        ("Juros","RECEITA","ENTRADA",3), ("Rendimento","RECEITA","ENTRADA",4),
        ("Ajustes","RECEITA","ENTRADA",5), ("Outros Recebimentos","RECEITA","ENTRADA",6),
        # FORNECEDORES
        ("Center G","FORNECEDOR","SAIDA",1), ("Depósito Iracema","FORNECEDOR","SAIDA",2),
        ("Tugumi","FORNECEDOR","SAIDA",3), ("JT Thenário","FORNECEDOR","SAIDA",4),
        ("M&L","FORNECEDOR","SAIDA",5), ("ZN Distribuidora","FORNECEDOR","SAIDA",6),
        ("Porto Seg","FORNECEDOR","SAIDA",7), ("Speed Door","FORNECEDOR","SAIDA",8),
        ("Telman","FORNECEDOR","SAIDA",9), ("NSA","FORNECEDOR","SAIDA",10),
        ("Islene","FORNECEDOR","SAIDA",11), ("Mauricio Motores","FORNECEDOR","SAIDA",12),
        ("Metais Silva","FORNECEDOR","SAIDA",13), ("Linear","FORNECEDOR","SAIDA",14),
        ("Interseg","FORNECEDOR","SAIDA",15), ("Paulo Port","FORNECEDOR","SAIDA",16),
        ("LM Distribuidora","FORNECEDOR","SAIDA",17), ("PPA Leste","FORNECEDOR","SAIDA",18),
        ("Sinapar","FORNECEDOR","SAIDA",19), ("Aquarios","FORNECEDOR","SAIDA",20),
        ("2M2N","FORNECEDOR","SAIDA",21), ("Outros Fornecedores","FORNECEDOR","SAIDA",22),
        # DESPESAS
        ("Salários","DESPESA","SAIDA",1), ("Adiantamento de Salário","DESPESA","SAIDA",2),
        ("Combustível — André","DESPESA","SAIDA",3), ("Combustível — Outro","DESPESA","SAIDA",4),
        ("Celular","DESPESA","SAIDA",5), ("Telefone/Fone","DESPESA","SAIDA",6),
        ("Internet","DESPESA","SAIDA",7), ("Contabilidade","DESPESA","SAIDA",8),
        ("Sindical","DESPESA","SAIDA",9), ("Impostos (FGTS/GPS/ISS)","DESPESA","SAIDA",10),
        ("Convênio","DESPESA","SAIDA",11), ("Sistema da Empresa","DESPESA","SAIDA",12),
        ("Seguro","DESPESA","SAIDA",13), ("Água/Luz","DESPESA","SAIDA",14),
        ("Aluguel","DESPESA","SAIDA",15), ("Escritório","DESPESA","SAIDA",16),
        ("Estacionamento/Zona Azul","DESPESA","SAIDA",17), ("Alimentação","DESPESA","SAIDA",18),
        ("Tarifa Bancária","DESPESA","SAIDA",19), ("Uber","DESPESA","SAIDA",20),
        ("Diversos","DESPESA","SAIDA",21),
    ]
    db = SessionLocal()
    try:
        if db.query(CategoriaFinanceira).count() == 0:
            for nome, grupo, tipo, ordem in FIN_CATEGORIAS_SEED:
                db.add(CategoriaFinanceira(nome=nome, grupo=grupo, tipo=tipo, ordem=ordem))
            db.commit()
            print(f"[seed] {len(FIN_CATEGORIAS_SEED)} categorias financeiras criadas.")
    except Exception as e:
        db.rollback()
        print(f"[seed_categorias_financeiras] erro: {e}")
    finally:
        db.close()


_seed_categorias_financeiras()


# ── Sincronização automática de boletos ──────────────────────────────────────

def _sincronizar_boletos_auto():
    """Consulta o Inter e atualiza status dos boletos em aberto (EMABERTO/VENCIDO)."""
    from app.core.database import SessionLocal
    from app.services.boleto_service import BoletoService
    from datetime import date, timedelta
    
    db = SessionLocal()
    try:
        # 1. Sincronização por polling (um a um para boletos locais em aberto)
        resultado = BoletoService.sincronizar_status(db)
        print(f"[AutoSync] Individual: atualizados={resultado.atualizados} erros={len(resultado.erros)}")
        
        # 2. Sincronização em lote (busca tudo dos últimos 7 dias para garantir que nada escapou)
        hoje = date.today()
        inicio = (hoje - timedelta(days=7)).isoformat()
        fim = hoje.isoformat()
        res_bulk = BoletoService.sincronizar_do_inter(db, inicio, fim)
        print(f"[AutoSync] Bulk ({inicio} a {fim}): atualizados={res_bulk.atualizados} criados={res_bulk.criados}")
        
    except Exception as e:
        print(f"[AutoSync] Erro na sincronização automática: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app):
    scheduler = BackgroundScheduler(timezone="America/Sao_Paulo")
    # Executa de 1 em 1 hora das 8h às 19h (8,9,10,11,12,13,14,15,16,17,18,19)
    scheduler.add_job(
        _sincronizar_boletos_auto,
        trigger="cron",
        hour="8-19",
        minute=0,
    )
    scheduler.start()
    print("[AutoSync] Scheduler iniciado — sincronização a cada hora das 8h às 19h (Brasília)")
    
    # ── Storage Bucket Initialization ─────────────────────────────────────────
    from app.core.dependencies import get_storage_client
    from app.core.config import settings
    try:
        storage = get_storage_client()
        storage.ensure_bucket_exists(settings.STORAGE_BUCKET)
        print(f"[Storage] Bucket '{settings.STORAGE_BUCKET}' verificado/criado.")
    except Exception as e:
        print(f"[Storage] Erro ao inicializar storage: {e}")

    yield
    scheduler.shutdown()
    print("[AutoSync] Scheduler encerrado")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CMPort - Sistema de Gestão",
    description="API para gerenciamento de condominios, manutenções, assistências e boletos",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    redirect_slashes=False,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://168.231.96.184"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth — público (sem Depends)
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Autenticação"])

# Todos os outros routers exigem usuário autenticado
_auth = [Depends(get_current_user)]

app.include_router(condominios_router, prefix="/api/v1/condominios",  tags=["Condominios"],                    dependencies=_auth)
app.include_router(enderecos_router,   prefix="/api/v1/enderecos",    tags=["Endereços"],                      dependencies=_auth)
app.include_router(contatos_router,    prefix="/api/v1/contatos",     tags=["Contatos"],                       dependencies=_auth)
app.include_router(servicos_router,    prefix="/api/v1/servicos",     tags=["Manutenções e Assistências"],     dependencies=_auth)
app.include_router(notas_router,       prefix="/api/v1/notas-fiscais",tags=["Notas Fiscais"],                  dependencies=_auth)
app.include_router(dashboard_router,   prefix="/api/v1/dashboard",    tags=["Dashboard"],                      dependencies=_auth)
app.include_router(auditoria_router,   prefix="/api/v1/auditoria",    tags=["Auditoria"],                      dependencies=_auth)
app.include_router(boletos_router,     prefix="/api/v1/boletos",      tags=["Boletos"],                        dependencies=_auth)
app.include_router(dev_router,            prefix="/api/v1/dev",            tags=["Dev/Test"],         dependencies=_auth)
app.include_router(configuracoes_router,  prefix="/api/v1/configuracoes",  tags=["Configurações"],    dependencies=_auth)
app.include_router(ordens_servico_router, prefix="/api/v1/ordens-servico", tags=["Ordens de Serviço"], dependencies=_auth)
app.include_router(produtos_router,       prefix="/api/v1/produtos",       tags=["Produtos"],           dependencies=_auth)
app.include_router(orcamentos_router,     prefix="/api/v1/orcamentos",     tags=["Orçamentos"],         dependencies=_auth)
app.include_router(termo_garantia_router, prefix="/api/v1/termos-garantia", tags=["Termos de Garantia"], dependencies=_auth)
app.include_router(contratos_router,    prefix="/api/v1/contratos",     tags=["Contratos"],          dependencies=_auth)
app.include_router(ciclos_nota_router,  prefix="/api/v1/ciclos-nota",   tags=["Ciclos de Nota"],     dependencies=_auth)
app.include_router(corpos_nota_router,  prefix="/api/v1/corpos-nota",   tags=["Corpo da Nota"],      dependencies=_auth)
app.include_router(fin_mov_router,      prefix="/api/v1/financeiro",              tags=["Financeiro"],         dependencies=_auth)
app.include_router(fin_cat_router,      prefix="/api/v1/categorias-financeiras",  tags=["Financeiro"],         dependencies=_auth)
app.include_router(clientes_router,     prefix="/api/v1/clientes",                tags=["Clientes"],           dependencies=_auth)
app.include_router(recibos_router,      prefix="/api/v1/recibos",                 tags=["Recibos"],            dependencies=_auth)


@app.get("/", tags=["Root"])
def root():
    return {"app": "CMPort - Sistema de Gestão", "version": "2.0.0", "status": "online", "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy", "database": "connected"}
