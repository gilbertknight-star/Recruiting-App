import os
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from db import supabase, DEV_MODE

security = HTTPBearer(auto_error=not DEV_MODE)


class DevUser:
    id = "dev-user"
    email = os.getenv("ADMIN_EMAIL", "dev@dev.com")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if DEV_MODE:
        return DevUser()
    try:
        response = supabase.auth.get_user(credentials.credentials)
        if not response or not response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return response.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_admin(user=Depends(get_current_user)):
    if DEV_MODE:
        return user
    admin_email = os.getenv("ADMIN_EMAIL", "")
    if user.email != admin_email:
        raise HTTPException(status_code=403, detail="Admin only")
    return user
