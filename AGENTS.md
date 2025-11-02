# Repository Guidelines

## Project Structure & Module Organization
Keep Python packages inside `src/`, grouping each agent under `src/agents/<name>` and shared utilities in `src/shared/`. Place configuration files in `config/`, with prompts or datasets in `assets/`. Experiments or notebooks belong in `experiments/` and must include a README summarizing intent and results. Mirror the code layout in `tests/` so `tests/agents/test_<name>.py` aligns with its implementation. Automation scripts live in `scripts/` and should expose a `--help` flag.

## Build, Test, and Development Commands
Bootstrap a fresh checkout with `make setup`, which creates `.venv` and installs `requirements.txt`. Run `make lint` for `ruff check` and `black --check`, and `make fmt` when you need formatting fixes. `make test` executes the full pytest suite with coverage, while `make run` launches the default entry point in `src/main.py`. During focused debugging, call `pytest tests/agents/test_chat.py -k scenario_name`. Update the Makefile whenever a target name changes.

## Coding Style & Naming Conventions
Target Python 3.11+, four-space indentation, and comprehensive type hints. Modules use snake_case, classes use PascalCase, and only append `_async` when both sync and async variants exist. Keep docstrings for public functions that include non-obvious behavior or side effects. Co-locate prompt templates with the code that consumes them, and keep config defaults in `config/default.yaml`. Run `ruff` locally before pushing; unresolved warnings will block CI.

## Testing Guidelines
Write pytest cases alongside new features. Unit tests stay in `tests/agents/`, integration flows in `tests/integration/`, and reusable fixtures in `tests/conftest.py`. Name tests `test_<behavior>__<condition>` for clarity. Maintain at least 85% statement coverage, with additional focus on planner fallbacks and escalation paths. Capture regression cases immediately after incidents and link them in the corresponding PR.

## Commit & Pull Request Guidelines
Commit messages follow `type(scope): imperative summary`, for example `feat(router): support tool retries`. Keep logical changes together and squash fixups before opening a PR. Each PR must describe intent, highlight risk areas, link issue IDs, and attach screenshots or logs when user-visible output changes. Note follow-up tasks explicitly, and tag the agent operations team whenever execution semantics change.

## Agent Workflow Tips
Store environment-dependent secrets in `.env.local` (gitignored) and document required keys in `config/README.md`. Never commit API tokens; reference secret manager identifiers instead. Record experiments in `docs/changelog.md` with a short log covering inputs, prompts, and outcomes so the next agent can reproduce the run quickly.
