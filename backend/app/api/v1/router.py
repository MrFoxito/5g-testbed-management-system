from fastapi import APIRouter

from app.api.v1.endpoints import audit, auth, configuration, observability, scenarios, subscribers

router = APIRouter()
router.include_router(auth.router)
router.include_router(scenarios.router)
router.include_router(configuration.router)
router.include_router(subscribers.router)
router.include_router(observability.router)
router.include_router(audit.router)
