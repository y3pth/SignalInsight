# SignalInsight Repository Instructions

## Sources of truth

1. Actual Git state, source and test results.
2. `README.md` and `docs/` for product, architecture, contracts and release state.
3. `contracts/openapi.json` for the Python HTTP contract.
4. `site/` for the deployed Qoder Sites application.
5. Qoder auto-memory is machine-local and not authoritative.

## Start every Qoder session

```bash
git status --short --branch
git branch --show-current
git log -5 --oneline
```

Then read:

- `README.md`
- `docs/06-审计与交接.md`
- the task-specific docs under `docs/`

Never work directly on `main`. If the task is not already on a dedicated branch:

```bash
git switch main
git pull --ff-only
git switch -c feat/<task-id>-<short-name>
```

## Async collaboration

- One task = one branch = one owner.
- Do not share a branch between two people or two machines.
- Fetch and merge latest `main` into the branch before review; never force-push.
- Keep contract changes and implementation in separate reviewable commits when possible.
- Do not edit generated OpenAPI examples manually.
- Do not mark a task complete without tests and a real validation result.
- Qoder memory differences between machines are expected; repository docs are canonical.

## Current architecture

- `site/dist/`: deployed browser MVP.
- `site/functions/`: Qoder Sites Deno Function for Qwen explanation.
- `backend/`: partially implemented FastAPI product backend, not deployed.
- Python backend and browser JavaScript are two implementations; do not claim they share runtime code.

## Secrets and Qoder Sites

- Never place `DASHSCOPE_API_KEY`, Qoder tokens or database credentials in source, chat or command arguments.
- Configure application Secrets only through Qoder Sites Settings/Secrets or Qoder CLI `/sites`.
- Do not hand-edit `.SignalInsight.qoder.site`.
- Qoder Sites action/deployment records are host-local and do not transfer through Git.
- Use one designated release machine. Other machines may edit source and open PRs, but should not publish the existing action.
- Publishing from another machine requires a new preparation action under the same account and an explicit release task.

## Verification

Site:

```bash
node site/test/dsp.test.mjs
node site/test/function.test.mjs
```

Backend:

```bash
cd backend
uv sync --dev
uv run ruff check app tests scripts
uv run mypy app
uv run pytest
```

## Safety

- Do not delete unknown work, reset uncommitted changes or force-push.
- Do not present the browser MVP as the full Python backend.
- Do not promise an award without confirmed competition rules.
- Update `docs/06-审计与交接.md` when release state or blocking conditions change.
