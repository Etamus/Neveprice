from typing import Optional
import re
from urllib.parse import parse_qs, unquote, urlparse

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.product import PriceHistory, Product
from schemas.product import ProductCreate
from scrapers.comparison import _lead_redirect_info
from services.scraper_service import (
    TARGET_STORES,
    _primary_sku,
    build_summary_from_cached_results,
    run_all_scrapers,
)

product_router = APIRouter()
TARGET_STORE_NAMES = list(
    {
        name
        for store in TARGET_STORES
        for name in [store["label"], *store.get("aliases", [])]
    }
)


def _seller_from_url(store, source, url):
    source_name = source or store
    store_name = store or source_name
    parsed = urlparse(url or "")
    query = parse_qs(parsed.query)

    if source_name == "Magazine Luiza" and store_name == "Magazine Luiza":
        seller_id = (query.get("seller_id") or [""])[0].strip()
        if seller_id:
            return f"{seller_id}-Magalu"

    if source_name == "Mercado Livre" and store_name == "Mercado Livre":
        match = re.search(r"/(MLB-\d+)", unquote(parsed.path), re.I)
        if match:
            return f"{match.group(1).upper()}-ML"
        match = re.search(r"/((?:MLB|MLBU)\d+)", unquote(parsed.path), re.I)
        if match:
            return f"{match.group(1).upper()}-ML"

    if source_name == "Shopee" and store_name == "Shopee":
        match = re.search(r"/product/(\d+)/\d+|-i\.(\d+)\.\d+", unquote(parsed.path))
        shop_id = next((group for group in match.groups() if group), None) if match else None
        if shop_id:
            return f"Shopee Loja {shop_id}"

    return store_name


def _resolve_cached_offer(store, source, url):
    resolved_url = url
    resolved_store = store

    if "/lead?" in (url or ""):
        info = _lead_redirect_info(url)
        resolved_url = info.get("url") or url
        resolved_store = info.get("seller") or store
        if (
            source == "Magazine Luiza"
            and resolved_store != source
            and not resolved_store.lower().endswith("-magalu")
        ):
            resolved_store = f"{resolved_store}-Magalu"

    return {
        "store": _seller_from_url(resolved_store, source, resolved_url),
        "url": resolved_url,
    }


def _latest_products_query(db: Session):
    subquery = (
        db.query(
            PriceHistory.product_id,
            func.max(PriceHistory.timestamp).label("latest_timestamp"),
        )
        .group_by(PriceHistory.product_id)
        .subquery()
    )

    return (
        db.query(Product, PriceHistory)
        .join(PriceHistory, Product.id == PriceHistory.product_id)
        .join(
            subquery,
            (PriceHistory.product_id == subquery.c.product_id)
            & (PriceHistory.timestamp == subquery.c.latest_timestamp),
        )
    )


def _query_terms(search_text: str):
    return [term.strip() for term in search_text.split() if len(term.strip()) >= 2]


def _apply_search_filter(query, search_text: str, match_all: bool):
    terms = _query_terms(search_text)
    if not terms:
        return query

    clauses = [Product.name.ilike(f"%{term}%") for term in terms]
    return query.filter(and_(*clauses) if match_all else or_(*clauses))


def _serialize_results(results):
    serialized = []

    for product, price in results:
        source = price.source or price.store
        resolved = _resolve_cached_offer(price.store, source, price.url)
        serialized.append(
            {
                "id": product.id,
                "name": product.name,
                "brand": product.brand,
                "category": product.category,
                "sku": product.sku,
                "image_url": product.image_url,
                "current_price": price.price,
                "store": resolved["store"],
                "source": source,
                "url": resolved["url"],
                "last_update": price.timestamp,
            }
        )

    return serialized


