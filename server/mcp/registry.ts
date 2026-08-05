import type {
  McpExecutionContext,
  McpExecutionResponse,
  McpTool,
} from "./types";

export class McpToolRegistry {
  private readonly tools = new Map<string, McpTool<unknown>>();

  register<TInput>(tool: McpTool<TInput>) {
    if (this.tools.has(tool.name)) {
      throw new Error(`MCP tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool as McpTool<unknown>);
  }

  listTools() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
    }));
  }

  async execute(toolName: string, rawInput: unknown, context: McpExecutionContext): Promise<McpExecutionResponse> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Unknown MCP tool: ${toolName}`);
    }

    const input = tool.inputSchema.parse(rawInput);
    const result = await tool.execute(input, context);
    return { ...result, tool: tool.name };
  }
}
