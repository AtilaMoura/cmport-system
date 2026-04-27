import json
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
        url = f"{self.BASE_URL}/{endpoint}"
        try:
            response = requests.get(url, headers=self._get_headers(), params=params, timeout=30)
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


auvo_client = AuvoClient()
