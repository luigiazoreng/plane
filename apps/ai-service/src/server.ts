import express from "express";
import cors from "cors";
import { WorkspaceRetriever } from "./retrievers/workspace_retriever";
import { ExecutionPlanner } from "./execution/planner";
import { createWorkItem, updateWorkItem } from "./tools/work_item";
import { createComment } from "./tools/comment";
import { createCycle } from "./tools/cycle";
import { createModule } from "./tools/module";
import { consumeEvent } from "./events/consumer";

const asyncHandler =
  (fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>) =>
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    fn(req, res, next).catch((err: any) => {
      res.status(500).json({ error: err?.message || "Internal Server Error" });
    });
  };

export const createServer = () => {
  const app = express();

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",")
    : ["http://localhost:3000", "http://localhost:8000", "http://localhost:8001"];

  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());

  // Inbound secret key auth middleware for privileged endpoints
  app.use((req, res, next) => {
    if (req.path === "/health") {
      return next();
    }
    const expectedSecret = process.env.AI_SERVICE_SECRET;
    const apiKey = req.headers["x-ai-service-key"];

    if (!expectedSecret || !apiKey || apiKey !== expectedSecret) {
      return res
        .status(401)
        .json({ error: "Unauthorized: AI_SERVICE_SECRET is missing or invalid X-AI-Service-Key header" });
    }
    next();
  });

  const retriever = new WorkspaceRetriever();
  const planner = new ExecutionPlanner();

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "plane-ai-service", timestamp: new Date().toISOString() });
  });

  // Main agent run orchestration endpoint
  app.post(
    "/api/agent/run",
    asyncHandler(async (req, res) => {
      try {
        const { prompt, workspaceSlug, projectId, mode = "ask", provider } = req.body;

        if (!prompt || typeof prompt !== "string" || !prompt.trim() || !workspaceSlug) {
          return res.status(400).json({ error: "Missing required fields: prompt, workspaceSlug" });
        }

        // 1. Fetch grounded context
        const context = await retriever.getWorkspaceContext(workspaceSlug, projectId);

        // 2. Execute planning / Q&A
        const plan = await planner.plan(prompt.trim(), context, mode, provider);

        return res.json({
          success: true,
          plan,
        });
      } catch (error: any) {
        console.error("[AI Service] Run Error:", error);
        return res.status(500).json({ error: error.message || "Failed to execute agent run" });
      }
    })
  );

  // Action execution endpoint for approved actions
  app.post(
    "/api/agent/execute",
    asyncHandler(async (req, res) => {
      try {
        const { workspaceSlug, projectId, actionType, payload } = req.body;

        if (!workspaceSlug || !actionType || !payload) {
          return res.status(400).json({ error: "Missing required fields: workspaceSlug, actionType, payload" });
        }

        let result;
        switch (actionType) {
          case "create_work_item":
            result = await createWorkItem(workspaceSlug, projectId || payload.project_id, payload);
            break;
          case "update_work_item":
            result = await updateWorkItem(workspaceSlug, projectId, payload.issue_id, payload);
            break;
          case "create_comment":
            result = await createComment(workspaceSlug, projectId, payload.issue_id, payload);
            break;
          case "create_cycle":
            result = await createCycle(workspaceSlug, projectId || payload.project_id, payload);
            break;
          case "create_module":
            result = await createModule(workspaceSlug, projectId || payload.project_id, payload);
            break;

          default:
            return res.status(400).json({ error: `Unsupported action_type: ${actionType}` });
        }

        return res.json({ success: true, result });
      } catch (error: any) {
        console.error("[AI Service] Action Execution Error:", error);
        return res.status(500).json({ error: error.message || "Failed to execute action" });
      }
    })
  );

  // Inbound webhook event consumer endpoint
  app.post(
    "/api/agent/events",
    asyncHandler(async (req, res) => {
      try {
        await consumeEvent(req.body);
        return res.json({ status: "processed" });
      } catch (error: any) {
        console.error("[AI Service] Event Consumer Error:", error);
        return res.status(500).json({ error: error.message });
      }
    })
  );

  return app;
};
