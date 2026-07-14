from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import models.product  # noqa: F401
from database import Base, engine
from models.product import KnownSku
from routes.products import product_router
from services.scraper_service import KNOWN_SKUS

Base.metadata.create_all(bind=engine)


def _ensure_sqlite_columns():
    if not str(engine.url).startswith("sqlite"):
        return

    with engine.begin() as connection:
        product_columns = {
            row[1] for row in connection.exec_driver_sql("PRAGMA table_info(products)")
        }
        if "sku" not in product_columns:
            connection.exec_driver_sql("ALTER TABLE products ADD COLUMN sku VARCHAR")
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_products_sku ON products (sku)"
            )

        price_columns = {
            row[1] for row in connection.exec_driver_sql("PRAGMA table_info(price_history)")
        }
        if "source" not in price_columns:
            connection.exec_driver_sql("ALTER TABLE price_history ADD COLUMN source VARCHAR")
            connection.exec_driver_sql(
                "CREATE INDEX IF NOT EXISTS ix_price_history_source ON price_history (source)"
            )


_ensure_sqlite_columns()


def _seed_known_skus():
    with engine.begin() as connection:
        existing = {
            row[0]
            for row in connection.exec_driver_sql("SELECT sku FROM known_skus")
        }
        for sku in sorted(KNOWN_SKUS - existing):
            connection.execute(KnownSku.__table__.insert().values(sku=sku))


_seed_known_skus()
app = FastAPI(title="Comparador de Precos")

origins = [
    "https://hudok139.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(product_router, prefix="/products", tags=["Products"])


@app.get("/")
async def root():
    return {"status": "API Online"}
