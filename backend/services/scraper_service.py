import random
import re
import time
import unicodedata
from datetime import datetime

from sqlalchemy.orm import Session

from models.product import PriceHistory, Product
from scrapers.amazon import scrape_amazon
from scrapers.comparison import (
    scrape_amazon_comparison,
    scrape_magalu_comparison,
    scrape_mercado_livre_comparison,
    scrape_shopee_comparison,
)
from scrapers.leroy import scrape_leroy
from scrapers.mercadoLivre import scrape_mercadoLivre
from scrapers.search_bridge import (
    scrape_mercado_livre_bridge,
    scrape_shopee_bridge,
)
from scrapers.shopee import scrape_shopee
from services.mercado_livre_api import search_mercado_livre

TARGET_STORES = [
    {
        "key": "mercado_livre",
        "label": "Mercado Livre",
        "scrapers": [
            search_mercado_livre,
            scrape_mercadoLivre,
            scrape_mercado_livre_comparison,
            scrape_mercado_livre_bridge,
        ],
    },
    {
        "key": "shopee",
        "label": "Shopee",
        "scrapers": [
            scrape_shopee,
            scrape_shopee_comparison,
            scrape_shopee_bridge,
        ],
    },
    {
        "key": "leroy_merlin",
        "label": "Leroy Merlin",
        "scrapers": [
            scrape_leroy,
        ],
    },
    {
        "key": "amazon",
        "label": "Amazon",
        "scrapers": [
            scrape_amazon,
            scrape_amazon_comparison,
        ],
    },
    {
        "key": "magalu",
        "label": "Magazine Luiza",
        "scrapers": [
            scrape_magalu_comparison,
        ],
    },
]

ELECTRONICS_TERMS = {
    "iphone",
    "celular",
    "smartphone",
    "notebook",
    "macbook",
    "ipad",
    "tablet",
    "playstation",
    "ps5",
    "xbox",
    "nintendo",
    "tv",
    "televisao",
    "monitor",
    "camera",
}

ACCESSORY_TERMS = {
    "adaptador",
    "bolsa",
    "cabo",
    "capa",
    "carregador",
    "case",
    "estojo",
    "fonte",
    "pelicula",
    "suporte",
    "vidro",
}

VARIANT_SCRAPERS = {
    "scrape_amazon_comparison",
    "scrape_leroy",
    "scrape_magalu_comparison",
    "scrape_mercado_livre_bridge",
    "scrape_mercado_livre_comparison",
    "scrape_search_bridge",
    "scrape_shopee_bridge",
    "scrape_shopee_comparison",
}


def _normalize_text(value):
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    return ascii_text.lower()


def _tokens(value):
    return set(re.findall(r"[a-z0-9]+", _normalize_text(value)))


def _query_variants(product_query):
    normalized = _normalize_text(product_query)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    token_list = re.findall(r"[a-z0-9]+", normalized)

    variants = []
    for variant in (
        product_query.strip(),
        normalized,
        " ".join(token_list),
        " ".join(reversed(token_list)) if 1 < len(token_list) <= 4 else "",
    ):
        variant = variant.strip()
        if variant and variant not in variants:
            variants.append(variant)

    return variants


def _is_accessory_mismatch(item, product_query):
    query_tokens = _tokens(product_query)
    if not query_tokens.intersection(ELECTRONICS_TERMS):
        return False

    name_tokens = _tokens(item["name"])
    return any(
        term in name_tokens and term not in query_tokens for term in ACCESSORY_TERMS
    )


def _sort_key(item, product_query):
    query_tokens = _tokens(product_query)
    name_tokens = _tokens(item["name"])
    missing_terms = len(query_tokens - name_tokens)
    phrase_miss = int(_normalize_text(product_query) not in _normalize_text(item["name"]))
    return (missing_terms, phrase_miss, item["price"])


def _normalize_result(item, product_query, store_label=None):
    name = (item.get("name") or "").strip()
    url = (item.get("url") or "").strip()
    store = store_label or (item.get("store") or "").strip() or "Loja"

    try:
        price = float(item.get("price"))
    except (TypeError, ValueError):
        return None

    if not name or not url or price <= 0:
        return None

    return {
        "name": name[:255],
        "price": price,
        "store": store[:100],
        "url": url[:1000],
        "brand": (item.get("brand") or store or "Oferta")[:100],
        "category": (item.get("category") or product_query)[:100],
        "image_url": item.get("image_url"),
    }


def _deduplicate(items):
    unique = []
    seen = set()

    for item in items:
        key = item["url"].split("?")[0].rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)

    return unique


