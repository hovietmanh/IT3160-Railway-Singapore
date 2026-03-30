from fastapi import APIRouter, HTTPException
from backend.app.services.pathfinding import get_pathfinding_service
from backend.app.config import settings

router = APIRouter(prefix="/api", tags=["path"])

@router.get("/path")
def find_path(
    sx: float, sy: float,
    gx: float, gy: float,
    vehicle: str = "foot",
    speed: float = 5.0
):
    if vehicle not in ["car", "foot"]:
        raise HTTPException(status_code=400, detail="vehicle phải là 'car' hoặc 'foot'")

    service = get_pathfinding_service()
    result = service.find_path(sx, sy, gx, gy, vehicle)

    if result is None:
        raise HTTPException(status_code=404, detail="Không tìm được đường đi")

    pixel_per_meter = max(settings.MAP_WIDTH, settings.MAP_HEIGHT) / 2786
    distance_meters = result["distance"] / pixel_per_meter
    time_seconds = (distance_meters / 1000) / speed * 3600

    return {
        "path": result["path"],
        "distance": round(distance_meters, 1),
        "nodes": result["nodes"],
        "time_seconds": round(time_seconds)
    }

@router.get("/nodes")
def get_nodes(vehicle: str = "foot"):
    service = get_pathfinding_service()
    nodes = service.graphs[vehicle]["nodes"]
    return [{"id": k, "x": v[0], "y": v[1]} for k, v in nodes.items()]