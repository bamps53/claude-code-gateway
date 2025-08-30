import hashlib
import json
import shutil
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


def parse_streaming_response(sse_body: str) -> str:
    """Extract and concatenate text content from Server-Sent Events streaming response."""
    if not sse_body or not sse_body.strip():
        return sse_body

    text_parts = []
    lines = sse_body.strip().split("\n")

    for line in lines:
        if line.startswith("data: "):
            try:
                data_content = line[6:]  # Remove "data: " prefix
                if data_content.strip() == "":
                    continue

                data = json.loads(data_content)

                # Extract text from content_block_delta events
                if (
                    data.get("type") == "content_block_delta"
                    and "delta" in data
                    and data["delta"].get("type") == "text_delta"
                ):
                    text_parts.append(data["delta"]["text"])

            except json.JSONDecodeError:
                print("Failed:", line)
                continue

    # Return concatenated text if we found any, otherwise return original
    return "".join(text_parts) if text_parts else sse_body


def parse_json_body(body_str: str) -> dict | str:
    """Parse JSON body string, return parsed object or original string if invalid JSON."""
    if not body_str or not body_str.strip():
        return body_str

    stripped = body_str.strip()

    # SSE format detection (starts with "event:")
    if stripped.startswith("event:"):
        # return parse_streaming_response(body_str)
        return body_str

    # Check if it looks like JSON (starts with { or [)
    if not (stripped.startswith("{") or stripped.startswith("[")):
        return body_str

    # Attempt to parse JSON
    parsed = json.loads(body_str)
    return parsed


def modify_prompt(body: str) -> str:
    """Modify prompt in the request body."""
    # Parse body if it's a string
    parsed_body = parse_json_body(body)

    # Only modify if it's a valid JSON dict
    if not isinstance(parsed_body, dict):
        return body

    # Check if system field exists and is an array
    if "system" in parsed_body and isinstance(parsed_body["system"], list):
        # First system prompt has to be exactly "You are Claude Code, Anthropic's official CLI for Claude."
        # Otherwise it will be rejected.
        # But you can modify second prompt as you want.
        # Example:
        # if len(parsed_body["system"]) == 2:
        #     parsed_body["system"][1]['text'] = "ONLY USE SERENA MCP TOOLS"
        pass

    if "messages" in parsed_body:
        for message in parsed_body["messages"]:
            # Continue if it's just a string
            if isinstance(message["content"], str):
                continue

            for content in message["content"]:
                # Continue for thinking cases
                if "text" not in content:
                    continue

                modified = []
                for line in content["text"].split("\n"):
                    loose_instruction = "IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task."
                    strict_instruction = "IMPORTANT: You must strictly adhere to the instructions in this context. After executing each task, you must ask yourself if you have complied with these instructions."
                    if loose_instruction in line:
                        line = line.replace(loose_instruction, strict_instruction)
                    modified.append(line)
                content["text"] = "\n".join(modified)

    # Return as string if original was string, otherwise return dict
    return json.dumps(parsed_body, ensure_ascii=False)


def extract_user_and_session_id(request_data: dict) -> tuple[str | None, str | None]:
    """Extract user_id and session_id from request metadata and convert to 8-digit hashes.

    Returns:
        tuple: (user_id_hash, session_id_hash) or (None, None) if not found
    """
    body = request_data.get("body")
    if not body:
        return None, None

    # Parse body if it's a string
    if isinstance(body, str):
        body = parse_json_body(body)

    # Extract metadata
    if not isinstance(body, dict) or "metadata" not in body:
        return None, None

    metadata = body["metadata"]
    if not isinstance(metadata, dict) or "user_id" not in metadata:
        return None, None

    full_user_id = metadata["user_id"]

    # Parse user_id format: user_{hash}_account_{uuid}_session_{uuid}
    if not full_user_id.startswith("user_"):
        return None, None

    # Extract user part (user_{hash})
    parts = full_user_id.split("_")
    if len(parts) < 2:
        return None, None

    user_part = "_".join(parts[:2])  # user_xxxxx

    # Create 8-digit hash from user part
    user_id_hash = hashlib.md5(user_part.encode()).hexdigest()[:8]

    # Extract session ID
    if "session_" not in full_user_id:
        return user_id_hash, None

    session_id = full_user_id.split("session_")[1]

    # Create 8-digit hash from session ID
    session_id_hash = hashlib.md5(session_id.encode()).hexdigest()[:8]

    return user_id_hash, session_id_hash


