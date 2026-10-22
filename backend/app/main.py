import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import Base, SessionLocal, engine
from .routers.api import router

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    if settings.seed_demo:
        from .seed import seed_demo
        with SessionLocal() as db:
            seed_demo(db)
    yield


app = FastAPI(
    title="Кредитный кабинет предпринимателя — API (демо-прототип)",
    version="0.1.0",
    description="Сквозной кредитный путь малого бизнеса: заявка → проверки → скоринг → решение → договор → выдача. Все данные синтетические.",
    lifespan=lifespan,
)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
