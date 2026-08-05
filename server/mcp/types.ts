import { z } from "zod";

export interface McpExecutionContext {
  userEmail: string;
  now: Date;
}

export interface McpToolResult {
  answer: string;
  data?: unknown;
  meta?: Record<string, unknown>;
}

export interface McpTool<TInput = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  execute: (input: TInput, context: McpExecutionContext) => Promise<McpToolResult>;
}

export interface McpExecutionResponse extends McpToolResult {
  tool: string;
}
