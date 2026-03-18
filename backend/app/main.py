import sys
import io

# Força UTF-8 no stdout/stderr (necessário no Windows com cp1252)
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base

# Importar todos os models para registrar no Base antes do create_all
import app.models.condominio_model
import app.models.endereco_model
import app.models.contato_model
import app.models.servico_model
import app.models.nota_fiscal_model
import app.models.exclusao_model
import app.models.boleto_model

# Importar todos os routers
from app.routers.condominio_router import router as condominios_router
from app.routers.endereco_router import router as enderecos_router
from app.routers.contato_router import router as contatos_router
from app.routers.servico_router import router as servicos_router
from app.routers.nota_fiscal_router import router as notas_router
from app.routers.dashboard_router import router as dashboard_router
from app.routers.auditoria_router import router as auditoria_router
from app.routers.boleto_router import router as boletos_router
from app.routers.dev_router import router as dev_router

# Criar tabelas no banco (inclui a nova tabela boletos)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CMPort - Sistema de Gestão",
    description="API para gerenciamento de condominios, manutenções, assistências e boletos",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(condominios_router, prefix="/api/v1/condominios", tags=["Condominios"])
app.include_router(enderecos_router, prefix="/api/v1/enderecos", tags=["Endereços"])
app.include_router(contatos_router, prefix="/api/v1/contatos", tags=["Contatos"])
app.include_router(servicos_router, prefix="/api/v1/servicos", tags=["Manutenções e Assistências"])
app.include_router(notas_router, prefix="/api/v1/notas-fiscais", tags=["Notas Fiscais"])
app.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(auditoria_router, prefix="/api/v1/auditoria", tags=["Auditoria"])
app.include_router(boletos_router, prefix="/api/v1/boletos", tags=["Boletos"])
app.include_router(dev_router, prefix="/api/v1/dev", tags=["Dev/Test"])


@app.get("/", tags=["Root"])
def root():
    return {"app": "CMPort - Sistema de Gestão", "version": "2.0.0", "status": "online", "docs": "/docs"}


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy", "database": "connected"}
