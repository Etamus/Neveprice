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

TARGET_STORE_ALIASES = {
    "Amazon": ("amazon", "amazon.com.br"),
    "Magazine Luiza": ("magazine luiza", "magalu"),
    "Mercado Livre": ("mercado livre", "mercadolivre"),
    "Shopee": ("shopee",),
    "Leroy Merlin": ("leroy", "leroy merlin"),
}

cache = TTLCache(maxsize=100, ttl=900)
DETAIL_OFFER_LIMIT = 6


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


def _target_store_label(merchant_name):
    normalized = _normalize_store(merchant_name)
    for label, aliases in TARGET_STORE_ALIASES.items():
        if any(_normalize_store(alias) in normalized for alias in aliases):
            return label
    return None


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


def _extract_offer_list(html):
    soup = BeautifulSoup(html, "html.parser")
    next_data = soup.find("script", id="__NEXT_DATA__")
    if not next_data or not next_data.string:
        return []

    data = json.loads(next_data.string)
    return (
        data.get("props", {})
        .get("initialReduxState", {})
        .get("offers", {})
        .get("offerList", [])
    )


@cached(cache)
def _product_offer_list(product_url: str):
    try:
        response = requests.get(product_url, headers=_headers(), timeout=8)
        if response.status_code != 200:
            return []
        return _extract_offer_list(response.text)
    except Exception as e:
        print(f"Erro ao buscar ofertas agrupadas em comparador: {e}")
        return []


@cached(cache)
def _search_hits(product_query: str):
    hits = []

    for source_name, base_url in SOURCES:
        url = f"{base_url}/search?q={quote_plus(product_query)}"

        try:
            response = requests.get(url, headers=_headers(), timeout=8)
            if response.status_code != 200:
                print(f"{source_name} retornou HTTP {response.status_code}")
                continue

            hits.extend(
                {
                    **item,
                    "_source_name": source_name,
                    "_base_url": base_url,
                }
                for item in _extract_hits(response.text)[:50]
            )
        except Exception as e:
            print(f"Erro ao buscar em {source_name}: {e}")

    return hits


@cached(cache)
def scrape_comparison_catalog(product_query: str, limit: int = 10):
    products = []
    seen = set()

    for item in _search_hits(product_query):
        if item.get("type") != "product":
            continue

        name = item.get("name") or item.get("shortName") or item.get("title")
        price = _as_float(item.get("price"))
        relative_url = item.get("url")
        source_id = item.get("sourceId") or item.get("objectId") or name
        store_count = int(item.get("storeCount") or 0)
        best_offer = item.get("bestOffer") or {}

        if not name or not price or not relative_url or store_count < 2:
            continue

        key = str(source_id).strip().lower()
        if key in seen:
            continue
        seen.add(key)

        products.append(
            {
                "name": name.strip(),
                "price": price,
                "store_count": store_count,
                "best_store": best_offer.get("merchantName") or "Comparador",
                "url": urljoin(item["_base_url"], relative_url),
                "brand": "Comparador",
                "category": item.get("categoryName") or product_query,
                "image_url": item.get("image"),
            }
        )

        if len(products) >= limit:
            break

    return sorted(
        products,
        key=lambda item: (-item["store_count"], item["price"], item["name"]),
    )


@cached(cache)
def scrape_target_catalog(product_query: str, limit: int = 30):
    products = []

    for item in scrape_comparison_catalog(product_query, limit=limit):
        best_by_store = {}

        for offer in _product_offer_list(item["url"]):
            store_label = _target_store_label(offer.get("sellerName") or "")
            if not store_label:
                continue

            price = _as_float(offer.get("price"))
            name = (offer.get("name") or item["name"] or "").strip()
            if not name or not price:
                continue

            current = best_by_store.get(store_label)
            if current and current["price"] <= price:
                continue

            best_by_store[store_label] = {
                "name": name,
                "price": price,
                "store": store_label,
                "url": item["url"],
                "brand": store_label,
                "category": item.get("category") or product_query,
                "image_url": offer.get("imageUrl") or item.get("image_url"),
            }

        if not best_by_store:
            continue

        offers = sorted(best_by_store.values(), key=lambda offer: offer["price"])
        products.append(
            {
                "name": item["name"],
                "price": offers[0]["price"],
                "store_count": len(offers),
                "best_store": offers[0]["store"],
                "url": offers[0]["url"],
                "brand": "Comparador",
                "category": item.get("category") or product_query,
                "image_url": item.get("image_url"),
                "target_offers": offers,
            }
        )

    return sorted(
        products,
        key=lambda item: (-item["store_count"], item["price"], item["name"]),
    )


@cached(cache)
def scrape_comparison_store(product_query: str, store_key: str, store_label: str):
    products = []
    seen = set()

    for item in _search_hits(product_query):
        try:
            best_offer = item.get("bestOffer") or {}
            merchant_name = best_offer.get("merchantName") or ""
            if not _matches_store(merchant_name, store_key):
                continue

            name = item.get("name") or item.get("shortName") or item.get("title")
            price = _as_float(item.get("price"))
            relative_url = item.get("url")
            if not name or not price or not relative_url:
                continue

            product_url = urljoin(item["_base_url"], relative_url)
            seen_key = (store_label, name.strip().lower(), round(price, 2))
            if seen_key in seen:
                continue
            seen.add(seen_key)

            products.append(
                {
                    "name": name.strip(),
                    "price": price,
                    "store": store_label,
                    "url": product_url,
                    "brand": store_label,
                    "category": item.get("categoryName") or product_query,
                    "image_url": item.get("image"),
                }
            )
        except Exception as e:
            print(f"Erro ao processar comparador para {store_label}: {e}")

    for item in scrape_comparison_catalog(product_query, limit=DETAIL_OFFER_LIMIT):
        product_url = item["url"]
        for offer in _product_offer_list(product_url):
            seller_name = offer.get("sellerName") or ""
            if not _matches_store(seller_name, store_key):
                continue

            name = offer.get("name") or item["name"]
            price = _as_float(offer.get("price"))
            if not name or not price:
                continue

            seen_key = (store_label, name.strip().lower(), round(price, 2))
            if seen_key in seen:
                continue
            seen.add(seen_key)

            products.append(
                {
                    "name": name.strip(),
                    "price": price,
                    "store": store_label,
                    "url": product_url,
                    "brand": store_label,
                    "category": item.get("category") or product_query,
                    "image_url": offer.get("imageUrl") or item.get("image_url"),
                }
            )

    return products


def scrape_amazon_comparison(product_query: str):
    return scrape_comparison_store(product_query, "amazon", "Amazon")


def scrape_magalu_comparison(product_query: str):
    return scrape_comparison_store(product_query, "magalu", "Magazine Luiza")


def scrape_mercado_livre_comparison(product_query: str):
    return scrape_comparison_store(product_query, "mercado_livre", "Mercado Livre")


def scrape_shopee_comparison(product_query: str):
    return scrape_comparison_store(product_query, "shopee", "Shopee")
