from fastapi import APIRouter, Depends
from backend.app.schemas.scenario import ScenarioRequest, ScenarioResponse
from backend.app.services.scenario import get_scenario_service
from backend.app.dependencies.access_control import require_admin

router = APIRouter(prefix="/api", tags=["scenarios"])

@router.post("/scenarios", response_model=ScenarioResponse)
def add_scenario(request: ScenarioRequest, _=Depends(require_admin)):
    service = get_scenario_service()
    scenario = service.add_scenario(
        scenario_type=request.type,
        penalty=request.penalty,
        line_p1=request.line_p1,
        line_p2=request.line_p2,
        threshold=request.threshold
    )
    total = sum(len(v) for v in scenario["affected_edges"].values())
    return ScenarioResponse(
        id=scenario["id"],
        type=scenario["type"],
        penalty=scenario["penalty"],
        affected_edges_count=total
    )

@router.get("/scenarios")
def get_scenarios(_=Depends(require_admin)):
    service = get_scenario_service()
    return [
        {
            "id": s["id"],
            "type": s["type"],
            "penalty": s["penalty"],
            "line_p1": s["line_p1"],
            "line_p2": s["line_p2"],
            "threshold": s["threshold"]
        }
        for s in service.active_scenarios
    ]

@router.delete("/scenarios")
def clear_scenarios(_=Depends(require_admin)):
    service = get_scenario_service()
    service.clear_all()
    return {"message": "Đã xóa tất cả kịch bản"}

@router.delete("/scenarios/{scenario_id}")
def delete_scenario(scenario_id: int, _=Depends(require_admin)):
    service = get_scenario_service()
    service.remove_scenario(scenario_id)
    return {"message": f"Đã xóa kịch bản {scenario_id}"}