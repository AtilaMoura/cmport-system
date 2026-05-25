import json
import re
import requests
from typing import Optional, Dict, List
from app.core.config import settings


class AuvoClient:

    BASE_URL = "https://api.auvo.com.br/v2"

    def __init__(self):
        self.api_key = settings.AUVO_API_KEY
        self.api_token = settings.AUVO_API_TOKEN
        self._access_token: Optional[str] = None

    def _get_access_token(self) -> Optional[str]:
        url = f"{self.BASE_URL}/login/"
        params = {"apiKey": self.api_key, "apiToken": self.api_token}
        try:
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()
            access_token = data.get("result", {}).get("accessToken")
            if access_token:
                self._access_token = access_token
                return access_token
            print(f"Erro: accessToken não encontrado na resposta: {data}")
            return None
        except requests.exceptions.RequestException as e:
            print(f"Erro ao fazer login no Auvo: {e}")
            return None

    def _get_headers(self) -> Dict[str, str]:
        if not self._access_token:
            self._get_access_token()
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json"
        }

    def _make_request(self, endpoint: str, params: Optional[Dict] = None) -> Optional[Dict]:
        # Auvo pode demorar até ~25s para retornar 100 registros — timeout generoso
        url = f"{self.BASE_URL}/{endpoint}"
        try:
            response = requests.get(url, headers=self._get_headers(), params=params, timeout=120)
            if response.status_code == 401:
                # Token expirado — força novo login e retenta uma vez
                print(f"[Auvo] 401 em {endpoint} — renovando token e retentando...")
                self._access_token = None
                response = requests.get(url, headers=self._get_headers(), params=params, timeout=120)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Erro na requisição para {endpoint}: {e}")
            return None

    def get_customers(self, client_group_id: Optional[int] = None, page: int = 1, page_size: int = 100) -> List[Dict]:
        params = {"page": page, "pageSize": page_size, "order": "asc"}
        if client_group_id:
            params["clientGroupId"] = client_group_id
        data = self._make_request("customers/", params=params)
        if data and "result" in data:
            return data["result"].get("entityList", [])
        return []

    def get_service_order(self, task_id: int) -> Optional[Dict]:
        """Busca OS pelo ID (taskID no Auvo). Endpoint: GET /tasks/{id}"""
        data = self._make_request(f"tasks/{task_id}")
        if data and "result" in data:
            return data["result"]
        return None

    def get_service_orders_by_date(
        self,
        customer_id: int,
        date_start: str,
        date_end: str,
        page: int = 1,
        page_size: int = 100,
    ) -> List[Dict]:
        """
        Lista OS de um cliente por intervalo de data.
        date_start / date_end: formato 'YYYY-MM-DD'
        """
        param_filter = json.dumps({
            "customerId": customer_id,
            "startDate": date_start,
            "endDate": date_end,
        })
        params = {
            "paramFilter": param_filter,
            "page": page,
            "pageSize": page_size,
            "order": "desc",
        }
        data = self._make_request("tasks/", params=params)
        if data and "result" in data:
            return data["result"].get("entityList", [])
        return []

    def get_all_service_orders_by_period(
        self,
        date_start: str,
        date_end: str,
        page_size: int = 100,
    ) -> List[Dict]:
        """
        Lista TODAS as OS de um período sem filtro de cliente, paginando automaticamente.
        Confirmado: tasks/ com paramFilter JSON (startDate+endDate) retorna dados corretamente.
        date_start / date_end: formato 'YYYY-MM-DD'
        """
        todos = []
        page = 1
        while True:
            param_filter = json.dumps({
                "startDate": date_start,
                "endDate": date_end,
            })
            params = {
                "paramFilter": param_filter,
                "page": page,
                "pageSize": page_size,
                "order": "desc",
            }
            data = self._make_request("tasks/", params=params)
            if not data or "result" not in data:
                break
            lista = data["result"].get("entityList", [])
            todos.extend(lista)
            total = data["result"].get("pagedSearchReturnData", {}).get("totalItems", 0)
            print(f"[Auvo] Página {page}: {len(lista)} OSs (total acum: {len(todos)} / {total})")
            if len(todos) >= total or len(lista) < page_size:
                break
            page += 1
        return todos

    def baixar_pdf_os(self, task_url: str) -> Optional[bytes]:
        """
        Baixa o PDF da OS a partir do taskUrl retornado pela API.
        Não requer autenticação — o GUID funciona como token público.
        Retorna bytes do PDF ou None em caso de erro.
        """
        match = re.search(r'/tarefa/([a-f0-9\-]{36})', task_url or "")
        if not match:
            print(f"[Auvo] GUID não encontrado em taskUrl: {task_url}")
            return None
        guid = match.group(1)
        pdf_url = f"https://app.auvo.com.br/informacoes/DownloadPdfOs/{guid}"
        try:
            resp = requests.get(pdf_url, timeout=60)
            if resp.status_code == 200 and resp.content[:4] == b"%PDF":
                return resp.content
            print(f"[Auvo] PDF OS: status={resp.status_code} guid={guid}")
            return None
        except requests.exceptions.RequestException as exc:
            print(f"[Auvo] Erro ao baixar PDF da OS: {exc}")
            return None

    def get_all_customers(self, page_size: int = 100) -> List[Dict]:
        """Busca todos os clientes paginando até não ter mais resultados."""
        todos = []
        page = 1
        while True:
            resultado = self.get_customers(page=page, page_size=page_size)
            if not resultado:
                break
            todos.extend(resultado)
            print(f"[Auvo] Página {page}: {len(resultado)} clientes (total acum: {len(todos)})")
            if len(resultado) < page_size:
                break
            page += 1
        return todos

    def get_customer_by_cnpj(self, cnpj: str) -> Optional[Dict]:
        """Pagina clientes Auvo parando na primeira ocorrência do CNPJ. O(n) no pior caso."""
        cnpj_limpo = re.sub(r'\D', '', cnpj or '')
        if not cnpj_limpo:
            return None
        page = 1
        while True:
            customers = self.get_customers(page=page, page_size=100)
            if not customers:
                break
            for c in customers:
                if re.sub(r'\D', '', c.get('cpfCnpj', '')) == cnpj_limpo:
                    return c
            if len(customers) < 100:
                break
            page += 1
        return None

    def get_products(self, page: int = 1, page_size: int = 100, ativo: bool = True) -> List[Dict]:
        """Busca produtos paginados. Endpoint: GET /products/"""
        # Auvo API v2 usa paramFilter JSON para filtrar por ativo
        param_filter = json.dumps({
            "active": ativo
        })
        params = {
            "paramFilter": param_filter,
            "page": page,
            "pageSize": page_size,
            "order": "asc"
        }
        data = self._make_request("products/", params=params)
        if data and "result" in data:
            return data["result"].get("entityList", [])
        return []

    def get_all_products(self, page_size: int = 100) -> List[Dict]:
        """Busca todos os produtos ativos paginando automaticamente."""
        todos = []
        page = 1
        while True:
            lista = self.get_products(page=page, page_size=page_size)
            if not lista:
                break
            todos.extend(lista)
            print(f"[Auvo] Página {page}: {len(lista)} produtos (total acum: {len(todos)})")
            if len(lista) < page_size:
                break
            page += 1
        return todos

    def get_product(self, product_id: int) -> Optional[Dict]:
        """Busca detalhe de um produto. Endpoint: GET /products/{id}"""
        data = self._make_request(f"products/{product_id}")
        if data and "result" in data:
            return data["result"]
        return None

    def get_quotations(self, date_start: str, date_end: str, customer_id: Optional[int] = None, page: int = 1, page_size: int = 50) -> List[Dict]:
        """Lista orçamentos (quotations) por período. Endpoint: GET /quotations/"""
        # Auvo API v2 usa paramFilter JSON
        filter_dict = {
            "requestStartDate": date_start,
            "requestEndDate": date_end
        }
        if customer_id:
            filter_dict["customerId"] = customer_id
            
        params = {
            "paramFilter": json.dumps(filter_dict),
            "page": page,
            "pageSize": page_size,
            "order": "desc"
        }
        data = self._make_request("quotations/", params=params)
        if data and "result" in data:
            return data["result"].get("entityList", [])
        return []

    def get_all_quotations_by_period(self, date_start: str, date_end: str, page_size: int = 50) -> List[Dict]:
        """Busca todos os orçamentos (quotations) de um período paginando automaticamente."""
        todos = []
        page = 1
        while True:
            lista = self.get_quotations(date_start, date_end, page=page, page_size=page_size)
            if not lista:
                break
            todos.extend(lista)
            print(f"[Auvo] Página {page}: {len(lista)} orçamentos (total acum: {len(todos)})")
            if len(lista) < page_size:
                break
            page += 1
        return todos

    def get_quotation(self, quotation_id: int) -> Optional[Dict]:
        """Busca detalhe completo de um orçamento (quotation). Endpoint: GET /quotations/{id}"""
        data = self._make_request(f"quotations/{quotation_id}")
        if data and "result" in data:
            return data["result"]
        return None


auvo_client = AuvoClient()
