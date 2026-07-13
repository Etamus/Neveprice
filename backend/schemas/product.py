from pydantic import BaseModel, HttpUrl
from datetime import datetime
from typing import Optional, List

class PriceHistoryCreate(BaseModel):
    price: float
    store: str
    url: str

class ProductCreate(BaseModel):
    name: str
    brand: str
    description: Optional[str] = None
    category: str
    image_url: Optional[str] = None

    initial_price: PriceHistoryCreate
