# Task Completion Checklist

## Required Steps After Code Changes

### 1. Linting
```bash
# Run ruff linter to check code quality
uv run ruff check .

# Fix any linting issues automatically where possible
uv run ruff check --fix .
```

### 2. Formatting  
```bash
# Format code with ruff
uv run ruff format .
```

### 3. Testing
- **NO TESTING FRAMEWORK CONFIGURED** - No tests to run currently
- Consider adding tests if implementing significant new functionality

### 4. Manual Verification
```bash
# Test basic functionality by running the application
uv run python main.py

# Verify the application starts without errors
# Check that endpoints respond correctly
```

### 5. Project-Specific Rules Compliance
- Ensure no `try/except` blocks are used (per CLAUDE.md rules)
- Verify all errors are handled explicitly
- Confirm code is as simple as possible
- Check that only requested features are implemented (YAGNI)
- Ensure all commands use `uv` instead of direct `python`

### 6. Documentation Updates
- Update README.md if new CLI options or features are added
- Update docstrings following Google style if new functions are added

## Before Committing
1. Run `uv run ruff check .` - must pass without errors
2. Run `uv run ruff format .` - ensure consistent formatting
3. Manually test basic functionality
4. Verify compliance with project rules in CLAUDE.md

## CI/CD Notes
- No automated testing pipeline currently configured
- Manual verification is the primary quality gate