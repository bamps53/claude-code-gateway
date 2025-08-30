# Code Style and Conventions

## Project Rules (from CLAUDE.md)
- **NEVER USE `try/except` blocks** - All errors must be handled explicitly
- **NEVER IGNORE UNEXPECTED INPUT, DATA, OR ERRORS** - Must identify root causes
- **KEEP THE CODE AS SIMPLE AS POSSIBLE** - No unnecessary complexity
- **NEVER IMPLEMENT ANYTHING NOT EXPLICITLY REQUESTED** - YAGNI principle
- **USE `uv`, NEVER USE `python` COMMAND DIRECTLY** - Always `uv run python`

## Python Style
- **Python Version**: 3.11+ required
- **Type Hints**: Used throughout the codebase (`from typing import Annotated`)
- **Function Names**: snake_case convention
- **Variable Names**: snake_case convention
- **Constants**: UPPER_CASE (e.g., `ANTHROPIC_API_URL`)

## Ruff Configuration
- **Target Version**: py310
- **Line Length**: 120 characters
- **Indent Width**: 4 spaces
- **Output Format**: grouped
- **Lint Rules**: E (pycodestyle errors) and F (pyflakes) selected
- **Ignored**: E501 (line too long - handled by line-length setting)
- **Docstring Convention**: Google style

## Code Structure
- **Single File Architecture**: All logic in `main.py` (388 lines)
- **Function Organization**: Utility functions first, then route handlers, then main()
- **Import Style**: Standard library first, then third-party, then local
- **Error Handling**: Direct handling without try/except blocks per project rules

## Documentation
- **Docstrings**: Google style convention (minimal usage in current code)
- **Comments**: Inline comments for complex logic
- **Function Docs**: Brief description of purpose and parameters/returns

## FastAPI Patterns
- **Route Decorators**: Using `@app.get()`, `@app.api_route()` patterns
- **Async Functions**: All route handlers are async
- **Type Annotations**: Extensive use of Typer's `Annotated` for CLI parameters
- **Response Handling**: Direct `Response` objects for custom headers/status codes