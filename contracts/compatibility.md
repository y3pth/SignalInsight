# API Contract Compatibility and Change Control

## Baseline

- API prefix: `/api/v1`
- Contract version: `1.0.0`
- JSON field names: `snake_case`
- IDs: UUID strings
- Timestamps: ISO 8601 UTC
- Frequencies: Hz; time: seconds; phase: radians; default amplitude unit: `a.u.`
- Unknown request fields and non-finite JSON numbers are rejected.

The contract specification and examples are generated from backend contract definitions. Do not edit generated files manually.

## Generate

Run from `backend/`:

```bash
uv run python -m app.contracts.generate
uv run python -m app.contracts.examples
```

`contracts/openapi.json` is the full integration contract. The runtime application exposes only implemented routes; unimplemented contract-only routes must not be presented as available runtime functionality.

## Compatible changes

With review, the following may be added without changing the meaning of existing clients:

- Optional response fields with explicit null semantics.
- New enum values only when clients are documented to handle unknown values safely.
- New endpoints, examples, error codes, and optional request fields with defaults.
- Additional evidence and artifacts that do not alter existing numerical meanings.

## Incompatible changes

The following require a new contract version or an explicitly reviewed migration:

- Renaming or deleting fields, endpoints, states, or enum values.
- Changing field types, units, phase references, sampling meanings, or null semantics.
- Changing metric formulas, model expressions, free-parameter counting, or reliability meanings.
- Changing success status codes, task state transitions, or error response structure.
- Making an optional request field required.

## Change record

Copy this block into the relevant change review:

```text
Change ID:
Task ID:
Proposer / writer / reviewer:
Baseline OpenAPI SHA:
Reason:
Field, state, or error changes:
Backward compatibility:
Unit, null, or numerical semantics impact:
Backend examples:
Frontend mock impact:
Migration strategy:
Approvals:
Merged SHA:
```

## Change log

### CCR-20261116-001

- Task: SI-P1-02.
- Writer: BE; reviewer: FE pending.
- Baseline: OpenAPI 1.0.0.
- Change: dataset upload flow responses.
  - `POST /datasets` response changed from `DatasetManifest` to new `DatasetUploadAccepted` because manifest variables and channels are produced by later parsing tasks.
  - `GET /datasets` response changed to new `DatasetSummaryListResponse`.
  - `GET /datasets/{id}` response changed to new `DatasetDetail`, which adds optional `manifest` for later parsed datasets.
- Compatibility: additive schemas; endpoints were contract-only and not yet consumed by FE.
- Contract version: bumped to 1.1.0.
- Examples: added dataset_summary, dataset_summary_list, dataset_upload_accepted, dataset_detail.
- Migration strategy: DB adds `datasets.upload_path` via migration 20261116_0002.

## Required review

1. BE updates contract definitions and generated artifacts.
2. FE reviews page states, null handling, units, errors, and mocks.
3. CI validates the OpenAPI document, operation coverage, examples, and generated-file freshness.
4. Runtime capability reporting must remain separate from the full target contract.
5. FE approval is still required before final `done`; backend-only verification does not complete this gate.