def _product_response(item, fallback_id):
    return {
        "id": item.get("id") or fallback_id,
        "name": item["name"],
        "brand": item["brand"],
        "category": item["category"],
        "image_url": item.get("image_url"),
        "current_price": item["price"],
        "store": item["store"],
        "url": item["url"],
        "last_update": datetime.utcnow().isoformat(),
    }


def _save_result(item, db: Session):
    existing_price = (
        db.query(PriceHistory)
        .filter(PriceHistory.url == item["url"])
        .order_by(PriceHistory.timestamp.desc())
        .first()
    )

    if not existing_price:
        new_product = Product(
            name=item["name"],
            brand=item["brand"],
            category=item["category"],
            image_url=item["image_url"],
        )
        db.add(new_product)
        db.commit()
        db.refresh(new_product)

        new_price = PriceHistory(
            product_id=new_product.id,
            price=item["price"],
            store=item["store"],
            url=item["url"],
        )
        db.add(new_price)
        return 1

    product = db.query(Product).filter(Product.id == existing_price.product_id).first()
    if product:
        product.name = item["name"]
        product.brand = item["brand"]
        product.category = item["category"]
        product.image_url = item["image_url"] or product.image_url

    if existing_price.price != item["price"] or existing_price.store != item["store"]:
        new_price = PriceHistory(
            product_id=existing_price.product_id,
            price=item["price"],
            store=item["store"],
            url=item["url"],
        )
        db.add(new_price)
        return 1

    return 0


def _run_store_scrapers(store_config, product_query):
    store_results = []
    query_variants = _query_variants(product_query)

    for scraper_func in store_config["scrapers"]:
        normalized_results = []
        variants = (
            query_variants
            if scraper_func.__name__ in VARIANT_SCRAPERS
            else query_variants[:1]
        )

        for variant in variants:
            try:
                results = scraper_func(variant)
            except Exception as e:
                print(f" WARNING: Scraper {scraper_func.__name__} falhou: {e}")
                results = []

            normalized_results.extend(
                normalized
                for item in results
                if (
                    normalized := _normalize_result(
                        item,
                        product_query,
                        store_config["label"],
                    )
                )
                and not _is_accessory_mismatch(normalized, product_query)
            )

            if normalized_results:
                break

        if normalized_results:
            print(
                " LOG: "
                f"{store_config['label']} via {scraper_func.__name__} "
                f"retornou {len(normalized_results)} itens."
            )
            store_results.extend(normalized_results)
        else:
            print(
                " WARNING: "
                f"{store_config['label']} via {scraper_func.__name__} "
                "retornou lista vazia."
            )

        time.sleep(random.uniform(0.2, 0.6))

    return sorted(_deduplicate(store_results), key=lambda item: _sort_key(item, product_query))


def run_all_scrapers(product_query: str, db: Session):
    print(f" LOG: Iniciando buscas gratuitas para '{product_query}'")
    store_payloads = []
    available_results = []

    for store_config in TARGET_STORES:
        store_items = _run_store_scrapers(store_config, product_query)
        best_item = store_items[0] if store_items else None

        if best_item:
            response_product = _product_response(
                best_item,
                fallback_id=len(available_results) + 1,
            )
            available_results.append(response_product)
            store_payloads.append(
                {
                    "key": store_config["key"],
                    "label": store_config["label"],
                    "available": True,
                    "message": None,
                    "product": response_product,
                }
            )
        else:
            store_payloads.append(
                {
                    "key": store_config["key"],
                    "label": store_config["label"],
                    "available": False,
                    "message": "Não disponível",
                    "product": None,
                }
            )

    processed_count = 0
    for index, item in enumerate(
        [
            store_payload["product"]
            for store_payload in store_payloads
            if store_payload["product"]
        ]
    ):
        storage_item = {
            "name": item["name"],
            "price": item["current_price"],
            "store": item["store"],
            "url": item["url"],
            "brand": item["brand"],
            "category": item["category"],
            "image_url": item.get("image_url"),
        }
        try:
            processed_count += _save_result(storage_item, db)
        except Exception as e:
            print(f" ERROR: Falha ao processar item {index + 1}: {e}")
            db.rollback()

    db.commit()
    print(
        " LOG: Finalizado. "
        f"{len(available_results)} lojas com oferta, "
        f"{processed_count} precos novos/atualizados."
    )
    return {
        "processed_count": processed_count,
        "results": available_results,
        "stores": store_payloads,
    }
