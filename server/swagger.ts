import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "FinTrack API",
      version: "1.0.0",
      description:
        "REST API wrapper around Supabase for debugging and testing every FinTrack feature. Pass `user_email` to scope all queries to a single user.",
    },
    servers: [{ url: "http://localhost:3001", description: "Local dev server" }],
    components: {
      parameters: {
        userEmail: {
          in: "query",
          name: "user_email",
          required: true,
          schema: { type: "string", example: "you@example.com" },
          description: "The authenticated user's email address",
        },
      },
      schemas: {
        Transaction: {
          type: "object",
          required: ["id", "type", "amount", "category", "date"],
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: ["income", "expense"] },
            amount: { type: "number", minimum: 0 },
            category: {
              type: "string",
              enum: [
                "Salary","Freelance","Investments","Other Income",
                "Rent","Food","Travel","Subscriptions","Shopping",
                "Utilities","Healthcare","Entertainment","Education","Savings","Other",
              ],
            },
            date: { type: "string", format: "date", example: "2026-04-01" },
            note: { type: "string", default: "" },
            is_splitwise: { type: "boolean", default: false },
            splitwise_id: { type: "integer", nullable: true },
            original_currency: { type: "string", nullable: true },
            original_amount: { type: "number", nullable: true },
            usd_amount: { type: "number", nullable: true },
            is_pending: { type: "boolean", default: false },
          },
        },
        Goal: {
          type: "object",
          required: ["id", "title", "target_amount", "current_amount", "deadline", "monthly_contribution"],
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            target_amount: { type: "number", minimum: 0 },
            current_amount: { type: "number", minimum: 0 },
            deadline: { type: "string", format: "date" },
            monthly_contribution: { type: "number", minimum: 0 },
          },
        },
        GoalContribution: {
          type: "object",
          required: ["goal_id", "amount", "date"],
          properties: {
            goal_id: { type: "string" },
            amount: { type: "number", minimum: 0 },
            date: { type: "string", format: "date" },
          },
        },
        Budget: {
          type: "object",
          required: ["id", "category", "month", "type"],
          properties: {
            id: { type: "string", format: "uuid" },
            category: { type: "string" },
            month: { type: "string", pattern: "^\\d{4}-\\d{2}$", example: "2026-04" },
            type: { type: "string", enum: ["percentage", "fixed"] },
            percentage: { type: "number", nullable: true },
            fixed_amount: { type: "number", nullable: true },
            rollover_balance: { type: "number", default: 0 },
            alert_threshold: { type: "integer", default: 80 },
          },
        },
        BudgetSnapshot: {
          type: "object",
          required: ["user_email", "category", "month", "limit_amount", "spent"],
          properties: {
            user_email: { type: "string" },
            category: { type: "string" },
            month: { type: "string", example: "2026-04" },
            limit_amount: { type: "number" },
            spent: { type: "number" },
            rollover_to_next: { type: "number", default: 0 },
          },
        },
        OnboardingStatus: {
          type: "object",
          properties: {
            user_email: { type: "string" },
            has_onboarded: { type: "boolean" },
            completed_at: { type: "string", format: "date-time", nullable: true },
          },
        },
        AppSetting: {
          type: "object",
          required: ["key", "value"],
          properties: {
            key: {
              type: "string",
              enum: [
                "savings_balance","splitwise_key","splitwise_last_sync",
                "splitwise_balances","view_mode","budget_split",
              ],
            },
            value: {},
          },
        },
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
          },
        },
      },
    },
  },
  apis: ["./server/routes/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
