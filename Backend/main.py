from contextlib import asynccontextmanager
from pathlib import Path

from app.config import configure_tls, get_settings
from fastapi import FastAPI
from neo4j import AsyncGraphDatabase
from qdrant_client import AsyncQdrantClient

ENV_PATH = Path(__file__).resolve().parent / ".env"


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_tls()
    settings = get_settings()

    print("ENV file exists:", ENV_PATH.is_file())
    print("NEO4J_URI loaded:", bool(settings.NEO4J_URI))
    print("QDRANT_URL loaded:", bool(settings.QDRANT_URL))

    app.state.neo4j = AsyncGraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(
            settings.NEO4J_USERNAME,
            settings.NEO4J_PASSWORD.get_secret_value(),
        ),
    )

    app.state.qdrant = AsyncQdrantClient(
        url=settings.QDRANT_URL,
        api_key=settings.QDRANT_API_KEY.get_secret_value(),
    )

    yield

    await app.state.neo4j.close()
    await app.state.qdrant.close()


app = FastAPI(title="DevGraph API", lifespan=lifespan)


@app.get("/")
async def root():
    return {
        "message": "Welcome to DevGraph API",
        "docs": "/docs",
        "health": "/api/health",
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "project": "DevGraph"}


@app.get("/api/db-check")
async def db_check():
    result = {}
    settings = get_settings()

    try:
        if settings.NEO4J_DATABASE:
            async with app.state.neo4j.session(
                database=settings.NEO4J_DATABASE
            ) as session:
                await session.run("RETURN 1")
        else:
            await app.state.neo4j.verify_connectivity()
        result["neo4j"] = "connected"
    except Exception as e:
        print("NEO4J ERROR:", repr(e))
        result["neo4j"] = "connection failed"

    try:
        await app.state.qdrant.get_collections()
        result["qdrant"] = "connected"
    except Exception as e:
        print("QDRANT ERROR:", repr(e))
        result["qdrant"] = "connection failed"

    return result

