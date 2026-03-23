import sys
import io

# Força UTF-8 no stdout/stderr (necessário no Windows com cp1252)
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
import app.models.usuario_model  # tabela de usuários

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

# Criar tabelas no banco (inclui a nova tabela usuarios)
Base.metadata.create_all(bind=engine)


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

# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="CMPort - Sistema de Gestão",
    description="API para gerenciamento de condominios, manutenções, assistências e boletos",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
app.include_router(dev_router,         prefix="/api/v1/dev",          tags=["Dev/Test"],                       dependencies=_auth)


@app.get("/", tags=["Root"])
def root():
    return {"app": "CMPort - Sistema de Gestão", "version": "2.0.0", "status": "online", "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy", "database": "connected"}
