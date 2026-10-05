"""FastAPI application: API routers plus the built React frontend."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import db as database
from .db import Base
from .routers import academics, auth, registration, staff
from .seed import seed

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

FRONTEND_DIST = os.getenv(
    "FRONTEND_DIST", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
)


def init_database() -> None:
    from . import models  # noqa: F401 - register tables

    Base.metadata.create_all(bind=database.engine)
    with database.SessionLocal() as session:
        seed(session)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_database()
    yield


app = FastAPI(title="SDU Intelligent Course Registration Assistant", version="1.0.0", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_handler(_: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
    message = first.get("msg", "Invalid request").removeprefix("Value error, ")
    return JSONResponse(status_code=422, content={"detail": f"{field}: {message}"})


@app.get("/api/health")
def health():
    return {"ok": True}


for module in (auth, registration, academics, staff):
    app.include_router(module.router)


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def api_not_found(path: str):
    raise HTTPException(404, f"Unknown API endpoint: /api/{path}")


if os.path.isdir(os.path.join(FRONTEND_DIST, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    """Serve files from the built frontend, falling back to index.html for client-side routes."""
    candidate = os.path.abspath(os.path.join(FRONTEND_DIST, path))
    if path and candidate.startswith(FRONTEND_DIST) and os.path.isfile(candidate):
        return FileResponse(candidate)
    index = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.isfile(index):
        return FileResponse(index, headers={"Cache-Control": "no-cache"})
    return JSONResponse(
        {"detail": "Frontend is not built. Run `npm install && npm run build` in the project root."}, status_code=503
    )
