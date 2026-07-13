from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import models.product  # noqa: F401
from database import Base, engine
from routes.products import product_router

Base.metadata.create_all(bind=engine)
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