def _find_products(db: Session, search_text: Optional[str] = None):
    query = _latest_products_query(db).filter(
        or_(
            PriceHistory.source.in_(TARGET_STORE_NAMES),
            and_(
                PriceHistory.source.is_(None),
                PriceHistory.store.in_(TARGET_STORE_NAMES),
            ),
        )
    )

    if search_text:
        strict_results = (
            _apply_search_filter(query, search_text, match_all=True)
            .order_by(PriceHistory.price.asc())
            .limit(30)
            .all()
        )
        if strict_results:
            return strict_results

        return (
            _apply_search_filter(query, search_text, match_all=False)
            .order_by(PriceHistory.price.asc())
            .limit(30)
            .all()
        )

    return query.order_by(PriceHistory.timestamp.desc()).limit(50).all()


def _find_sku_products(db: Session, sku: str):
    query = _latest_products_query(db).filter(
        or_(Product.sku == sku, Product.name.ilike(f"%{sku}%"))
    )
    query = query.filter(
        or_(
            PriceHistory.source.in_(TARGET_STORE_NAMES),
            and_(
                PriceHistory.source.is_(None),
                PriceHistory.store.in_(TARGET_STORE_NAMES),
            ),
        )
    )
    return query.order_by(PriceHistory.price.asc()).limit(250).all()


@product_router.post("/", status_code=201)
def create_product(product_data: ProductCreate, db: Session = Depends(get_db)):
    new_product = Product(
        name=product_data.name,
        brand=product_data.brand,
        description=product_data.description,
        category=product_data.category,
        image_url=product_data.image_url,
        sku=product_data.sku,
    )

    db.add(new_product)
    db.commit()
    db.refresh(new_product)

    new_price = PriceHistory(
        product_id=new_product.id,
        price=product_data.initial_price.price,
        store=product_data.initial_price.store,
        source=product_data.initial_price.source or product_data.initial_price.store,
        url=product_data.initial_price.url,
    )

    db.add(new_price)
    db.commit()

    return {"message": "Produto e preço inicial cadastrados!", "id": new_product.id}


@product_router.get("/")
def search_products(
    q: Optional[str] = Query(None, min_length=2), db: Session = Depends(get_db)
):
    return _serialize_results(_find_products(db, q))


@product_router.post("/refresh")
def refresh_prices(q: str, db: Session = Depends(get_db)):
    summary = run_all_scrapers(q, db)
    return {
        "message": (
            "Busca finalizada. "
            f"{summary['processed_count']} preços novos ou atualizados"
        ),
        "results": summary["results"],
        "stores": summary["stores"],
        "comparison": summary["comparison"],
    }


@product_router.get("/search")
def search_and_update(q: str = Query(..., min_length=2), db: Session = Depends(get_db)):
    search_text = q.strip()
    sku = _primary_sku(search_text)

    if sku:
        cached_results = _serialize_results(_find_sku_products(db, sku))
        if cached_results:
            summary = build_summary_from_cached_results(cached_results, sku)
            unavailable_count = len(
                [store for store in summary["stores"] if not store["available"]]
            )
            return {
                "message": (
                    f"Resultado carregado do banco local. {len(cached_results)} "
                    f"ofertas analisadas para {sku}; {unavailable_count} "
                    "lojas sem disponibilidade."
                ),
                "results": summary["results"],
                "stores": summary["stores"],
                "comparison": summary["comparison"],
            }

    summary = run_all_scrapers(search_text, db)
    results = summary["results"]
    comparison = summary["comparison"]
    unavailable_count = len(
        [store for store in summary["stores"] if not store["available"]]
    )

    if results:
        message = (
            f"Busca concluída. {len(results)} ofertas analisadas em "
            f"{len(comparison)} linhas comparativas; {unavailable_count} "
            "lojas sem disponibilidade."
        )
    else:
        message = (
            "Nenhuma das lojas alvo retornou oferta nas fontes gratuitas agora. "
            "Cada loja foi marcada como Não disponível."
        )

    return {
        "message": message,
        "results": results,
        "stores": summary["stores"],
        "comparison": comparison,
    }
