"""Authentication: bcrypt password hashing, stateless JWT issuance, and the
role-based dependencies (`get_current_user`, `require_admin`) used by every
other router."""
import os
from datetime import datetime, timedelta, timezone

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

import models
import schemas

router = APIRouter(prefix="/api/auth", tags=["auth"])

# In production set JWT_SECRET in the environment; the fallback keeps local dev easy.
SECRET_KEY = os.environ.get("JWT_SECRET", "change-me-in-production-9f8a7b6c5d4e")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # one working day

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user: models.User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": str(user.id), "role": user.role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> models.User:
    """401 when the token is missing, invalid, expired, or the user is inactive."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated. Please sign in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = PydanticObjectId(payload.get("sub", ""))
    except (JWTError, ValueError):
        raise unauthorized
    user = await models.User.get(user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    """403 when a valid non-admin token tries an admin action."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required for this action.",
        )
    return user


async def write_audit(actor: models.User, action: str, detail: str) -> None:
    """Append an immutable audit entry."""
    await models.AuditLog(actor_id=actor.id, action=action, detail=detail).insert()


@router.post("/login", response_model=schemas.Token)
async def login(body: schemas.LoginRequest):
    user = await models.User.find_one(models.User.email == body.email.lower())
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )
    return schemas.Token(access_token=create_access_token(user))


@router.get("/me", response_model=schemas.UserOut)
async def me(user: models.User = Depends(get_current_user)):
    return user
