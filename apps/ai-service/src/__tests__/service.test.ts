import assert from "assert";
import {
  ProviderFactory,
  MockProvider,
  OpenAIProvider,
  DeepSeekProvider,
  AnthropicProvider,
  GeminiProvider,
} from "../providers";
import { ExecutionPlanner } from "../execution/planner";
import { WorkspaceRetriever } from "../retrievers/workspace_retriever";
import { createServer } from "../server";

async function runTests() {
  process.env.AI_SERVICE_SECRET = "test-ai-service-secret";
  console.log("🧪 Running plane-ai-service Test Suite...\n");
  let passed = 0;
  let failed = 0;

  const test = async (name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      console.log(`  ✅ PASSED: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ FAILED: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  };

  // 1. ProviderFactory Tests
  await test("ProviderFactory returns MockProvider when requested as 'mock'", () => {
    const provider = ProviderFactory.getProvider("mock");
    assert.strictEqual(provider.name, "mock");
    assert(provider instanceof MockProvider);
  });

  await test("ProviderFactory throws error on unknown or unsupported provider", () => {
    assert.throws(() => {
      ProviderFactory.getProvider("gpt5");
    }, /Unsupported or unknown AI provider/);
  });

  await test("ProviderFactory returns OpenAIProvider for 'openai'", () => {
    const provider = ProviderFactory.getProvider("openai");
    assert.strictEqual(provider.name, "openai");
    assert(provider instanceof OpenAIProvider);
  });

  await test("ProviderFactory returns DeepSeekProvider for 'deepseek'", () => {
    const provider = ProviderFactory.getProvider("deepseek");
    assert.strictEqual(provider.name, "deepseek");
    assert(provider instanceof DeepSeekProvider);
  });

  await test("ProviderFactory returns AnthropicProvider for 'anthropic' / 'claude'", () => {
    const p1 = ProviderFactory.getProvider("anthropic");
    const p2 = ProviderFactory.getProvider("claude");
    assert.strictEqual(p1.name, "anthropic");
    assert(p1 instanceof AnthropicProvider);
    assert(p2 instanceof AnthropicProvider);
  });

  await test("ProviderFactory returns GeminiProvider for 'gemini' / 'google'", () => {
    const p1 = ProviderFactory.getProvider("gemini");
    const p2 = ProviderFactory.getProvider("google");
    assert.strictEqual(p1.name, "gemini");
    assert(p1 instanceof GeminiProvider);
    assert(p2 instanceof GeminiProvider);
  });

  // 2. WorkspaceRetriever Tests
  await test("WorkspaceRetriever throws instead of inventing context when no API token is set", async () => {
    const retriever = new WorkspaceRetriever();

    await assert.rejects(() => retriever.getWorkspaceContext("test-workspace", "proj-1"), /Plane API token missing/);
    await assert.rejects(
      () => retriever.getIssueContext("test-workspace", "proj-1", "issue-1"),
      /Plane API token missing/
    );
  });

  await test("WorkspaceRetriever returns real context when an API token is set", async () => {
    const retriever = new WorkspaceRetriever("http://retriever.test/api/v1", "test-token");
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];

    globalThis.fetch = (async (url: any, init: any) => {
      requested.push(String(url));
      assert.strictEqual(init.headers["X-Api-Key"], "test-token");
      return {
        ok: true,
        json: async () => ({ results: [{ id: "real-1", name: "Real Project", identifier: "REA" }] }),
      };
    }) as unknown as typeof fetch;

    try {
      const ctx = await retriever.getWorkspaceContext("test-workspace", "proj-1");

      assert.strictEqual(ctx.workspaceSlug, "test-workspace");
      assert.strictEqual(ctx.projectId, "proj-1");
      assert.deepStrictEqual(ctx.projects, [{ id: "real-1", name: "Real Project", identifier: "REA" }]);
      assert(
        requested.includes("http://retriever.test/api/v1/workspaces/test-workspace/projects/"),
        `expected the projects endpoint to be called, got: ${requested.join(", ")}`
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 3. ExecutionPlanner Tests
  await test("ExecutionPlanner executes Ask Mode successfully", async () => {
    const planner = new ExecutionPlanner();
    const context = { workspaceSlug: "demo", projects: [{ id: "p1", name: "Demo" }], workItems: [] };
    const res = await planner.plan("Summarize progress", context, "ask", "mock");

    assert.strictEqual(res.mode, "ask");
    assert(res.responseText.includes("[Mock AI Response]"));
    assert.strictEqual(res.actions.length, 0);
  });

  await test("ExecutionPlanner executes Build Mode with heuristic extraction fallback", async () => {
    const planner = new ExecutionPlanner();
    const context = { workspaceSlug: "demo", projectId: "p1", projects: [{ id: "p1", name: "Demo" }] };
    const res = await planner.plan("Create a sprint named Sprint 25", context, "build", "mock");

    assert.strictEqual(res.mode, "build");
    assert(res.actions.length > 0);
    assert.strictEqual(res.actions[0].type, "create_cycle");
    assert.strictEqual(res.actions[0].targetEntityType, "cycle");
    assert.strictEqual(res.actions[0].requiresApproval, true);
  });

  await test("ExecutionPlanner handles work item creation requests in Build Mode", async () => {
    const planner = new ExecutionPlanner();
    const context = { workspaceSlug: "demo", projectId: "p1" };
    const res = await planner.plan("Create work item fix login bug", context, "build", "mock");

    assert.strictEqual(res.mode, "build");
    assert(res.actions.length > 0);
    assert.strictEqual(res.actions[0].type, "create_work_item");
    assert.strictEqual(res.actions[0].targetEntityType, "issue");
    assert.strictEqual(res.actions[0].requiresApproval, true);
  });

  // 4. HTTP Server Integration Tests
  await test("HTTP Server /health endpoint returns 200 OK", async () => {
    const app = createServer();
    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://localhost:${port}/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, "ok");
      assert.strictEqual(data.service, "plane-ai-service");
    } finally {
      server.close();
    }
  });

  const defaultHeaders = {
    "Content-Type": "application/json",
    "X-AI-Service-Key": "test-ai-service-secret",
  };

  // The retriever now refuses to invent context, so the server tests need a token and a
  // stubbed Plane API. Requests to anything else (the test server itself) go through untouched.
  const PLANE_API_STUB = "http://plane-api.test/api/v1";
  process.env.PLANE_API_TOKEN = "test-plane-token";
  process.env.PLANE_API_URL = PLANE_API_STUB;

  const passthroughFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    if (String(url).startsWith(PLANE_API_STUB)) {
      const isWrite = Boolean(init?.method) && init.method !== "GET";
      const body = isWrite && init.body ? JSON.parse(init.body) : null;
      // Plane echoes the created/updated entity back; reads are paginated.
      return { ok: true, json: async () => (isWrite ? { id: "stub-entity-1", ...body } : { results: [] }) };
    }
    return passthroughFetch(url, init);
  }) as unknown as typeof fetch;

  await test("HTTP Server returns 401 Unauthorized when X-AI-Service-Key is missing", async () => {
    const app = createServer();
    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://localhost:${port}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "test", workspaceSlug: "w1" }),
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert(data.error.includes("Unauthorized"));
    } finally {
      server.close();
    }
  });

  await test("HTTP Server /api/agent/run endpoint processes Ask Mode runs", async () => {
    const app = createServer();
    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://localhost:${port}/api/agent/run`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          prompt: "What is the status of project?",
          workspaceSlug: "test-workspace",
          mode: "ask",
          provider: "mock",
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.plan.mode, "ask");
    } finally {
      server.close();
    }
  });

  await test("HTTP Server /api/agent/execute endpoint executes actions against the Plane API", async () => {
    const app = createServer();
    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://localhost:${port}/api/agent/execute`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          workspaceSlug: "test-workspace",
          projectId: "p1",
          actionType: "create_work_item",
          payload: { name: "Test Task" },
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.result.name, "Test Task");
    } finally {
      server.close();
    }
  });

  // 5. Edge Cases & Resilience Tests
  await test("HTTP Server /api/agent/run rejects empty or whitespace prompts with 400 Bad Request", async () => {
    const app = createServer();
    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://localhost:${port}/api/agent/run`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          prompt: "   ",
          workspaceSlug: "test-workspace",
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert(data.error.includes("Missing required fields"));
    } finally {
      server.close();
    }
  });

  await test("HTTP Server /api/agent/execute returns 400 Bad Request for unsupported actionType", async () => {
    const app = createServer();
    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://localhost:${port}/api/agent/execute`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({
          workspaceSlug: "test-workspace",
          actionType: "invalid_action_name",
          payload: {},
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert(data.error.includes("Unsupported action_type"));
    } finally {
      server.close();
    }
  });

  await test("HTTP Server /api/agent/events handles malformed or empty webhooks safely", async () => {
    const app = createServer();
    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://localhost:${port}/api/agent/events`, {
        method: "POST",
        headers: defaultHeaders,
        body: JSON.stringify({}),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, "processed");
    } finally {
      server.close();
    }
  });

  console.log(`\n✨ Test Run Summary: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error("Fatal test error:", err);
    process.exit(1);
  });
}
