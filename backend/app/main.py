from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.config import settings
from backend.app.api import auth, path, scenarios
from backend.app.services.scenario import get_scenario_service

app = FastAPI(title="Pathfinding API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(path.router)
app.include_router(scenarios.router)

@app.on_event("startup")
def startup():
    from backend.app.services.pathfinding import reload_pathfinding_service
    svc = reload_pathfinding_service()
    if len(svc.nodes) == 0:
        print("WARNING: DB empty - run rawprocessing.py first!")
    get_scenario_service()
    print("Server ready!")

@app.get("/")
def root():
    return {"message": "Pathfinding API is running"}