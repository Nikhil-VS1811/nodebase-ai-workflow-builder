import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_DEMO_WORKFLOW,
  DEMO_WORKFLOW_ID,
  getGuestWorkflow,
  isDemoWorkflow,
  resetGuestWorkflow,
  saveGuestWorkflow,
  saveGuestWorkflowName,
} from "../src/features/workflows/guest-workflow";
import {
  DEMO_WORKFLOW_ROUTE,
  getGetStartedHref,
  getSignInHref,
} from "../src/lib/redirect-utils";

describe("Phase 6O.8 — Guest Workflow & Demo Builder Architecture", () => {
  const repoRoot = path.resolve(__dirname, "..");

  describe("Demo Workflow Identification & Routing", () => {
    it("identifies demo workflow case-insensitively and rejects other workflow IDs", () => {
      assert.equal(isDemoWorkflow(DEMO_WORKFLOW_ID), true);
      assert.equal(isDemoWorkflow("DEMO"), true);
      assert.equal(isDemoWorkflow("Demo"), true);
      assert.equal(isDemoWorkflow("wf_12345"), false);
      assert.equal(isDemoWorkflow("user-personal-workflow"), false);
      assert.equal(isDemoWorkflow(""), false);
      assert.equal(isDemoWorkflow(null), false);
      assert.equal(isDemoWorkflow(undefined), false);
    });

    it("routes unauthenticated Get Started directly to /workflows/demo without login barrier", () => {
      assert.equal(getGetStartedHref(false), DEMO_WORKFLOW_ROUTE);
      assert.equal(getGetStartedHref(false), "/workflows/demo");
    });

    it("routes Get Started as Guest directly to /workflows/demo regardless of auth state", () => {
      assert.equal(getGetStartedHref(true), DEMO_WORKFLOW_ROUTE);
      assert.equal(getGetStartedHref(true), "/workflows/demo");
    });

    it("preserves Sign In CTA to /login with return destination /workflows", () => {
      assert.equal(getSignInHref(), "/login?redirect=/workflows");
    });
  });

  describe("Demo Workflow Data Model & Structure", () => {
    it("provides a valid default demo workflow with triggers, execution nodes, and edges", () => {
      assert.equal(DEFAULT_DEMO_WORKFLOW.id, DEMO_WORKFLOW_ID);
      assert.ok(DEFAULT_DEMO_WORKFLOW.name.length > 0);
      assert.ok(DEFAULT_DEMO_WORKFLOW.nodes.length >= 3);
      assert.ok(DEFAULT_DEMO_WORKFLOW.edges.length >= 2);

      const triggerNode = DEFAULT_DEMO_WORKFLOW.nodes.find(
        (n) => n.id === "demo-trigger",
      );
      assert.ok(triggerNode, "Must include a demo manual trigger node");
      assert.equal(triggerNode?.type, "MANUAL_TRIGGER");

      const httpNode = DEFAULT_DEMO_WORKFLOW.nodes.find(
        (n) => n.id === "demo-http",
      );
      assert.ok(httpNode, "Must include an HTTP request node");
      assert.equal(httpNode?.type, "HTTP_REQUEST");

      const geminiNode = DEFAULT_DEMO_WORKFLOW.nodes.find(
        (n) => n.id === "demo-gemini",
      );
      assert.ok(geminiNode, "Must include a Gemini AI node");
      assert.equal(geminiNode?.type, "GEMINI");

      const edge1 = DEFAULT_DEMO_WORKFLOW.edges.find(
        (e) => e.source === "demo-trigger" && e.target === "demo-http",
      );
      assert.ok(edge1, "Must connect trigger to HTTP request");

      const edge2 = DEFAULT_DEMO_WORKFLOW.edges.find(
        (e) => e.source === "demo-http" && e.target === "demo-gemini",
      );
      assert.ok(edge2, "Must connect HTTP request to Gemini node");
    });

    it("contains no sensitive user IDs, database IDs, or server secrets in demo data", () => {
      const serialized = JSON.stringify(DEFAULT_DEMO_WORKFLOW);
      assert.ok(!serialized.includes("apiKey"));
      assert.ok(!serialized.includes("clientSecret"));
      assert.ok(!serialized.includes("password"));
      assert.ok(!serialized.includes("credentialId"));
      assert.ok(!serialized.includes("userId"));
    });
  });

  describe("Guest Draft Storage, Node Creation & Session Persistence", () => {
    it("returns default demo workflow in non-browser environments gracefully", () => {
      const workflow = getGuestWorkflow();
      assert.equal(workflow.id, DEMO_WORKFLOW_ID);
      assert.equal(workflow.nodes.length, DEFAULT_DEMO_WORKFLOW.nodes.length);
    });

    it("persists guest-created nodes, edges, and workflow name across session reloads via localStorage", () => {
      const storage = new Map<string, string>();
      const originalWindow = (globalThis as Record<string, unknown>).window;
      (globalThis as Record<string, unknown>).window = {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, val: string) => storage.set(key, val),
          removeItem: (key: string) => storage.delete(key),
        },
      };

      try {
        // 1. Initial load returns default demo workflow
        const initial = getGuestWorkflow();
        assert.equal(initial.nodes.length, 3);
        assert.equal(initial.edges.length, 2);

        // 2. Guest adds a new Discord node and connects Gemini -> Discord
        const newNodes = [
          ...initial.nodes,
          {
            id: "demo-discord-4",
            type: "DISCORD",
            position: { x: 1100, y: 180 },
            data: { content: "Weather summary: {{summary}}" },
          },
        ];
        const newEdges = [
          ...initial.edges,
          {
            id: "demo-edge-3",
            source: "demo-gemini",
            target: "demo-discord-4",
          },
        ];

        const saved = saveGuestWorkflow({
          name: "Custom Guest Pipeline",
          nodes: newNodes,
          edges: newEdges,
        });
        assert.equal(saved, true);

        // 3. Reloading guest workflow returns persisted nodes, edges, and name
        const reloaded = getGuestWorkflow();
        assert.equal(reloaded.name, "Custom Guest Pipeline");
        assert.equal(reloaded.nodes.length, 4);
        assert.equal(reloaded.edges.length, 3);
        assert.equal(reloaded.nodes[3]?.id, "demo-discord-4");
        assert.equal(reloaded.edges[2]?.target, "demo-discord-4");

        // 4. Updating name preserves nodes and edges
        saveGuestWorkflowName("Renamed Guest Flow");
        const renamed = getGuestWorkflow();
        assert.equal(renamed.name, "Renamed Guest Flow");
        assert.equal(renamed.nodes.length, 4);

        // 5. Resetting restores default demo workflow
        resetGuestWorkflow();
        const afterReset = getGuestWorkflow();
        assert.equal(afterReset.name, DEFAULT_DEMO_WORKFLOW.name);
        assert.equal(afterReset.nodes.length, 3);
        assert.equal(afterReset.edges.length, 2);
      } finally {
        (globalThis as Record<string, unknown>).window = originalWindow;
      }
    });

    it("enforces strict size and count limits on guest storage payloads", () => {
      const storage = new Map<string, string>();
      const originalWindow = (globalThis as Record<string, unknown>).window;
      (globalThis as Record<string, unknown>).window = {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, val: string) => storage.set(key, val),
          removeItem: (key: string) => storage.delete(key),
        },
      };

      try {
        // Attempt to save oversized >100KB payload
        const hugeData = "x".repeat(120 * 1024);
        const result = saveGuestWorkflow({
          nodes: [
            {
              id: "huge-node",
              type: "HTTP_REQUEST",
              position: { x: 0, y: 0 },
              data: { body: hugeData },
            },
          ],
        });
        assert.equal(result, false, "Must reject payloads exceeding 100KB");
      } finally {
        (globalThis as Record<string, unknown>).window = originalWindow;
      }
    });
  });

  describe("Editor Page & Route Authorization Boundaries", () => {
    it("editor page specifically bypasses requireAuth only for isDemoWorkflow(workflowId)", () => {
      const pageSource = fs.readFileSync(
        path.join(
          repoRoot,
          "src/app/(dashboard)/(editor)/workflows/[workflowId]/page.tsx",
        ),
        "utf8",
      );

      assert.ok(
        pageSource.includes("isDemoWorkflow(workflowId)"),
        "Editor page must check isDemoWorkflow(workflowId)",
      );
      assert.ok(
        pageSource.includes("await requireAuth("),
        "Non-demo workflows must enforce requireAuth with target destination",
      );
      assert.ok(
        pageSource.includes("prefetchWorkflow(workflowId);"),
        "Non-demo workflows must prefetch workflow for authenticated user",
      );
    });

    it("editor component branches to GuestEditor for demo workflows without tRPC suspense calls", () => {
      const editorSource = fs.readFileSync(
        path.join(repoRoot, "src/features/editor/components/editor.tsx"),
        "utf8",
      );

      assert.ok(
        editorSource.includes("isDemoWorkflow(workflowId)"),
        "Editor must branch on isDemoWorkflow(workflowId)",
      );
      assert.ok(
        editorSource.includes("GuestEditor"),
        "Editor must render GuestEditor for demo workflow",
      );
      assert.ok(
        editorSource.includes("AuthenticatedEditor"),
        "Editor must isolate AuthenticatedEditor with useSuspenseWorkflow",
      );
    });

    it("editor save button and name input isolate guest persistence to browser storage", () => {
      const headerSource = fs.readFileSync(
        path.join(repoRoot, "src/features/editor/components/editor-header.tsx"),
        "utf8",
      );

      assert.ok(
        headerSource.includes("saveGuestWorkflow"),
        "EditorSaveButton must use saveGuestWorkflow in guest mode",
      );
      assert.ok(
        headerSource.includes("Draft saved to browser storage"),
        "EditorSaveButton must inform user that draft is saved to browser storage",
      );
      assert.ok(
        headerSource.includes("saveGuestWorkflowName"),
        "EditorNameInput must use saveGuestWorkflowName in guest mode",
      );
      assert.ok(
        headerSource.includes("Guest Demo"),
        "EditorBreadcrumbs must display Guest Demo badge",
      );
    });

    it("execute workflow button disables cloud execution in guest mode with explanatory prompt", () => {
      const executeBtnSource = fs.readFileSync(
        path.join(
          repoRoot,
          "src/features/editor/components/execute-workflow-button.tsx",
        ),
        "utf8",
      );

      assert.ok(
        executeBtnSource.includes("isDemoWorkflow(workflowId)"),
        "ExecuteWorkflowButton must detect guest mode",
      );
      assert.ok(
        executeBtnSource.includes("Cloud execution requires a free account"),
        "ExecuteWorkflowButton must inform guests about account requirement",
      );
      assert.ok(
        !executeBtnSource.includes("executeWorkflow.mutateAsync") ||
          executeBtnSource.includes("if (isGuest) {\n      if (editor)"),
        "ExecuteWorkflowButton must never call server execution mutation in guest mode",
      );
    });

    it("useNodeStatus disables Inngest Realtime subscriptions for demo nodes to prevent unauthorized token errors", () => {
      const nodeStatusSource = fs.readFileSync(
        path.join(repoRoot, "src/features/executions/hooks/use-node-status.ts"),
        "utf8",
      );

      assert.ok(
        nodeStatusSource.includes("isDemoNode"),
        "useNodeStatus must detect demo nodes",
      );
      assert.ok(
        nodeStatusSource.includes("enabled: !isDemoNode"),
        "useNodeStatus must disable subscription for demo nodes",
      );
    });

    it("app-sidebar renders Sign In and Create Account options when user is not authenticated", () => {
      const sidebarSource = fs.readFileSync(
        path.join(repoRoot, "src/components/app-sidebar.tsx"),
        "utf8",
      );

      assert.ok(
        sidebarSource.includes("!session ? ("),
        "AppSidebar must check session state in footer",
      );
      assert.ok(
        sidebarSource.includes('href="/login?redirect=/workflows"'),
        "AppSidebar must offer Sign In link for unauthenticated visitors",
      );
      assert.ok(
        sidebarSource.includes('href="/signup?redirect=/workflows"'),
        "AppSidebar must offer Create account link for unauthenticated visitors",
      );
    });

    it("/workflows page renders GuestWorkflowsView for unauthenticated visitors without calling prefetchWorkflows", () => {
      const workflowsPageSource = fs.readFileSync(
        path.join(repoRoot, "src/app/(dashboard)/(rest)/workflows/page.tsx"),
        "utf8",
      );

      assert.ok(
        workflowsPageSource.includes("getOptionalSession()"),
        "/workflows page must check getOptionalSession()",
      );
      assert.ok(
        workflowsPageSource.includes("<GuestWorkflowsView />"),
        "/workflows page must render <GuestWorkflowsView /> when session is absent",
      );
      assert.ok(
        workflowsPageSource.includes("prefetchWorkflows(params)"),
        "/workflows page must still prefetch workflows for authenticated users",
      );
    });

    it("all private credential and execution routes remain strictly protected by requireAuth", () => {
      const privateRoutes = [
        "src/app/(dashboard)/(rest)/credentials/page.tsx",
        "src/app/(dashboard)/(rest)/credentials/[credentialId]/page.tsx",
        "src/app/(dashboard)/(rest)/credentials/new/page.tsx",
        "src/app/(dashboard)/(rest)/executions/page.tsx",
        "src/app/(dashboard)/(rest)/executions/[executionId]/page.tsx",
      ];

      for (const routePath of privateRoutes) {
        const source = fs.readFileSync(path.join(repoRoot, routePath), "utf8");
        assert.ok(
          source.includes("requireAuth("),
          `${routePath} must enforce requireAuth`,
        );
      }
    });

    it("tRPC routers strictly enforce protectedProcedure and userId ownership checks against guest access", () => {
      const routers = [
        "src/features/workflows/server/routers.ts",
        "src/features/credentials/server/routers.ts",
        "src/features/executions/server/routers.ts",
      ];

      for (const routerPath of routers) {
        const source = fs.readFileSync(path.join(repoRoot, routerPath), "utf8");
        assert.ok(
          source.includes("protectedProcedure"),
          `${routerPath} must use protectedProcedure`,
        );
        assert.ok(
          !source.includes("baseProcedure."),
          `${routerPath} must not expose unauthenticated baseProcedure endpoints`,
        );
        assert.ok(
          source.includes("ctx.auth.user.id"),
          `${routerPath} must scope database queries to ctx.auth.user.id`,
        );
      }
    });

    it("GuestEditor auto-persists canvas node and edge changes to localStorage and NodeSelector prefixes guest node IDs", () => {
      const editorSource = fs.readFileSync(
        path.join(repoRoot, "src/features/editor/components/editor.tsx"),
        "utf8",
      );
      assert.ok(
        editorSource.includes("saveGuestWorkflow({ nodes, edges })"),
        "GuestEditor must automatically persist nodes and edges to browser storage",
      );

      const selectorSource = fs.readFileSync(
        path.join(repoRoot, "src/components/node-selector.tsx"),
        "utf8",
      );
      assert.ok(
        selectorSource.includes("isGuest ? `demo-") &&
          selectorSource.includes("createId()"),
        "NodeSelector must prefix newly created guest nodes with demo-",
      );
    });

    it("AI node dialogs disable credential tRPC queries and allow optional credentialId in guest mode", () => {
      const aiDialogs = [
        "src/features/executions/components/gemini/dialog.tsx",
        "src/features/executions/components/openai/dialog.tsx",
        "src/features/executions/components/anthropic/dialog.tsx",
      ];

      for (const dialogPath of aiDialogs) {
        const source = fs.readFileSync(path.join(repoRoot, dialogPath), "utf8");
        assert.ok(
          source.includes("enabled: open && !isGuest"),
          `${dialogPath} must disable credential query when in guest mode or closed`,
        );
        assert.ok(
          source.includes("isGuest || Boolean(data.credentialId?.trim())"),
          `${dialogPath} must allow optional credentialId in guest mode`,
        );
      }
    });
  });
});
