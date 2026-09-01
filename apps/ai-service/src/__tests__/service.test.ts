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
  await test("ProviderFactory returns MockProvider by default or on unknown provider", () => {
    const provider = ProviderFactory.getProvider();
    assert.strictEqual(provider.name, "mock");
    assert(provider instanceof MockProvider);
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
  await test("WorkspaceRetriever returns mock context when no API token is set", async () => {
    const retriever = new WorkspaceRetriever();
    const ctx = await retriever.getWorkspaceContext("test-workspace", "proj-1");

    assert.strictEqual(ctx.workspaceSlug, "test-workspace");
    assert.strictEqual(ctx.projectId, "proj-1");
    assert(Array.isArray(ctx.projects) && ctx.projects.length > 0);
    assert(Array.isArray(ctx.workItems) && ctx.workItems.length > 0);
    assert(Array.isArray(ctx.cycles) && ctx.cycles.length > 0);
    assert(Array.isArray(ctx.modules) && ctx.modules.length > 0);
    assert(Array.isArray(ctx.pages) && ctx.pages.length > 0);
    assert(Array.isArray(ctx.states) && ctx.states.length > 0);
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

  await test("HTTP Server /api/agent/run endpoint processes Ask Mode runs", async () => {
    const app = createServer();
    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://localhost:${port}/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  await test("HTTP Server /api/agent/execute endpoint executes mock actions", async () => {
    const app = createServer();
    const server = app.listen(0);
    const address = server.address() as any;
    const port = address.port;

    try {
      const res = await fetch(`http://localhost:${port}/api/agent/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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
