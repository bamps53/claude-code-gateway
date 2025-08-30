# Claude Code Gateway

FastAPI proxy gateway for logging Claude Code ↔ Anthropic API requests.

## Quick Start

```bash
# Install and run
uv sync
uv run python main.py

# Configure Claude Code
export ANTHROPIC_BASE_URL=http://localhost:8000
```

## CLI Options

```bash
# Custom port and log directory
uv run python main.py --port 3000 --log-dir /path/to/logs

# Help
uv run python main.py --help
```

## Logs

Request/response logs are saved as JSON files in `logs/` directory with format:
```
YYYYMMDD_HHMMSS.json
```

Each log contains:
- `timestamp`: ISO format timestamp
- `request`: Method, path, headers, body
- `response`: Body and headers from Anthropic API
- `status_code`: HTTP status code