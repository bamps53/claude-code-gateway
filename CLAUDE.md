# CLAUDE.md

## Project Overview

This is a FastAPI-based proxy gateway that sits between Claude Code and the Anthropic API. It logs all requests and responses to JSON files in the `logs/` directory for debugging and monitoring purposes.

## Rules
- NEVER USE `try/except` blocks
- NEVER IGNORE UNEXPECTED INPUT, DATA, OR ERRORS, MUST IDENTIFY THE ROOT CAUSES
- KEEP THE CODE AS SIMPLE AS POSSIBLE
- NEVER IMPLEMENT ANYTHING THAT IS NOT EXPLICITLY REQUESTED, YOU AIN'T GONNA NEED IT
- USE `uv`, NEVER USE `python` COMMAND DIRECTLY