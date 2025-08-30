# Claude Code Gateway

FastAPI proxy gateway for logging Claude Code ↔ Anthropic API requests.

## Quick Start

```bash
# Install and run
uv sync
uv run main.py

# Configure Claude Code
export ANTHROPIC_BASE_URL=http://localhost:8000
```

## CLI Options

```bash
# Custom port and log directory
uv run main.py --port 3000 --log-dir /path/to/logs

# Enable CLAUDE.md prompt modification (enforces strict adherence to CLAUDE.md instructions)
uv run main.py --modify-prompt

# All options
uv run main.py --port 3000 --log-dir /path/to/logs --max-logs-per-session 10 --modify-prompt

# Help
uv run main.py --help
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