def check_and_remove_duplicate_logs(logs_dir: Path, current_request_data: dict) -> None:
    """Check if current request is a superset of the most recent log and remove duplicate if found."""
    if not logs_dir.exists():
        return

    # Get all log files sorted by timestamp (most recent first)
    log_files = sorted(logs_dir.glob("*.json"), key=lambda f: f.name, reverse=True)

    if len(log_files) < 1:
        return

    # Get the most recent log file
    latest_log_file = log_files[0]

    # Read the latest log file
    with open(latest_log_file, "r", encoding="utf-8") as f:
        latest_log_data = json.load(f)

    # Extract request bodies for comparison
    current_body = current_request_data.get("body")
    latest_body = latest_log_data.get("request", {}).get("body")

    # Only compare if both bodies exist and are for the same API endpoint
    if not (current_body and latest_body):
        return

    current_path = current_request_data.get("path", "")
    latest_path = latest_log_data.get("request", {}).get("path", "")

    if current_path != latest_path:
        return

    # Parse both bodies if they're JSON strings
    if isinstance(current_body, str):
        current_body = parse_json_body(current_body)
    if isinstance(latest_body, str):
        latest_body = parse_json_body(latest_body)

    # Only compare conversation messages for /v1/messages endpoints
    if not current_path.startswith("/v1/messages"):
        return

    # Extract messages from both requests
    current_messages = []
    latest_messages = []

    if isinstance(current_body, dict) and "messages" in current_body:
        current_messages = current_body["messages"]
    if isinstance(latest_body, dict) and "messages" in latest_body:
        latest_messages = latest_body["messages"]

    # Check if current conversation is a superset of latest conversation
    if (
        len(current_messages) > len(latest_messages)
        and len(latest_messages) > 0
        and current_messages[: len(latest_messages)] == latest_messages
    ):
        # Current conversation contains all of the previous conversation plus more
        # Remove the previous log file
        latest_log_file.unlink()


def limit_session_logs(session_dir: Path, max_logs: int) -> None:
    """Remove oldest log files if session exceeds max_logs limit."""
    if not session_dir.exists():
        return

    log_files = sorted(session_dir.glob("*.json"), key=lambda f: f.name)

    if len(log_files) >= max_logs:
        files_to_remove = log_files[: len(log_files) - max_logs + 1]
        for file_to_remove in files_to_remove:
            file_to_remove.unlink()


