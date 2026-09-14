from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import router
from app.core.config import get_settings
from app.db import initialize
from app.services.trace_tasks import trace_task_service
from app.services.performance import metrics_collector
from app.services.alarm_center import alarm_observer


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize()
    if get_settings().deployment_stage == "connectivity":
        yield
        return
    await trace_task_service.initialize()
    await metrics_collector.start()
    await alarm_observer.start()
    yield
    await alarm_observer.stop()
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


@app.middleware("http")
async def connectivity_stage_guard(request, call_next):
    """Do not expose simulated NF data or permit operations in infrastructure-only mode."""
    prefix = get_settings().api_prefix
    path = request.url.path
    if get_settings().deployment_stage == "connectivity" and path.startswith(prefix + "/"):
        allowed = path == prefix + "/deployment" or path.startswith(prefix + "/deployment/") or path == prefix + "/auth/login"
        if not allowed and request.method != "OPTIONS":
            return JSONResponse(status_code=409, content={"detail": "Este despliegue solo tiene habilitada la verificación de conectividad de VMs"})
    return await call_next(request)


@app.get("/health")
def health():
    return {"status": "ok", "execution_mode": settings.execution_mode}
