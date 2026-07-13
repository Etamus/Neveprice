import random
from urllib.parse import quote_plus

import requests

session = requests.Session()

MARKETPLACE_CONFIGS = {
    "mercado_livre": {
        "base_url": "https://lista.mercadolivre.com.br/",
        "sort_param": "_OrderId_PRICE_ASC",
    },
    "amazon": {
        "base_url": "https://www.amazon.com.br/s?k=",
        "sort_param": "&s=price-asc-rank",
    },
}


def build_url(marketplace, product_name):
    config = MARKETPLACE_CONFIGS.get(marketplace)
    return f"{config['base_url']}{quote_plus(product_name)}{config['sort_param']}"


USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (AppleWebKit/537.36, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edge/122.0.2365.66",
]


def get_random_headers():
    return {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.google.com/",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate",
        "Upgrade-Insecure-Requests": "1",
    }


def fetch_marketplace_data(marketplace, product_name):
    url = build_url(marketplace, product_name)
    try:
        response = session.get(url, headers=get_random_headers(), timeout=15)

        if response.status_code == 200:
            first_chunk = response.text[:2000]
            if (
                "account-verification" in response.url
                or "suspicious-traffic" in first_chunk
            ):
                print(f"{marketplace} bloqueou a consulta por verificacao de trafego.")
                return None
            return response.text

        if response.status_code == 503:
            print(f"Erro 503 na {marketplace}: servidor bloqueou ou esta sobrecarregado.")
            return None

        print(f"Erro {response.status_code} ao acessar {marketplace}")
        return None

    except Exception as e:
        print(f"Falha na requisicao para {marketplace}: {e}")
        return None
