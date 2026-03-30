from fastapi import APIRouter, HTTPException, status
from backend.app.schemas.auth import LoginRequest, TokenResponse
from backend.app.services.auth import authenticate_user, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest):
    user = authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sai username hoặc password"
        )
    token = create_access_token({
        "sub": user["username"],
        "role": user["role"]
    })
    return TokenResponse(access_token=token)