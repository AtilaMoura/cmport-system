# 🏢 CMPort - Estrutura Completa do Projeto

## 📁 Estrutura de Diretórios

```
backend/
├── app/
│   ├── __init__.py
│   │
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py           # Configurações e variáveis de ambiente
│   │   └── database.py         # Configuração SQLAlchemy
│   │
│   ├── domains/
│   │   ├── __init__.py
│   │   │
│   │   ├── condominios/
│   │   │   ├── __init__.py
│   │   │   ├── model.py        # Model SQLAlchemy
│   │   │   ├── schema.py       # Schemas Pydantic
│   │   │   ├── repository.py   # Acesso ao banco
│   │   │   ├── service.py      # Lógica de negócio
│   │   │   └── router.py       # Endpoints FastAPI
│   │   │
│   │   ├── enderecos/
│   │   │   ├── __init__.py
│   │   │   ├── model.py
│   │   │   ├── schema.py
│   │   │   ├── repository.py
│   │   │   ├── service.py
│   │   │   └── router.py
│   │   │
│   │   ├── contatos/
│   │   │   ├── __init__.py
│   │   │   ├── model.py
│   │   │   ├── schema.py
│   │   │   ├── repository.py
│   │   │   ├── service.py
│   │   │   └── router.py
│   │   │
│   │   └── manutencoes_assistencias/
│   │       ├── __init__.py
│   │       ├── model.py
│   │       ├── schema.py
│   │       ├── repository.py
│   │       ├── service.py
│   │       └── router.py
│   │
│   └── main.py                 # App FastAPI principal
│
├── .env                        # Variáveis de ambiente
├── requirements.txt
├── docker-compose.yml
└── README.md
```

---

## 🗄️ Estrutura do Banco de Dados

### **Tabela: condominios**
```sql
- id (PK)
- auvo_id (UNIQUE)
- external_id
- nome
- cnpj (UNIQUE)
- razao_social
- observacao
- ativo
- criado_em
- atualizado_em
```

### **Tabela: enderecos**
```sql
- id (PK)
- condominio_id (FK → condominios.id, UNIQUE)
- rua
- numero
- complemento
- bairro
- cidade
- estado
- cep
- latitude
- longitude
```

### **Tabela: contatos**
```sql
- id (PK)
- condominio_id (FK → condominios.id)
- nome
- telefone
- email
- funcao
- principal (Boolean)
- criado_em
- atualizado_em
```

### **Tabela: manutencoes_assistencias**
```sql
- id (PK)
- condominio_id (FK → condominios.id)
- tipo (ENUM: 'manutencao' ou 'assistencia')
- data_servico
- descricao
- numero_nota_fiscal
- criado_em
- atualizado_em
```

---

## 🚀 Como Rodar o Projeto

### 1. Configurar Variáveis de Ambiente

Crie o arquivo `.env` na raiz do projeto:

```env
# AUVO API
AUVO_API_TOKEN=AUVO_TOKEN_REDACTED
AUVO_API_KEY=AUVO_KEY_REDACTED

# DATABASE
DB_HOST=db
DB_PORT=3306
DB_NAME=cmport_gerenciamento
DB_USER=root
DB_PASSWORD=senha_forte_aqui

# APPLICATION
ENV=development
```

### 2. Subir o MySQL no Docker

```bash
docker-compose up -d db
```

### 3. Instalar Dependências

```bash
# Criar ambiente virtual
python -m venv venv

# Ativar ambiente virtual
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate     # Windows

# Instalar dependências
pip install -r requirements.txt
```

### 4. Rodar a Aplicação

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Acessar Documentação

Abra no navegador:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## 🧪 Testando as Rotas

### **CONDOMINIOS**

#### Criar Condomínio
```bash
curl -X POST http://localhost:8000/api/v1/condominios/ \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Condomínio Solar das Flores",
    "cnpj": "12.345.678/0001-99",
    "razao_social": "Solar das Flores LTDA",
    "observacao": "Cliente VIP",
    "ativo": true
  }'
```

