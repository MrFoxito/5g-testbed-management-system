from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import router
from app.core.config import get_settings
from app.db import initialize
from app.services.trace_tasks import trace_task_service
from app.services.performance import metrics_collector


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize()
    await trace_task_service.initialize()
    await metrics_collector.start()
    yield
    await metrics_collector.stop()
    await trace_task_service.shutdown()


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router, prefix=settings.api_prefix)


@app.get("/health")
def health():
    return {"status": "ok", "execution_mode": settings.execution_mode}
