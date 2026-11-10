from fastapi import APIRouter, Depends, Request

from app.auth import CurrentUser, check_credentials, create_token, current_user
from app.errors import ApiError
from app.schemas import FinisherOut, LoginRequest, LoginResponse, MeResponse, UserOut

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/auth/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request):
    user = check_credentials(request.app.state.data_dir, body.username, body.password)
    if user is None:
        # One message for both cases: it does not say which part was wrong.
        raise ApiError(401, "invalid_credentials", "Wrong username or password.")
    return LoginResponse(
        token=create_token(user.id, request.app.state.secret),
        user=UserOut(id=user.id, username=user.username),
        finisher=FinisherOut(id=user.finisher_id, name=user.finisher_name),
    )


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser = Depends(current_user)):
    return MeResponse(
        user=UserOut(id=user.id, username=user.username),
        finisher=FinisherOut(id=user.finisher_id, name=user.finisher_name),
    )
