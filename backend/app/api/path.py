from fastapi import APIRouter, HTTPException
from backend.app.services.pathfinding import get_pathfinding_service
from backend.app.database import get_db_connection

router = APIRouter(prefix="/api", tags=["path"])

@router.get("/route")
def find_route(
    start_lat: float, start_lon: float,
    goal_lat:  float, goal_lon:  float
):
    service = get_pathfinding_service()
    result  = service.find_path(start_lat, start_lon, goal_lat, goal_lon)

    if result is None:
        raise HTTPException(status_code=404, detail="Không tìm được đường đi")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        path_with_names = []
        for p in result["path"]:
            cursor.execute("SELECT name FROM stations WHERE id=?", (p["id"],))
            row = cursor.fetchone()
            path_with_names.append({
                "id":   p["id"],
                "name": row["name"] if row else "",
                "lat":  p["lat"],
                "lon":  p["lon"]
            })

    return {
        "path":     path_with_names,
        "distance": result["distance"],
        "nodes":    result["nodes"]
    }

@router.get("/stations")
def get_all_stations():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, name, lat, lon FROM stations ORDER BY name")
        rows = cursor.fetchall()
    return [{"id": r["id"], "name": r["name"], "lat": r["lat"], "lon": r["lon"]} for r in rows]

@router.get("/stations/search")
def search_stations(q: str = ""):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, lat, lon FROM stations WHERE name LIKE ? ORDER BY name LIMIT 10",
            (f"%{q}%",)
        )
        rows = cursor.fetchall()
    return [{"id": r["id"], "name": r["name"], "lat": r["lat"], "lon": r["lon"]} for r in rows]