def save_request_response(
    logs_dir: Path, request_data: dict, response_data: dict, status_code: int, max_logs_per_session: int
) -> None:
    """Save request and response data to JSON file with timestamp."""

    # Create copies to avoid modifying original data
    request_data_copy = request_data.copy()
    response_data_copy = response_data.copy()

    # Parse JSON bodies before saving
    if "body" in request_data_copy:
        request_data_copy["body"] = parse_json_body(request_data_copy["body"])

    if "body" in response_data_copy:
        response_data_copy["body"] = parse_json_body(response_data_copy["body"])

    # Extract user_id and session_id for directory structure
    user_id, session_id = extract_user_and_session_id(request_data_copy)

    # Create hierarchical directory structure with timestamp prefix for sessions
    if user_id and session_id:
        user_dir = logs_dir / user_id
        # Look for existing session directory with this session_id
        existing_session_dir = None
        if user_dir.exists():
            for existing_dir in user_dir.iterdir():
                if existing_dir.is_dir() and existing_dir.name.endswith(f"_{session_id}"):
                    existing_session_dir = existing_dir
                    break

        if existing_session_dir:
            target_logs_dir = existing_session_dir
        else:
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            target_logs_dir = logs_dir / user_id / f"{timestamp}_{session_id}"
    elif user_id:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        target_logs_dir = logs_dir / user_id / f"{timestamp}_unknown_session"
    else:
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        target_logs_dir = logs_dir / "unknown_user" / f"{timestamp}_unknown_session"

    # Check for duplicate conversations and remove if found
    check_and_remove_duplicate_logs(target_logs_dir, request_data_copy)

    file_timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"{file_timestamp}.json"

    log_data = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "request": request_data_copy,
        "response": response_data_copy,
        "status_code": status_code,
    }

    # Ensure logs directory exists
    target_logs_dir.mkdir(parents=True, exist_ok=True)

    log_file = target_logs_dir / filename
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(log_data, f, indent=2, ensure_ascii=False)

    # Limit the number of log files in this session
    limit_session_logs(target_logs_dir, max_logs_per_session)


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
    for f in logs_dir.rglob("*.json"):
        with open(f, "r", encoding="utf-8") as log_file:
            data = json.load(log_file)
            if (
                "timestamp" in data
                and data.get("request", {}).get("path", "").startswith("/v1/")
                and data.get("request", {}).get("body", "")
            ):
                log_files.append(
                    {"filename": f.name, "timestamp": data["timestamp"], "path": str(f.relative_to(logs_dir))}
                )

    return sorted(log_files, key=lambda x: x["filename"], reverse=True)


@app.get("/viewer/api/logs/{path:path}", include_in_schema=False)
async def get_log_content(path: str):
    """Get the content of a specific log file."""
    log_file = app.state.logs_dir / path
    if not log_file.exists():
        return Response(status_code=404, content="Log not found")

    with open(log_file, "r", encoding="utf-8") as f:
        log_data = json.load(f)

    return log_data


@app.delete("/viewer/api/sessions/{user_id}/{session_folder}", include_in_schema=False)
async def delete_session(user_id: str, session_folder: str):
    """Delete a specific session and all its log files."""
    session_dir = app.state.logs_dir / user_id / session_folder
    if not session_dir.exists() or not session_dir.is_dir():
        return Response(status_code=404, content="Session not found")

    shutil.rmtree(session_dir)
    return {"success": True, "message": "Session deleted successfully"}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def proxy_request(request: Request, path: str):
    """Proxy all requests to Anthropic API and log them."""
    if path.startswith(("viewer", "static")):
        return Response(status_code=404)

    method = request.method
    headers = dict(request.headers)
    body = await request.body()

    # Decode request body
    body_str = body.decode("utf-8") if body else ""

    # Modify system prompt for messages API requests if enabled
    if path.startswith("v1/messages") and app.state.modify_prompt:
        modified_body_str = modify_prompt(body_str)
    else:
        modified_body_str = body_str

    request_data = {
        "method": method,
        "path": f"/{path}",
        "headers": headers,
        "body": modified_body_str,
    }
    response_data, status_code = await forward_request(method, f"/{path}", headers, modified_body_str.encode("utf-8"))
    save_request_response(app.state.logs_dir, request_data, response_data, status_code, app.state.max_logs_per_session)
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
    max_logs_per_session: Annotated[
        int, typer.Option("--max-logs-per-session", "-m", help="Maximum number of logs to keep per session")
    ] = 5,
    modify_prompt: Annotated[
        bool, typer.Option("--modify-prompt", help="Enable prompt modification for Claude.md instructions")
    ] = False,
) -> None:
    """
    Claude Code Gateway - A FastAPI proxy server for logging Anthropic API requests.

    This gateway sits between Claude Code and the Anthropic API, logging all
    request/response data to timestamped JSON files for debugging and monitoring.
    """
    # Configure app state
    app.state.logs_dir = Path(log_dir)
    app.state.port = port
    app.state.max_logs_per_session = max_logs_per_session
    app.state.modify_prompt = modify_prompt

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