#### Listar Todos
```bash
curl http://localhost:8000/api/v1/condominios/
```

#### Listar Apenas Ativos
```bash
curl http://localhost:8000/api/v1/condominios/?ativo=true
```

#### Buscar por ID
```bash
curl http://localhost:8000/api/v1/condominios/1
```

#### Buscar por Nome
```bash
curl http://localhost:8000/api/v1/condominios/search?nome=Solar
```

#### Atualizar
```bash
curl -X PUT http://localhost:8000/api/v1/condominios/1 \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Condomínio Solar das Flores - Atualizado",
    "observacao": "Cliente Premium"
  }'
```

#### Deletar
```bash
curl -X DELETE http://localhost:8000/api/v1/condominios/1
```

---

### **ENDEREÇOS**

#### Criar Endereço
```bash
curl -X POST http://localhost:8000/api/v1/enderecos/ \
  -H "Content-Type: application/json" \
  -d '{
    "condominio_id": 1,
    "rua": "Rua das Palmeiras",
    "numero": "500",
    "complemento": "Bloco A",
    "bairro": "Jardim Europa",
    "cidade": "São Paulo",
    "estado": "SP",
    "cep": "01234-567",
    "latitude": -23.5505,
    "longitude": -46.6333
  }'
```

#### Buscar Endereço do Condomínio
```bash
curl http://localhost:8000/api/v1/enderecos/condominio/1
```

#### Atualizar Endereço
```bash
curl -X PUT http://localhost:8000/api/v1/enderecos/1 \
  -H "Content-Type: application/json" \
  -d '{
    "numero": "502",
    "complemento": "Bloco B"
  }'
```

---

### **CONTATOS**

#### Criar Contato
```bash
curl -X POST http://localhost:8000/api/v1/contatos/ \
  -H "Content-Type: application/json" \
  -d '{
    "condominio_id": 1,
    "nome": "João Silva",
    "telefone": "(11) 98765-4321",
    "email": "joao.silva@email.com",
    "funcao": "Síndico",
    "principal": true
  }'
```

#### Listar Contatos do Condomínio
```bash
curl http://localhost:8000/api/v1/contatos/condominio/1
```

#### Buscar Contato Principal
```bash
curl http://localhost:8000/api/v1/contatos/condominio/1/principal
```

#### Atualizar Contato
```bash
curl -X PUT http://localhost:8000/api/v1/contatos/1 \
  -H "Content-Type: application/json" \
  -d '{
    "telefone": "(11) 99999-8888",
    "funcao": "Administrador"
  }'
```

---

### **MANUTENÇÕES E ASSISTÊNCIAS**

#### Criar Manutenção
```bash
curl -X POST http://localhost:8000/api/v1/servicos/ \
  -H "Content-Type: application/json" \
  -d '{
    "condominio_id": 1,
    "tipo": "manutencao",
    "data_servico": "2024-02-01",
    "descricao": "Manutenção preventiva do portão eletrônico",
    "numero_nota_fiscal": "NF-12345"
  }'
```

#### Criar Assistência
```bash
curl -X POST http://localhost:8000/api/v1/servicos/ \
  -H "Content-Type: application/json" \
  -d '{
    "condominio_id": 1,
    "tipo": "assistencia",
    "data_servico": "2024-02-02",
    "descricao": "Reparo emergencial no interfone",
    "numero_nota_fiscal": "NF-12346"
  }'
```

#### Listar Todos os Serviços do Condomínio
```bash
curl http://localhost:8000/api/v1/servicos/condominio/1
```

#### Listar Apenas Manutenções
```bash
curl http://localhost:8000/api/v1/servicos/condominio/1?tipo=manutencao
```

#### Listar Apenas Assistências
```bash
curl http://localhost:8000/api/v1/servicos/condominio/1?tipo=assistencia
```

