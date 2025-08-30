import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import aiohttp
import typer
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates


app = FastAPI(title="Claude Code Gateway", version="0.1.0")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Anthropic API base URL
ANTHROPIC_API_URL = "https://api.anthropic.com"


def save_request_response(logs_dir: Path, request_data: dict, response_data: dict, status_code: int) -> None:
    """Save request and response data to JSON file with timestamp."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}.json"

    log_data = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request": request_data,
        "response": response_data,
        "status_code": status_code,
    }

    # Ensure logs directory exists
    logs_dir.mkdir(exist_ok=True)

    log_file = logs_dir / filename
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


@app.get("/viewer", include_in_schema=False)
async def read_root(request: Request):
    """Serve the main viewer HTML page."""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/viewer/api/logs", include_in_schema=False)
async def get_logs_list():
    """Get a list of all available log files, sorted by timestamp."""
    logs_dir = app.state.logs_dir
    if not logs_dir.exists():
        return []

    log_files = []
    for f in logs_dir.glob("*.json"):
        with open(f, "r", encoding="utf-8") as log_file:
            data = json.load(log_file)
            if ("timestamp" in data and 
                data.get("request", {}).get("path", "").startswith("/v1/") and
                data.get("request", {}).get("body", "")):
                log_files.append({"filename": f.name, "timestamp": data["timestamp"]})

    return sorted(log_files, key=lambda x: x["filename"], reverse=True)


@app.get("/viewer/api/logs/{filename}", include_in_schema=False)
async def get_log_content(filename: str):
    """Get the content of a specific log file, parsing JSON bodies."""
    log_file = app.state.logs_dir / filename
    if not log_file.exists():
        return Response(status_code=404, content="Log not found")

    with open(log_file, "r", encoding="utf-8") as f:
        log_data = json.load(f)

    if log_data.get("request", {}).get("body") and log_data["request"]["body"].startswith("{"):
        log_data["request"]["body"] = json.loads(log_data["request"]["body"])

    return log_data


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def proxy_request(request: Request, path: str):
    """Proxy all requests to Anthropic API and log them."""
    if path.startswith(("viewer", "static")):
        return Response(status_code=404)

    method = request.method
    headers = dict(request.headers)
    body = await request.body()
    request_data = {
        "method": method,
        "path": f"/{path}",
        "headers": headers,
        "body": body.decode("utf-8") if body else "",
    }
    response_data, status_code = await forward_request(method, f"/{path}", headers, body)
    save_request_response(app.state.logs_dir, request_data, response_data, status_code)
    return Response(
        content=response_data["body"],
        status_code=status_code,
        headers={
            k: v
            for k, v in response_data["headers"].items()
            if k.lower() not in ["content-length", "transfer-encoding"]
        },
    )


def main(
    port: Annotated[int, typer.Option("--port", "-p", help="Port to run the server on")] = 8000,
    log_dir: Annotated[str, typer.Option("--log-dir", "-l", help="Directory to save log files")] = "logs",
) -> None:
    """
    Claude Code Gateway - A FastAPI proxy server for logging Anthropic API requests.

    This gateway sits between Claude Code and the Anthropic API, logging all
    request/response data to timestamped JSON files for debugging and monitoring.
    """
    # Configure app state
    app.state.logs_dir = Path(log_dir)
    app.state.port = port

    typer.echo(f"🚀 Starting Claude Code Gateway on port {port}")
    typer.echo(f"📁 Logging to directory: {app.state.logs_dir.absolute()}")
    typer.echo(f"🔗 Proxying requests to: {ANTHROPIC_API_URL}")
    typer.echo("")
    typer.echo(f"🪵 Log Viewer available at: http://localhost:{port}/viewer")
    typer.echo("")
    typer.echo("Configure Claude Code with:")
    typer.echo(f"export ANTHROPIC_BASE_URL=http://localhost:{port}")

    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    ctx_settings = {"help_option_names": ["-h", "--help"]}
    app_typer = typer.Typer(context_settings=ctx_settings)
    app_typer.command()(main)
    app_typer()
