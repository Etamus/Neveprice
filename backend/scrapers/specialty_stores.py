import json
import re
from html import unescape
from urllib.parse import quote_plus, urljoin

import requests
from bs4 import BeautifulSoup
from cachetools import TTLCache, cached

cache = TTLCache(maxsize=100, ttl=900)

STORE_LIMIT = 50
PRODUCT_STOP_WORDS = {
    "a",
    "as",
    "com",
    "da",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "no",
    "o",
    "os",
    "para",
    "por",
}


def _cache_key(store_key):
    return lambda product_query: (store_key, product_query)


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
    if value is None:
        return None

    if isinstance(value, (int, float)):
        return float(value) if value > 0 else None

    cleaned = (
        str(value)
        .replace("R$", "")
        .replace("\xa0", " ")
        .replace(" ", "")
        .strip()
    )
    cleaned = re.sub(r"[^\d,.]", "", cleaned)

    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    else:
        parts = cleaned.split(".")
        cleaned = "".join(parts) if parts and len(parts[-1]) == 3 else cleaned

    try:
        price = float(cleaned)
    except ValueError:
        return None

    return price if price > 0 else None


def _prices_from_text(text):
    prices = []
    normalized = re.sub(r"\s+", " ", text or "")

    for match in re.finditer(r"R\$\s*[\d.]+(?:\s*,\s*\d{2}|,\d{2})?", normalized):
        before = normalized[max(0, match.start() - 20) : match.start()].lower()
        after = normalized[match.end() : match.end() + 34].lower()

        if re.search(r"\d+\s*x\s*(de)?\s*$", before):
            continue
        if "sem juros" in after or "com juros" in after:
            continue

        price = _as_float(match.group())
        if price:
            prices.append(price)

    return prices


def _first_price(text):
    prices = _prices_from_text(text)
    return min(prices) if prices else None


def _absolute_url(base_url, value):
    if not value:
        return ""
    if value.startswith("//"):
        return f"https:{value}"
    return urljoin(base_url, value)


def _image_url(base_url, card):
    image = card.select_one("img")
    if not image:
        return None

    for attribute in (
        "data-src",
        "data-original",
        "data-lazy",
        "data-srcset",
        "srcset",
        "src",
    ):
        value = image.get(attribute)
        if not value:
            continue
        candidate = value.split(",")[0].strip().split(" ")[0]
        if candidate and "empty.png" not in candidate and "--PRODUTO" not in candidate:
            return _absolute_url(base_url, candidate)

    return None


def _clean_name(value):
    cleaned = re.sub(r"\s+", " ", value or "").strip()
    cleaned = re.sub(r"\s+R\$\s*.*$", "", cleaned).strip()
    if "--PRODUTO" in cleaned:
        return ""
    return cleaned


