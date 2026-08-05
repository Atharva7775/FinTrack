# FinTrack MCP Server (Backend Module)

This module adds an MCP-style tool layer between chat input and Supabase queries.

## What is implemented

- Tool registry with pluggable tool contracts
- Finance intent routing helper
- Two initial tools:
  - `finance.text_to_sql`
  - `finance.monthly_summary`
- Chat route integration:
  - `POST /api/chat/query`
  - `GET /api/chat/tools`

## Current flow

1. Client sends a prompt to `POST /api/chat/query`
2. Route validates input
3. Route verifies a Google ID token and derives trusted user identity from it
4. If prompt is finance-related, it picks an MCP tool and executes it
4. Tool queries Supabase with per-user filters (`user_email`)
5. Route returns answer + tool metadata

## Example request

```bash
curl -X POST http://localhost:3001/api/chat/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <google_id_token>" \
  -d '{
    "inputText": "How much did I spend this month?"
  }'
```

## Example response (finance route)

```json
{
  "route": "mcp",
  "tool": "finance.text_to_sql",
  "answer": "Your total spending for 2026-08 is $420.00.",
  "data": {
    "month": "2026-08",
    "total": 420,
    "type": "expense"
  },
  "meta": {
    "plan": "sum_expense",
    "sql": "SELECT COALESCE(SUM(amount), 0) AS total ..."
  }
}
```

## Add a new MCP tool

1. Create a tool file under `server/mcp/tools/`
2. Export a `McpTool` object with:
   - `name`
   - `description`
   - `inputSchema` (zod)
   - `execute(input, context)`
3. Register it in `server/mcp/server.ts`
4. Update tool selection logic if needed

## Important security TODO

- Enforce this auth middleware for all MCP-sensitive routes.
- Keep tools read-only unless explicit approval flow is added for writes.
- Add SQL validator if you move from query-builder plans to raw SQL execution.

## Prompt safety model

- User text is treated as question only.
- User email is injected from trusted server context (`context.userEmail`).
- SQL prompt includes a hard rule to use `user_email = :user_email`.
- Any email-like string inside user question is redacted before SQL prompt generation.

## Token verification details

- Middleware: `server/middleware/requireGoogleAuth.ts`
- Verifies Google ID token through `https://oauth2.googleapis.com/tokeninfo`
- Validates:
  - audience (`GOOGLE_CLIENT_ID` or `VITE_GOOGLE_CLIENT_ID`)
  - email present + verified
  - token not expired
- Injects trusted identity into request (`req.authUser`), and MCP uses `req.authUser.email`.
