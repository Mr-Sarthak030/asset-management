"""MongoDB Atlas connection (Motor async client) and Beanie ODM initialization."""
import os

from beanie import init_beanie
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv()

MONGODB_URI = os.environ.get("MONGODB_URI")
if not MONGODB_URI or "<username>" in MONGODB_URI:
    raise RuntimeError(
        "MONGODB_URI is not set. Copy .env.example to .env and paste your MongoDB "
        "Atlas connection string into it (Atlas dashboard -> Database -> Connect -> "
        "Drivers -> Python)."
    )
DATABASE_NAME = os.environ.get("MONGODB_DB_NAME", "asset_management")

client = AsyncIOMotorClient(MONGODB_URI)
database = client[DATABASE_NAME]


async def init_db() -> None:
    """Register Beanie document models against the Atlas database. Called once on startup."""
    import models

    await init_beanie(
        database=database,
        document_models=[
            models.User,
            models.Category,
            models.Asset,
            models.CustomField,
            models.Assignment,
            models.RepairRequest,
            models.MaintenanceLog,
            models.AuditLog,
            models.AppSetting,
        ],
    )