#### Listar por Período
```bash
curl "http://localhost:8000/api/v1/servicos/condominio/1/periodo?data_inicio=2024-01-01&data_fim=2024-12-31"
```

#### Listar Manutenções de um Período
```bash
curl "http://localhost:8000/api/v1/servicos/condominio/1/periodo?data_inicio=2024-01-01&data_fim=2024-12-31&tipo=manutencao"
```

---

## 📊 Endpoints Disponíveis

### **Condominios** (`/api/v1/condominios`)
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/` | Criar condomínio |
| GET | `/` | Listar todos |
| GET | `/search?nome=X` | Buscar por nome |
| GET | `/{id}` | Buscar por ID |
| PUT | `/{id}` | Atualizar |
| DELETE | `/{id}` | Deletar |

### **Endereços** (`/api/v1/enderecos`)
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/` | Criar endereço |
| GET | `/{id}` | Buscar por ID |
| GET | `/condominio/{id}` | Buscar por condomínio |
| PUT | `/{id}` | Atualizar |
| DELETE | `/{id}` | Deletar |

### **Contatos** (`/api/v1/contatos`)
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/` | Criar contato |
| GET | `/{id}` | Buscar por ID |
| GET | `/condominio/{id}` | Listar por condomínio |
| GET | `/condominio/{id}/principal` | Buscar contato principal |
| PUT | `/{id}` | Atualizar |
| DELETE | `/{id}` | Deletar |

### **Manutenções e Assistências** (`/api/v1/servicos`)
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/` | Criar serviço |
| GET | `/{id}` | Buscar por ID |
| GET | `/condominio/{id}` | Listar por condomínio |
| GET | `/condominio/{id}/periodo` | Listar por período |
| PUT | `/{id}` | Atualizar |
| DELETE | `/{id}` | Deletar |

---

## 🎯 Fluxo de Teste Completo

### 1. Criar um Condomínio
```bash
POST /api/v1/condominios/
```

### 2. Adicionar Endereço
```bash
POST /api/v1/enderecos/
```

### 3. Adicionar Contatos
```bash
POST /api/v1/contatos/  (Síndico - principal: true)
POST /api/v1/contatos/  (Zelador - principal: false)
```

### 4. Registrar Manutenção
```bash
POST /api/v1/servicos/  (tipo: manutencao)
```

### 5. Registrar Assistência
```bash
POST /api/v1/servicos/  (tipo: assistencia)
```

### 6. Consultar Tudo
```bash
GET /api/v1/condominios/1
GET /api/v1/enderecos/condominio/1
GET /api/v1/contatos/condominio/1
GET /api/v1/servicos/condominio/1
```

---

## 🔍 Relacionamentos

```
Condominio (1) ←→ (1) Endereco
Condominio (1) ←→ (N) Contato
Condominio (1) ←→ (N) ManutencaoAssistencia
```

**Cascade Delete**: Ao deletar um condomínio, todos os endereços, contatos e serviços relacionados são deletados automaticamente.

---

## 📝 Notas Importantes

1. **Endereço Único**: Cada condomínio tem apenas um endereço (relacionamento 1:1)
2. **Múltiplos Contatos**: Um condomínio pode ter vários contatos
3. **Contato Principal**: Use `principal: true` para marcar o contato principal
4. **Tipo de Serviço**: Use `"manutencao"` ou `"assistencia"` no campo tipo
5. **Filtros**: Todos os endpoints de listagem suportam filtros via query params

---

## 🐛 Troubleshooting

### Erro: "ModuleNotFoundError"
```bash
pip install -r requirements.txt
```

### Erro: "Can't connect to MySQL"
```bash
docker ps  # Verificar se MySQL está rodando
docker logs <container-id>  # Ver logs
```

### Erro: "Table doesn't exist"
As tabelas são criadas automaticamente ao rodar a aplicação pela primeira vez.

---

**Desenvolvido para CMPort** 🏢