# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a FastAPI-based proxy gateway that sits between Claude Code and the Anthropic API. It logs all requests and responses to JSON files in the `logs/` directory for debugging and monitoring purposes.

## Architecture

- **Single-file application**: All logic is contained in `main.py`
- **Proxy pattern**: Forwards all HTTP methods to `https://api.anthropic.com`
- **Logging system**: Saves timestamped JSON files with request/response data
- **No error handling**: Per project requirements, no try/except blocks are used

## Key Components

- `proxy_request()`: Main FastAPI route handler that catches all paths
- `forward_request()`: aiohttp-based client for making upstream requests  
- `save_request_response()`: Logs interaction data to timestamped JSON files
- Header filtering for hop-by-hop headers (host, content-length, etc.)

## Development Commands

```bash
# Install dependencies
uv sync

# Run the server (default port 8000)
uv run python main.py

# Run with custom port
PORT=3000 uv run python main.py

# Format code
uv run ruff format .

# Lint code
uv run ruff check .
```

## Usage

Set the environment variable to use this gateway:
```bash
export ANTHROPIC_BASE_URL=http://localhost:8000
```

## Dependencies

- **FastAPI**: Web framework and request handling
- **aiohttp**: HTTP client for forwarding requests to Anthropic API
- **uvicorn**: ASGI server for running the application

## Logging Structure

Request/response logs are saved as JSON files in `logs/` directory with format:
```
claude_request_YYYY-MM-DDTHH-MM-SS_microseconds+timezone.json
```

Each log contains:
- `timestamp`: ISO format timestamp
- `request`: Method, path, headers, body
- `response`: Body and headers from Anthropic API
- `status_code`: HTTP status from upstream response