def _normalize_text(value):
    normalized = unescape(value or "").lower()
    normalized = (
        normalized.replace("á", "a")
        .replace("à", "a")
        .replace("ã", "a")
        .replace("â", "a")
        .replace("é", "e")
        .replace("ê", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ô", "o")
        .replace("õ", "o")
        .replace("ú", "u")
        .replace("ç", "c")
    )
    return normalized


def _tokens(value):
    tokens = {
        token
        for token in re.findall(r"[a-z0-9]+", _normalize_text(value))
        if len(token) > 1 and token not in PRODUCT_STOP_WORDS
    }

    if "geladeira" in tokens:
        tokens.add("refrigerador")
    if "refrigerador" in tokens:
        tokens.add("geladeira")
    if "geladeiras" in tokens:
        tokens.update({"geladeira", "refrigerador"})
    if "refrigeradores" in tokens:
        tokens.update({"geladeira", "refrigerador"})

    return tokens


def _matches_query(name, product_query):
    query_tokens = _tokens(product_query)
    if not query_tokens:
        return True

    return bool(query_tokens.intersection(_tokens(name)))


def _product(base_url, label, product_query, name, price, url, image_url=None):
    name = _clean_name(name)
    product_url = _absolute_url(base_url, url)
    price = _as_float(price)

    if not name or not price or not product_url or not _matches_query(name, product_query):
        return None

    return {
        "name": name,
        "price": price,
        "store": label,
        "url": product_url,
        "brand": label,
        "category": product_query,
        "image_url": image_url,
    }


def _deduplicate(products):
    unique = []
    seen = set()

    for product in products:
        key = (
            product["url"].split("?")[0].rstrip("/"),
            round(product["price"], 2),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(product)

    return unique[:STORE_LIMIT]


def _get(url):
    response = requests.get(url, headers=_headers(), timeout=15)
    if response.status_code != 200:
        return None
    return response.text


def _jsonld_items(soup):
    items = []

    for script in soup.select('script[type="application/ld+json"]'):
        raw = script.string or script.get_text()
        if not raw:
            continue

        try:
            data = json.loads(raw)
        except Exception:
            continue

        if isinstance(data, list):
            items.extend(data)
        elif isinstance(data, dict):
            graph = data.get("@graph")
            if isinstance(graph, list):
                items.extend(graph)
            else:
                items.append(data)

    return items


def _offer_price(offers):
    if isinstance(offers, list):
        prices = [_as_float(offer.get("price")) for offer in offers if isinstance(offer, dict)]
        prices = [price for price in prices if price]
        return min(prices) if prices else None

    if isinstance(offers, dict):
        return _as_float(offers.get("price"))

    return None


def _scrape_jsonld_products(url, label, product_query):
    html = _get(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    products = []

    for item in _jsonld_items(soup):
        if not isinstance(item, dict):
            continue

        item_type = item.get("@type")
        if isinstance(item_type, list):
            is_product = "Product" in item_type
        else:
            is_product = item_type == "Product"

        if not is_product:
            continue

        price = _offer_price(item.get("offers"))
        product = _product(
            url,
            label,
            product_query,
            item.get("name"),
            price,
            item.get("url"),
            item.get("image"),
        )
        if product:
            products.append(product)

    return _deduplicate(products)


def _scrape_loja_integrada(url, base_url, label, product_query):
    html = _get(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    products = []

    for card in soup.select(".listagem-item"):
        name_link = card.select_one(".nome-produto[href]")
        overlay_link = card.select_one(".produto-sobrepor[href]")
        price_box = card.select_one(".preco-produto")
        name = name_link.get_text(" ", strip=True) if name_link else ""
        product_url = (name_link or overlay_link).get("href") if (name_link or overlay_link) else ""
        price = _first_price(price_box.get_text(" ", strip=True) if price_box else card.get_text(" ", strip=True))

        product = _product(
            base_url,
            label,
            product_query,
            name,
            price,
            product_url,
            _image_url(base_url, card),
        )
        if product:
            products.append(product)

    return _deduplicate(products)


def _scrape_shopify(url, base_url, label, product_query):
    html = _get(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    products = []

    for card in soup.select("product-card, .product-card"):
        name_link = card.select_one(".product-card-title[href]")
        if not name_link:
            continue

        price_box = card.select_one(".price") or card
        product = _product(
            base_url,
            label,
            product_query,
            name_link.get_text(" ", strip=True),
            _first_price(price_box.get_text(" ", strip=True)),
            name_link.get("href"),
            _image_url(base_url, card),
        )
        if product:
            products.append(product)

    return _deduplicate(products)


def _decoded_template_soup(soup):
    html_parts = []

    for script in soup.select('script[type="text/template"]'):
        raw = script.string or script.get_text()
        if not raw:
            continue

        try:
            decoded = json.loads(raw)
        except Exception:
            decoded = unescape(raw)

        if "<li" in decoded or "<div" in decoded:
            html_parts.append(decoded)

    return BeautifulSoup("\n".join(html_parts), "html.parser")


def _scrape_woocommerce_templates(url, base_url, label, product_query):
    html = _get(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    template_soup = _decoded_template_soup(soup)
    products = []

    for card in template_soup.select("li.product"):
        name_link = card.select_one("a.product-loop-title[href]") or card.select_one("a[href]")
        name_node = card.select_one(".woocommerce-loop-product__title")
        price_node = card.select_one(".price")
        name = name_node.get_text(" ", strip=True) if name_node else ""
        product_url = name_link.get("href") if name_link else ""

        product = _product(
            base_url,
            label,
            product_query,
            name,
            _first_price(price_node.get_text(" ", strip=True) if price_node else card.get_text(" ", strip=True)),
            product_url,
            _image_url(base_url, card),
        )
        if product:
            products.append(product)

    return _deduplicate(products)


def _scrape_tray(url, base_url, label, product_query):
    html = _get(url)
    if not html:
        return []

    soup = BeautifulSoup(html, "html.parser")
    products = []

    for card in soup.select(".product"):
        link = (
            card.select_one("a.product-info[href]")
            or card.select_one("a.product-button[href]")
            or card.select_one("a[href]")
        )
        if not link:
            continue

        image = card.select_one("img[alt]")
        name = image.get("alt") if image and image.get("alt") else link.get_text(" ", strip=True)
        price_box = card.select_one(".price") or card

        product = _product(
            base_url,
            label,
            product_query,
            name,
            _first_price(price_box.get_text(" ", strip=True)),
            link.get("href"),
            _image_url(base_url, card),
        )
        if product:
            products.append(product)

    return _deduplicate(products)


@cached(cache, key=_cache_key("dufrio"))
def scrape_dufrio(product_query: str):
    url = f"https://www.dufrio.com.br/catalogsearch/result/?q={quote_plus(product_query)}"
    try:
        return _scrape_jsonld_products(url, "Dufrio", product_query)
    except Exception as e:
        print(f"Erro ao buscar na Dufrio: {e}")
        return []


@cached(cache, key=_cache_key("friolar"))
def scrape_friolar(product_query: str):
    urls = (
        "https://www.friolarpecas.com.br/buscar?q={query}",
        "https://friolar.lojaintegrada.com.br/buscar?q={query}",
    )
    products = []

    for url_template in urls:
        url = url_template.format(query=quote_plus(product_query))
        base_url = "/".join(url.split("/")[:3])
        try:
            products.extend(_scrape_loja_integrada(url, base_url, "Friolar", product_query))
        except Exception as e:
            print(f"Erro ao buscar na Friolar: {e}")

    return _deduplicate(products)


@cached(cache, key=_cache_key("refrigeracao_mota"))
def scrape_refrigeracao_mota(product_query: str):
    url = (
        "https://www.refrigeracaomota.com.br/"
        f"?s={quote_plus(product_query)}&post_type=product"
    )
    try:
        return _scrape_woocommerce_templates(
            url,
            "https://www.refrigeracaomota.com.br",
            "Refrigeração Mota",
            product_query,
        )
    except Exception as e:
        print(f"Erro ao buscar na Refrigeração Mota: {e}")
        return []


@cached(cache, key=_cache_key("mg_parts"))
def scrape_mg_parts(product_query: str):
    url = f"https://www.mgparts.com.br/search?type=product&q={quote_plus(product_query)}"
    try:
        return _scrape_shopify(url, "https://www.mgparts.com.br", "MG Parts", product_query)
    except Exception as e:
        print(f"Erro ao buscar na MG Parts: {e}")
        return []


@cached(cache, key=_cache_key("gold_service"))
def scrape_gold_service(product_query: str):
    url = f"https://www.goldservice.com.br/buscar?q={quote_plus(product_query)}"
    try:
        return _scrape_loja_integrada(
            url,
            "https://www.goldservice.com.br",
            "Gold Service",
            product_query,
        )
    except Exception as e:
        print(f"Erro ao buscar na Gold Service: {e}")
        return []


@cached(cache, key=_cache_key("comclick"))
def scrape_comclick(product_query: str):
    url = (
        "https://www.comclick.com.br/loja/busca.php"
        f"?loja=572273&palavra_busca={quote_plus(product_query)}"
    )
    try:
        return _scrape_tray(url, "https://www.comclick.com.br", "ComClick", product_query)
    except Exception as e:
        print(f"Erro ao buscar na ComClick: {e}")
        return []
