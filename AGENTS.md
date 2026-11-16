# SignalInsight Repository Instructions

## Read first

1. `HANDOFF.md` — current authoritative handoff.
2. `README.md` — current deliverable and commands.
3. `立项确定书.md` — original motivation and research background only.

The old Python backend and full-platform design were intentionally removed. Do not recreate or reference them unless the user explicitly changes direction again.

## Current source of truth

- `site/dist/`: deployed browser application.
- `site/functions/`: deployed Qoder Sites Edge Function.
- `site/.SignalInsight.qoder.site`: generated publication descriptor; never hand-edit.
- `site/test/`: required regression tests for deployed code.
- Git state and actual test results override all prose.

## Session start

```bash
git status --short --branch
git branch --show-current
git log -5 --oneline
```

Do not work directly on `main`. Use a dedicated branch for each task.

## Rules

- Never place API keys, Qoder tokens or user data in source, chat or command arguments.
- Configure `DASHSCOPE_API_KEY` only through Qoder Sites Settings/Secrets or Qoder CLI `/sites`.
- Qoder Sites action records are host-local. Use one release machine; do not reuse an old action from another machine.
- Do not publish descriptions that imply Python backend deployment or award guarantees.
- Do not delete unknown work, force-push or rewrite history.
- Run `node site/test/dsp.test.mjs` and `node site/test/function.test.mjs` after changing analysis or Function behavior.
- Update `HANDOFF.md` when release state, blocking conditions or direction changes.
