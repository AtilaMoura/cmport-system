from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import engine, Base

# Importar todos os routers
from app.domains.condominios.router import router as condominios_router
from app.domains.enderecos.router import router as enderecos_router
from app.domains.contatos.router import router as contatos_router
from app.domains.manutencoes_assistencias.router import router as servicos_router
from app.domains.notas_fiscais.router import router as notas_router
from app.domains.dashboard.router import router as dashboard_router
from app.domains.auditoria.router import router as auditoria_router

# Criar tabelas no banco
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CMPort - Sistema de Gestão",
    description="API para gerenciamento de condominios, manutenções e assistências",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Em produção, especifique os domínios permitidos
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar rotas
app.include_router(
    condominios_router,
    prefix="/api/v1/condominios",
    tags=["Condominios"]
)

app.include_router(
    enderecos_router,
    prefix="/api/v1/enderecos",
    tags=["Endereços"]
)

app.include_router(
    contatos_router,
    prefix="/api/v1/contatos",
    tags=["Contatos"]
)

app.include_router(
    servicos_router,
    prefix="/api/v1/servicos",
    tags=["Manutenções e Assistências"]
)

app.include_router(
    notas_router, 
    prefix="/api/v1/notas-fiscais", 
    tags=["Notas Fiscais"]
)

app.include_router(
    dashboard_router, 
    prefix="/api/v1/dashboard", 
    tags=["dashboard"]
)

app.include_router(
    auditoria_router,
    prefix="/api/v1/auditoria",
    tags=["Auditoria e Edição"]
)


@app.get("/", tags=["Root"])
def root():
    """Endpoint raiz"""
    return {
        "app": "CMPort - Sistema de Gestão",
        "version": "1.0.0",
        "status": "online",
        "docs": "/docs"
    }


@app.get("/health", tags=["Health"])
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "database": "connected"
    }