import os
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH, override=True)

print("ENV file exists:", ENV_PATH.is_file())
print("NEO4J_URI loaded:", bool(os.getenv("NEO4J_URI")))
print("QDRANT_URL loaded:", bool(os.getenv("QDRANT_URL")))

# pyrefly: ignore [missing-import]
from fastapi import FastAPI
# pyrefly: ignore [missing-import]
from neo4j import AsyncGraphDatabase
# pyrefly: ignore [missing-import]
from qdrant_client import AsyncQdrantClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.neo4j = AsyncGraphDatabase.driver(
        os.environ["NEO4J_URI"],
        auth=(
            os.environ["NEO4J_USERNAME"],
            os.environ["NEO4J_PASSWORD"],
        ),
    )

    app.state.qdrant = AsyncQdrantClient(
        url=os.environ["QDRANT_URL"],
        api_key=os.environ["QDRANT_API_KEY"],
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
        "health": "/api/health"
    }

@app.get("/api/health")
async def health():
    return {"status": "ok", "project": "DevGraph"}



@app.get("/api/db-check")
async def db_check():
    result = {}

    try:
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
