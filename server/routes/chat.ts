import { Router, Request, Response } from "express";
import { z } from "zod";
import { createMcpServer, isFinanceIntent, pickFinanceTool } from "../mcp/server";
import { requireGoogleAuth, type AuthenticatedRequest } from "../middleware/requireGoogleAuth";

const chatRouter = Router();
const mcpServer = createMcpServer();
chatRouter.use(requireGoogleAuth);

const chatBodySchema = z.object({
  inputText: z.string().min(1),
  sessionId: z.string().optional(),
  month: z.string().regex(/^20\d{2}-\d{2}$/).optional(),
});

chatRouter.post("/query", async (req: Request, res: Response) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.flatten(),
    });
  }

  const { inputText, month } = parsed.data;
  const userEmail = (req as AuthenticatedRequest).authUser?.email;
  if (!userEmail) {
    return res.status(401).json({
      error: "Missing authenticated user context",
      details: "No verified user was attached by auth middleware.",
    });
  }

  try {
    if (!isFinanceIntent(inputText)) {
      return res.json({
        route: "direct-llm",
        answer:
          "This prompt does not look finance-specific, so it should continue through your regular AI chat path.",
        tool: null,
      });
    }

    const toolName = pickFinanceTool(inputText);
    const toolInput =
      toolName === "finance.monthly_summary"
        ? { month }
        : { question: inputText, month };

    const result = await mcpServer.execute(toolName, toolInput, {
      userEmail,
      now: new Date(),
    });

    return res.json({
      route: "mcp",
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
});

chatRouter.get("/tools", (_req: Request, res: Response) => {
  res.json({ tools: mcpServer.listTools() });
});

export { chatRouter };
