import json
import os
from datetime import datetime, timezone
from pathlib import Path

import aiohttp
import uvicorn
from fastapi import FastAPI, Request, Response


app = FastAPI(title="Claude Code Gateway", version="0.1.0")

# Create logs directory
LOGS_DIR = Path("logs")
LOGS_DIR.mkdir(exist_ok=True)

# Anthropic API base URL
ANTHROPIC_API_URL = "https://api.anthropic.com"


def save_request_response(request_data: dict, response_data: dict, status_code: int) -> None:
    """Save request and response data to JSON file with timestamp."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}.json"

    log_data = {
        "timestamp": timestamp,
        "request": request_data,
        "response": response_data,
        "status_code": status_code,
    }

    log_file = LOGS_DIR / filename
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(log_data, f, indent=2, ensure_ascii=False)


async def forward_request(method: str, path: str, headers: dict, body: bytes) -> tuple[dict, int]:
    """Forward request to Anthropic API using aiohttp."""
    url = f"{ANTHROPIC_API_URL}{path}"

    # Remove hop-by-hop headers
    filtered_headers = {
        k: v for k, v in headers.items() if k.lower() not in ["host", "content-length", "connection", "upgrade"]
    }

    async with aiohttp.ClientSession() as session:
        async with session.request(method=method, url=url, headers=filtered_headers, data=body) as response:
            response_body = await response.text()
            return {
                "body": response_body,
                "headers": dict(response.headers),
            }, response.status


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def proxy_request(request: Request, path: str):
    """Proxy all requests to Anthropic API and log them."""
    method = request.method
    headers = dict(request.headers)
    body = await request.body()

    # Prepare request data for logging
    request_data = {
        "method": method,
        "path": f"/{path}",
        "headers": headers,
        "body": body.decode("utf-8") if body else "",
    }

    # Forward request to Anthropic API
    response_data, status_code = await forward_request(method, f"/{path}", headers, body)

    # Save to JSON file
    save_request_response(request_data, response_data, status_code)

    # Return response
    return Response(
        content=response_data["body"],
        status_code=status_code,
        headers={
            k: v
            for k, v in response_data["headers"].items()
            if k.lower() not in ["content-length", "transfer-encoding"]
        },
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
