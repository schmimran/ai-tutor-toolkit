# scripts/

Out-of-band maintenance scripts for the AI Tutor.

## backfill-evaluations.ts

Runs the automated transcript evaluation against sessions that ended without a `session_evaluations` row. Use this after running with `AUTO_EVALUATE=false`, or to fill gaps caused by transient evaluation failures.

### What it writes

For each eligible session, the script:

- Fetches messages from Supabase.
- Calls `evaluateTranscript()` to score the transcript against the v7 rubric.
- Upserts a row into `session_evaluations`.
- Sets `sessions.evaluated = true`.

It does **not** send transcript emails. For the inline + admin-batched evaluation path (which does send emails), see the endpoints in [apps/api/src/routes/admin-evaluations.ts](../apps/api/src/routes/admin-evaluations.ts).

### Usage

From the repo root, with env vars loaded:

```bash
source env.sh
npm run backfill:evaluations
```

### Environment variables

The script reads `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `EVALUATION_MODEL` from the environment. For defaults and descriptions, see [CLAUDE.md](../CLAUDE.md#configsecrets-management).
