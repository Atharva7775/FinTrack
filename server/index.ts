import "dotenv/config";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { swaggerSpec } from "./swagger";
import { transactionsRouter } from "./routes/transactions";
import { goalsRouter } from "./routes/goals";
import { budgetsRouter } from "./routes/budgets";
import { settingsRouter } from "./routes/settings";
import { onboardingRouter } from "./routes/onboarding";
import { chatRouter } from "./routes/chat";

const app = express();
const PORT = process.env.API_PORT ?? 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: ["http://localhost:8080", "http://localhost:3000"] }));
app.use(express.json());

// ── Swagger UI ────────────────────────────────────────────────────────────────
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: "FinTrack API Docs",
    swaggerOptions: { persistAuthorization: true },
  })
);

// Raw OpenAPI JSON (useful for importing into Postman / Insomnia)
app.get("/api-docs.json", (_req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use("/api/transactions", transactionsRouter);
app.use("/api/goals", goalsRouter);
app.use("/api/budgets", budgetsRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/chat", chatRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  FinTrack API server running on http://localhost:${PORT}`);
  console.log(`📖  Swagger UI:       http://localhost:${PORT}/api-docs`);
  console.log(`📄  OpenAPI JSON:     http://localhost:${PORT}/api-docs.json\n`);
});
