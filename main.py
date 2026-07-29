"""Application entry point: wires routers, serves the SPA and uploads, connects
to MongoDB Atlas, and seeds a first admin account plus demo data on first run.

Run with:  uvicorn main:app --reload
"""
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import models
from database import init_db
from routers import admin, assets, auth, employee


async def seed() -> None:
    """Idempotent first-run seed: an admin, a demo employee, starter categories,
    the default theme, and two sample assets so the UI isn't empty."""
    if await models.User.find_all().first_or_none() is not None:
        return
    admin_user = models.User(
        email="admin@company.com",
        full_name="System Administrator",
        hashed_password=auth.hash_password("Admin@123"),
        role="admin",
    )
    employee_user = models.User(
        email="employee@company.com",
        full_name="Priya Sharma",
        hashed_password=auth.hash_password("Employee@123"),
        role="employee",
    )
    await admin_user.insert()
    await employee_user.insert()

    categories = {}
    for name in ["Laptop", "Monitor", "Phone", "Furniture", "Peripheral"]:
        category = models.Category(name=name)
        await category.insert()
        categories[name] = category

    await models.AppSetting(key="theme", value="indigo").insert()

    laptop = models.Asset(
        asset_tag="AST-0001",
        name='MacBook Pro 14"',
        category_id=categories["Laptop"].id,
        purchase_date=date.today() - timedelta(days=200),
        price=1999.00,
        vendor="Apple Store",
        warranty_expiry=date.today() + timedelta(days=165),
        status="assigned",
        assigned_to_id=employee_user.id,
    )
    monitor = models.Asset(
        asset_tag="AST-0002",
        name='Dell UltraSharp 27"',
        category_id=categories["Monitor"].id,
        purchase_date=date.today() - timedelta(days=500),
        price=449.00,
        vendor="Dell Direct",
        warranty_expiry=date.today() - timedelta(days=135),
        status="available",
    )
    await laptop.insert()
    await monitor.insert()

    await models.Assignment(
        asset_id=laptop.id, employee_id=employee_user.id, assigned_by_id=admin_user.id,
    ).insert()
    await models.AuditLog(
        actor_id=admin_user.id, action="system.seed",
        detail="Initial system setup: seeded default accounts, categories, and sample assets",
    ).insert()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed()
    yield


app = FastAPI(title="Asset Management System", lifespan=lifespan)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(admin.public_router)
app.include_router(assets.router)
app.include_router(employee.router)
app.include_router(employee.repairs_router)


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """API 404s stay JSON; any other unknown path falls back to the SPA so
    client-side routes survive a page refresh."""
    if request.url.path.startswith(("/api/", "/uploads/")):
        detail = getattr(exc, "detail", "Not found.")
        return JSONResponse(status_code=404, content={"detail": detail})
    return FileResponse("static/index.html")


Path("uploads").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/", StaticFiles(directory="static", html=True), name="static")
