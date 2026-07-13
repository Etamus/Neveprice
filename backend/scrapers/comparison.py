import json
from urllib.parse import quote_plus, urljoin

import requests
from bs4 import BeautifulSoup
from cachetools import TTLCache, cached

SOURCES = (
    ("Buscape", "https://www.buscape.com.br"),
    ("Zoom", "https://www.zoom.com.br"),
)

STORE_ALIASES = {
    "amazon": ("amazon", "amazon.com.br"),
    "magalu": ("magazine luiza", "magalu"),
    "mercado_livre": ("mercado livre", "mercadolivre"),
    "shopee": ("shopee",),
}

cache = TTLCache(maxsize=100, ttl=900)


def _headers():
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/126.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,*/*;q=0.8"
        ),
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    }


def _as_float(value):
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return float(str(value).replace(".", "").replace(",", "."))
    except (TypeError, ValueError):
        return None


def _normalize_store(value):
    return "".join(ch for ch in (value or "").lower() if ch.isalnum() or ch.isspace())


def _matches_store(merchant_name, store_key):
    normalized = _normalize_store(merchant_name)
    return any(_normalize_store(alias) in normalized for alias in STORE_ALIASES[store_key])


def _extract_hits(html):
    soup = BeautifulSoup(html, "html.parser")
    next_data = soup.find("script", id="__NEXT_DATA__")
    if not next_data or not next_data.string:
        return []

    data = json.loads(next_data.string)
    return (
        data.get("props", {})
        .get("initialReduxState", {})
        .get("hits", {})
        .get("hits", [])
    )


@cached(cache)
def scrape_comparison_store(product_query: str, store_key: str, store_label: str):
    products = []

    for source_name, base_url in SOURCES:
        url = f"{base_url}/search?q={quote_plus(product_query)}"

        try:
            response = requests.get(url, headers=_headers(), timeout=15)
            if response.status_code != 200:
                print(f"{source_name} retornou HTTP {response.status_code}")
                continue

            for item in _extract_hits(response.text)[:50]:
                best_offer = item.get("bestOffer") or {}
                merchant_name = best_offer.get("merchantName") or ""
                if not _matches_store(merchant_name, store_key):
                    continue

                name = item.get("name") or item.get("shortName") or item.get("title")
                price = _as_float(item.get("price"))
                relative_url = item.get("url")
                if not name or not price or not relative_url:
                    continue

                products.append(
                    {
                        "name": name.strip(),
                        "price": price,
                        "store": store_label,
                        "url": urljoin(base_url, relative_url),
                        "brand": store_label,
                        "category": item.get("categoryName") or product_query,
                        "image_url": item.get("image"),
                    }
                )
        except Exception as e:
            print(f"Erro ao buscar em {source_name}: {e}")

    return products


def scrape_amazon_comparison(product_query: str):
    return scrape_comparison_store(product_query, "amazon", "Amazon")


def scrape_magalu_comparison(product_query: str):
    return scrape_comparison_store(product_query, "magalu", "Magazine Luiza")


def scrape_mercado_livre_comparison(product_query: str):
    return scrape_comparison_store(product_query, "mercado_livre", "Mercado Livre")


def scrape_shopee_comparison(product_query: str):
    return scrape_comparison_store(product_query, "shopee", "Shopee")
