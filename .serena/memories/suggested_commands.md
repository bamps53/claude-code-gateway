# Suggested Commands

## Installation and Setup
```bash
# Install dependencies
uv sync

# Install development dependencies 
uv sync --dev
```

## Running the Application
```bash
# Run with default settings (port 8000, logs/ directory)
uv run python main.py

# Run with custom port
uv run python main.py --port 3000

# Run with custom log directory
uv run python main.py --log-dir /path/to/logs

# Run with custom max logs per session
uv run python main.py --max-logs-per-session 10

# Get help
uv run python main.py --help
```

## Configuration for Claude Code
```bash
# Set Claude Code to use this gateway
export ANTHROPIC_BASE_URL=http://localhost:8000
```

## Development Commands
```bash
# Check code with ruff linter
uv run ruff check .

# Format code with ruff
uv run ruff format .

# Debug with ipdb (if needed)
uv run ipdb script.py
```

## Log Management
- Logs are automatically saved to `logs/` directory (or custom directory)
- Log structure: `logs/user_id/timestamp_session_id/timestamp.json`
- Web viewer available at: `http://localhost:8000/viewer`

## Important Notes
- **NEVER** use `python` command directly - always use `uv run`
- No testing framework is currently configured
- The application runs on Linux system