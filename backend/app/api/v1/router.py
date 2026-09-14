from fastapi import APIRouter

from app.api.v1.endpoints import (
    alarm_center,
    audit,
    auth,
    configuration,
    deployment,
    experiments,
    observability,
    operations,
    performance,
    scenarios,
    subscribers,
)

router = APIRouter()
router.include_router(deployment.router)
router.include_router(alarm_center.router)
router.include_router(auth.router)
router.include_router(scenarios.router)
router.include_router(configuration.router)
router.include_router(subscribers.router)
router.include_router(observability.router)
router.include_router(operations.router)
router.include_router(performance.router)
router.include_router(audit.router)
router.include_router(experiments.router)
