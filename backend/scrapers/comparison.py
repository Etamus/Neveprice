import json
import re
from urllib.parse import parse_qs, quote_plus, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from cachetools import TTLCache, cached

SOURCES = (
    ("Buscape", "https://www.buscape.com.br"),
    ("Zoom", "https://www.zoom.com.br"),
)

STORE_ALIASES = {
    "amazon": ("amazon", "amazon.com.br"),
    "comclick": ("comclick", "com click"),
    "dufrio": ("dufrio",),
    "friolar": ("friolar", "friolar pecas", "friolar peças"),
    "gold_service": ("gold service", "goldservice"),
    "magalu": ("magazine luiza", "magalu"),
    "mercado_livre": ("mercado livre", "mercadolivre"),
    "mg_parts": ("mg parts", "mgparts"),
    "refrigeracao_mota": ("refrigeracao mota", "refrigeração mota"),
    "shopee": ("shopee",),
}

TARGET_STORE_ALIASES = {
    "Amazon Brasil": ("amazon", "amazon.com.br"),
    "ComClick": ("comclick", "com click"),
    "Dufrio": ("dufrio",),
    "Friolar": ("friolar", "friolar pecas", "friolar peças"),
    "Gold Service": ("gold service", "goldservice"),
    "Magazine Luiza": ("magazine luiza", "magalu"),
    "Mercado Livre": ("mercado livre", "mercadolivre"),
    "MG Parts": ("mg parts", "mgparts"),
    "Refrigeração Mota": ("refrigeracao mota", "refrigeração mota"),
    "Shopee": ("shopee",),
    "Leroy Merlin": ("leroy", "leroy merlin"),
}

cache = TTLCache(maxsize=100, ttl=900)
DETAIL_OFFER_LIMIT = 6
LEAD_TIMEOUT = 8


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


def _seller_from_url(value, fallback=None):
    parsed = urlparse(value or "")
    query = parse_qs(parsed.query)
    seller_id = (query.get("seller_id") or [""])[0].strip()

    if seller_id:
        return seller_id

    if "produto.mercadolivre" in parsed.netloc:
        item_match = re.search(r"/(MLB-\d+)", parsed.path, re.I)
        if item_match:
            return f"{item_match.group(1).upper()}-ML"

    return fallback


def _pretty_seller(value, source_label):
    seller = (value or "").strip()
    if not seller:
        return source_label

    if seller.lower() == source_label.lower():
        return seller

    suffixes = {
        "Magazine Luiza": "Magalu",
        "Mercado Livre": "ML",
        "Shopee": "Shopee",
    }
    suffix = suffixes.get(source_label)
    if suffix and not seller.lower().endswith(f"-{suffix.lower()}"):
        return f"{seller}-{suffix}"

    return seller


@cached(cache)
def _lead_redirect_info(lead_url: str):
    try:
        response = requests.get(lead_url, headers=_headers(), timeout=LEAD_TIMEOUT)
        if response.status_code != 200:
            return {}

        soup = BeautifulSoup(response.text, "html.parser")
        next_data = soup.find("script", id="__NEXT_DATA__")
        if not next_data or not next_data.string:
            return {}

        data = json.loads(next_data.string)
        page_props = data.get("props", {}).get("pageProps", {})
        redirect_url = page_props.get("urlToRedirect")
        if not redirect_url:
            return {}

        redirect_response = requests.get(
            redirect_url,
            headers=_headers(),
            timeout=LEAD_TIMEOUT,
            allow_redirects=False,
        )
        location = redirect_response.headers.get("location") or redirect_url
        return {
            "url": location,
            "seller": _seller_from_url(location, page_props.get("rawName")),
        }
    except Exception as e:
        print(f"Erro ao resolver lojista no comparador: {e}")
        return {}


def _enrich_offer_url(product_url, source_label, seller_name):
    if "/lead?" not in product_url:
        seller = _seller_from_url(product_url, seller_name)
        return product_url, _pretty_seller(seller, source_label)

    info = _lead_redirect_info(product_url)
    final_url = info.get("url") or product_url
    seller = info.get("seller") or seller_name
    return final_url, _pretty_seller(seller, source_label)


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
            seller_name = offer.get("sellerName") or ""
            store_label = _target_store_label(seller_name)
            if not store_label:
                continue

            price = _as_float(offer.get("price"))
            name = (offer.get("name") or item["name"] or "").strip()
            if not name or not price:
                continue

            final_url, seller = _enrich_offer_url(
                item["url"],
                store_label,
                seller_name.strip() or store_label,
            )

            current = best_by_store.get(seller)
            if current and current["price"] <= price:
                continue

            best_by_store[seller] = {
                "name": name,
                "price": price,
                "store": seller,
                "source": store_label,
                "seller": seller,
                "url": final_url,
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
            merchant_name = (
                best_offer.get("merchantName")
                or item.get("merchantName")
                or ""
            )
            if not _matches_store(merchant_name, store_key):
                continue

            name = item.get("name") or item.get("shortName") or item.get("title")
            price = _as_float(item.get("price"))
            relative_url = item.get("url")
            if not name or not price or not relative_url:
                continue

            product_url = urljoin(item["_base_url"], relative_url)
            final_url, seller = _enrich_offer_url(
                product_url,
                store_label,
                merchant_name.strip() or store_label,
            )
            seen_key = (seller, name.strip().lower(), round(price, 2))
            if seen_key in seen:
                continue
            seen.add(seen_key)

            products.append(
                {
                    "name": name.strip(),
                    "price": price,
                    "store": seller,
                    "source": store_label,
                    "seller": seller,
                    "url": final_url,
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

            final_url, seller = _enrich_offer_url(
                product_url,
                store_label,
                seller_name.strip() or store_label,
            )
            seen_key = (seller, name.strip().lower(), round(price, 2))
            if seen_key in seen:
                continue
            seen.add(seen_key)

            products.append(
                {
                    "name": name.strip(),
                    "price": price,
                    "store": seller,
                    "source": store_label,
                    "seller": seller,
                    "url": final_url,
                    "brand": store_label,
                    "category": item.get("category") or product_query,
                    "image_url": offer.get("imageUrl") or item.get("image_url"),
                }
            )

    return products


def scrape_amazon_comparison(product_query: str):
    return scrape_comparison_store(product_query, "amazon", "Amazon Brasil")


def scrape_magalu_comparison(product_query: str):
    return scrape_comparison_store(product_query, "magalu", "Magazine Luiza")


def scrape_mercado_livre_comparison(product_query: str):
    return scrape_comparison_store(product_query, "mercado_livre", "Mercado Livre")


def scrape_shopee_comparison(product_query: str):
    return scrape_comparison_store(product_query, "shopee", "Shopee")


def scrape_dufrio_comparison(product_query: str):
    return scrape_comparison_store(product_query, "dufrio", "Dufrio")


def scrape_friolar_comparison(product_query: str):
    return scrape_comparison_store(product_query, "friolar", "Friolar")


def scrape_refrigeracao_mota_comparison(product_query: str):
    return scrape_comparison_store(
        product_query,
        "refrigeracao_mota",
        "Refrigeração Mota",
    )


def scrape_mg_parts_comparison(product_query: str):
    return scrape_comparison_store(product_query, "mg_parts", "MG Parts")


def scrape_gold_service_comparison(product_query: str):
    return scrape_comparison_store(product_query, "gold_service", "Gold Service")


def scrape_comclick_comparison(product_query: str):
    return scrape_comparison_store(product_query, "comclick", "ComClick")
