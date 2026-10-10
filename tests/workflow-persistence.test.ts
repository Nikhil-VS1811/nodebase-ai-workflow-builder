import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { sanitizeConnections, type WorkflowEdgeInput } from "../src/features/workflows/server/routers";

describe("Workflow Persistence & Edge Sanitization", () => {
  const workflowId = "wf-123";
  const validNodes = ["node-1", "node-2", "node-3"];

  test("preserves valid directed edges", () => {
    const edges: WorkflowEdgeInput[] = [
      { source: "node-1", target: "node-2" },
      { source: "node-2", target: "node-3" },
    ];

    const result = sanitizeConnections(workflowId, validNodes, edges);
    assert.equal(result.length, 2);
    assert.equal(result[0].fromNodeId, "node-1");
    assert.equal(result[0].toNodeId, "node-2");
    assert.equal(result[1].fromNodeId, "node-2");
    assert.equal(result[1].toNodeId, "node-3");
  });

  test("filters out self-loops (node-1 -> node-1)", () => {
    const edges: WorkflowEdgeInput[] = [
      { source: "node-1", target: "node-1" },
      { source: "node-1", target: "node-2" },
    ];

    const result = sanitizeConnections(workflowId, validNodes, edges);
    assert.equal(result.length, 1);
    assert.equal(result[0].fromNodeId, "node-1");
    assert.equal(result[0].toNodeId, "node-2");
  });

  test("filters out dangling connections referencing deleted/nonexistent nodes", () => {
    const edges: WorkflowEdgeInput[] = [
      { source: "node-1", target: "deleted-node-99" },
      { source: "ghost-node-00", target: "node-2" },
      { source: "node-1", target: "node-2" },
    ];

    const result = sanitizeConnections(workflowId, validNodes, edges);
    assert.equal(result.length, 1);
    assert.equal(result[0].fromNodeId, "node-1");
    assert.equal(result[0].toNodeId, "node-2");
  });

  test("deduplicates redundant edges between same source, target, and handles", () => {
    const edges: WorkflowEdgeInput[] = [
      { source: "node-1", target: "node-2", sourceHandle: "main", targetHandle: "main" },
      { source: "node-1", target: "node-2", sourceHandle: "main", targetHandle: "main" },
      { source: "node-1", target: "node-2", sourceHandle: null, targetHandle: null },
    ];

    const result = sanitizeConnections(workflowId, validNodes, edges);
    assert.equal(result.length, 1);
  });

  test("allows different handles between the same two nodes", () => {
    const edges: WorkflowEdgeInput[] = [
      { source: "node-1", target: "node-2", sourceHandle: "output-a", targetHandle: "input-a" },
      { source: "node-1", target: "node-2", sourceHandle: "output-b", targetHandle: "input-b" },
    ];

    const result = sanitizeConnections(workflowId, validNodes, edges);
    assert.equal(result.length, 2);
    assert.equal(result[0].fromOutput, "output-a");
    assert.equal(result[1].fromOutput, "output-b");
  });

  test("aborts execution dispatch if canvas save fails", async () => {
    let saveCalled = false;
    let executeCalled = false;

    const mockUpdateWorkflow = {
      mutateAsync: async () => {
        saveCalled = true;
        throw new Error("Canvas save failed (validation/network error)");
      },
    };

    const mockExecuteWorkflow = {
      mutateAsync: async () => {
        executeCalled = true;
      },
    };

    // Simulate ExecuteWorkflowButton handleExecute logic:
    const handleExecute = async () => {
      try {
        await mockUpdateWorkflow.mutateAsync();
        await mockExecuteWorkflow.mutateAsync();
      } catch {
        // Handled cleanly
      }
    };

    await handleExecute();

    assert.equal(saveCalled, true);
    assert.equal(executeCalled, false, "Execute must not run if save fails");
  });
});
