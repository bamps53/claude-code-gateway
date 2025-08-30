# Claude Code Gateway - Project Overview

## Purpose
FastAPI proxy gateway for logging Claude Code ↔ Anthropic API requests. This application sits between Claude Code and the Anthropic API to log all request/response data to timestamped JSON files for debugging and monitoring purposes.

## Tech Stack
- **Language**: Python 3.11+
- **Web Framework**: FastAPI
- **HTTP Client**: aiohttp 
- **ASGI Server**: uvicorn
- **CLI Framework**: typer
- **Template Engine**: Jinja2
- **Package Manager**: uv (not pip/pip-tools)

## Key Dependencies
- `aiohttp>=3.12.15` - HTTP client for proxying requests
- `fastapi>=0.116.1` - Web framework
- `uvicorn>=0.35.0` - ASGI server
- `typer>=0.12.0` - CLI interface
- `jinja2>=3.1.4` - Template engine for web viewer

## Dev Dependencies
- `ruff>=0.12.11` - Linting and formatting
- `ipdb>=0.13.13` - Debugging
- `ipykernel>=6.30.1` - Jupyter kernel support

## Project Structure
```
claude-code-gateway/
├── main.py              # Main application file (all logic)
├── templates/
│   └── index.html       # Web viewer template
├── static/
│   ├── app.js          # Frontend JavaScript
│   └── style.css       # Styles
├── logs/               # Generated log files (user_id/session_id structure)
├── pyproject.toml      # Project config and dependencies
├── CLAUDE.md           # Project-specific coding rules
└── README.md           # Usage documentation
```

## Key Features
1. **Request Proxying**: Forwards all requests to Anthropic API
2. **Request Logging**: Saves request/response data as JSON files with timestamps
3. **Session Management**: Organizes logs by user_id and session_id
4. **Web Viewer**: Built-in log viewer at `/viewer` endpoint
5. **Duplicate Detection**: Removes duplicate conversation logs
6. **Session Limits**: Configurable max logs per session