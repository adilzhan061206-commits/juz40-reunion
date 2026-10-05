"""Start the API server: ``python run.py`` (use ``--reload`` during development)."""

import os
import sys

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        reload="--reload" in sys.argv,
        proxy_headers=True,
    )
