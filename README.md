# Claude Code Gateway

A FastAPI-based proxy gateway that sits between Claude Code and the Anthropic API, providing request/response logging for debugging and monitoring purposes.

## Overview

This lightweight proxy server forwards all HTTP requests to the Anthropic API while capturing detailed logs of each interaction. All request/response data is saved as timestamped JSON files in the `logs/` directory.

## Quick Start

1. Install dependencies:
```bash
uv sync
```

2. Run the server:
```bash
uv run python main.py
```

3. Configure Claude Code to use the gateway:
```bash
export ANTHROPIC_BASE_URL=http://localhost:8000
```

## Configuration

The server runs on port 8000 by default. To use a different port:
```bash
PORT=3000 uv run python main.py
```

## Architecture

- **Single-file application**: All logic contained in `main.py`
- **Proxy pattern**: Forwards all HTTP methods to `https://api.anthropic.com`
- **Logging system**: Saves timestamped JSON files with complete request/response data
- **Header filtering**: Removes hop-by-hop headers (host, content-length, etc.)

## Logging

Logs are saved in `logs/` directory with the format:
```
claude_request_YYYY-MM-DDTHH-MM-SS_microseconds+timezone.json
```

Each log file contains:
- `timestamp`: ISO format timestamp
- `request`: Complete request data (method, path, headers, body)
- `response`: Full response from Anthropic API (body and headers)
- `status_code`: HTTP status code from upstream response

## Development

```bash
# Format code
uv run ruff format .

# Lint code
uv run ruff check .
```

## Dependencies

- **FastAPI**: Web framework and request handling
- **aiohttp**: HTTP client for upstream requests
- **uvicorn**: ASGI server