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

Request/response logs are organized in a hierarchical directory structure:
```
logs/
├── {user_id_hash}/
│   └── {timestamp}_{session_id_hash}/
│       ├── YYYYMMDD_HHMMSS.json
│       └── YYYYMMDD_HHMMSS.json
└── unknown_user/
    └── {timestamp}_unknown_session/
        └── YYYYMMDD_HHMMSS.json
```

Features:
- **Hierarchical organization**: Logs grouped by 8-digit hashed user ID and session ID
- **Duplicate removal**: Automatically removes duplicate conversations within the same session
- **Session limits**: Configurable maximum logs per session (default: 5)
- **Log viewer**: Web interface at `http://localhost:8000/viewer`

Each log file contains:
- `timestamp`: ISO format timestamp
- `request`: Method, path, headers, body (with JSON parsing)
- `response`: Body and headers from Anthropic API (with JSON parsing)
- `status_code`: HTTP status code