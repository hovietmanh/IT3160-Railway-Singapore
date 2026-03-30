from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.config import settings
from backend.app.api import auth, path, scenarios
from backend.app.services.pathfinding import get_pathfinding_service
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
    get_pathfinding_service()
    get_scenario_service()
    print("Server ready!")

@app.get("/")
def root():
    return {"message": "Pathfinding API is running"}