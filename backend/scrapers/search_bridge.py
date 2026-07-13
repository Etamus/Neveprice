import re
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

import requests
from cachetools import TTLCache, cached

READER_URL = "https://r.jina.ai/http://https://html.duckduckgo.com/html/?q="

STORE_CONFIG = {
    "mercado_livre": {
        "label": "Mercado Livre",
        "domain": "mercadolivre.com.br",
        "site_query": "site:mercadolivre.com.br",
    },
    "shopee": {
        "label": "Shopee",
        "domain": "shopee.com.br",
        "site_query": "site:shopee.com.br/product",
    },
}

cache = TTLCache(maxsize=100, ttl=900)


def _headers():
    return {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/126.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    }


def _clean_markdown(value):
    value = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", value or "")
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = value.replace("**", "")
    return re.sub(r"\s+", " ", value).strip()


def _unwrap_duckduckgo_url(url):
    if not url:
        return ""

    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    if "uddg" in query:
        return unquote(query["uddg"][0])
    return url


def _parse_price(value):
    cleaned = (
        value.replace("R$", "")
        .replace("\xa0", " ")
        .replace(" ", "")
        .strip()
    )

    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    else:
        parts = cleaned.split(".")
        cleaned = "".join(parts) if len(parts[-1]) == 3 else cleaned

    try:
        price = float(cleaned)
    except ValueError:
        return None

    return price if price > 0 else None


def _prices_from_text(text):
    prices = []
    for match in re.finditer(r"R\$\s*[\d.]+(?:,\d{2})?", text):
        before = text[max(0, match.start() - 12) : match.start()].lower()
        after = text[match.end() : match.end() + 30].lower()
        if re.search(r"\d+\s*x\s*$", before) or "sem juros" in after:
            continue

        price = _parse_price(match.group())
        if price:
            prices.append(price)

    return prices


def _result_blocks(markdown):
    parts = re.split(r"\n##\s+", markdown or "")
    return [part for part in parts if "duckduckgo.com/l/?uddg=" in part]


def _title_and_url(block):
    match = re.search(r"\[([^\]]+)\]\((https://duckduckgo\.com/l/\?uddg=[^)]+)\)", block)
    if not match:
        return "", ""

    return _clean_markdown(match.group(1)), _unwrap_duckduckgo_url(match.group(2))


@cached(cache)
def scrape_search_bridge(product_query: str, store_key: str):
    config = STORE_CONFIG[store_key]
    query = f'{config["site_query"]} "{product_query}" R$'
    url = READER_URL + quote_plus(query)

    try:
        response = requests.get(url, headers=_headers(), timeout=20)
        if response.status_code != 200:
            print(f"Ponte de busca retornou HTTP {response.status_code}")
            return []

        products = []
        for block in _result_blocks(response.text):
            title, product_url = _title_and_url(block)
            if config["domain"] not in product_url:
                continue

            prices = _prices_from_text(_clean_markdown(block))
            if not title or not product_url or not prices:
                continue

            products.append(
                {
                    "name": title,
                    "price": min(prices),
                    "store": config["label"],
                    "url": product_url,
                    "brand": config["label"],
                    "category": product_query,
                    "image_url": None,
                }
            )

        return products
    except Exception as e:
        print(f"Erro na ponte de busca para {config['label']}: {e}")
        return []


def scrape_mercado_livre_bridge(product_query: str):
    return scrape_search_bridge(product_query, "mercado_livre")


def scrape_shopee_bridge(product_query: str):
    return scrape_search_bridge(product_query, "shopee")
