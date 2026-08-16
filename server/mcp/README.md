# FinTrack MCP Server (Backend Module)

This module sits between `/api/chat/query` and Supabase. It turns an
arbitrary finance question into a validated, parameterized database query,
then narrates the result — instead of matching keywords to one of a few
fixed query shapes.

See `docs/mcp-pipeline-sketch.png` and `docs/mcp-pipeline-explained.txt` at
the repo root for the diagram and a plain-English walkthrough this module
implements.

## Pipeline

1. **Intent gate** (`intent.ts`) — cheap keyword check: is this worth
   sending to an LLM at all?
2. **Planner LLM** (`planner.ts`) — Gemini reads the question and returns a
   structured plan (`table`, `operation`, `filters`, ...), constrained at
   generation time by `financePlanResponseSchema`. Never SQL, never a user
   identity.
3. **Plan Validator** (`planSchema.ts` → `validatePlan`) — re-checks that
   plan against a strict zod schema (`financePlanSchema`). Any field outside
   the allowlist — including a stray `user_email` the model might invent —
   fails validation. A failed plan short-circuits straight to a "please
   rephrase" answer; the Executor and Narrator never run.
4. **Query Executor** (`executor.ts`) — runs exactly one parameterized
   Supabase query for the validated plan. `user_email` always comes from
   the verified auth context (`requireGoogleAuth`), never from the plan.
5. **Narrator LLM** (`narrator.ts`) — turns the real query result into a
   short natural-language answer. It sees the question and the result only
   — no DB access, no write access. Falls back to a deterministic sentence
   (`fallbackNarration`) if the LLM call itself fails.

`pipeline.ts` wires these four steps together as `runFinancePipeline`.

## Example request

```bash
curl -X POST http://localhost:3001/api/chat/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <google_id_token>" \
  -d '{
    "inputText": "How much did I spend on dining out last month?"
  }'
```

## Example response

```json
{
  "route": "mcp",
  "outcome": "answered",
  "answer": "You spent $187.40 on dining out last month, about 12% of your total spending.",
  "data": { "operation": "sum", "value": 187.4, "count": 6, "month": "2026-07", "filters": { "type": "expense", "category": "dining" } },
  "meta": { "plan": { "table": "transactions", "operation": "sum", "filters": { "type": "expense", "category": "dining", "month": "2026-07" } }, "sqlPreview": "..." }
}
```

## Example rejected-plan response

```json
{
  "route": "mcp",
  "outcome": "clarify",
  "answer": "I couldn't turn that into a query FinTrack understands. Try asking about a total, an average, a count, or your top spending categories for a specific month.",
  "meta": { "stage": "validator", "reason": "...", "rawPlan": { "...": "..." } }
}
```

## Extend the allowlist

The plan shape lives in one place: `planSchema.ts` (`financePlanSchema` for
validation, `financePlanResponseSchema` for the Planner LLM's structured
output — kept in lockstep by hand, since there are few enough fields to
audit both at once). To support a new operation or table:

1. Add it to `ALLOWED_TABLES` / `ALLOWED_OPERATIONS` / `ALLOWED_METRICS` in
   `planSchema.ts`, and extend `financePlanResponseSchema` to match.
2. Handle it in the relevant `execute*` function in `executor.ts`.
3. Mention it in the Planner's prompt (`planner.ts` → `buildPrompt`) so the
   model knows when to use it.

## Environment

- `GEMINI_API_KEY` (falls back to `VITE_GEMINI_API_KEY`) — used server-side
  for both the Planner and Narrator LLM calls.
- `GEMINI_MODEL` (falls back to `VITE_GEMINI_MODEL`, default
  `gemini-2.5-flash`).
- `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` — expected audience for the
  Google ID token verified by `requireGoogleAuth`.

## Token verification details

- Middleware: `server/middleware/requireGoogleAuth.ts`
- Verifies Google ID token through `https://oauth2.googleapis.com/tokeninfo`
- Validates audience, email present + verified, token not expired
- Injects trusted identity into the request (`req.authUser`); the pipeline
  uses `req.authUser.email` as `context.userEmail`

## Still open

- All tools stay read-only — no write/approval flow exists yet.
- No SQL is ever generated or executed from LLM output; the Executor's
  Supabase calls are hand-written and parameterized. If this ever moves to
  raw SQL generation, it needs a real SQL validator first.
- `financePlanSchema` and `financePlanResponseSchema` are maintained by hand
  in parallel; if they drift, the Planner could emit shapes the Validator
  then rejects. Worth a shared-source-of-truth pass later.
