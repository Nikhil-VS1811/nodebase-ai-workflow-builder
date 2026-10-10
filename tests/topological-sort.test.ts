import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { topologicalSort } from "../src/inngest/utils";
import type { Node, Connection, NodeType } from "../src/generated/prisma";

function createMockNode(id: string, name = id): Node {
  return {
    id,
    name,
    workflowId: "wf-1",
    type: "MANUAL_TRIGGER" as NodeType,
    position: { x: 0, y: 0 },
    data: {},
    credentialId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockConnection(fromNodeId: string, toNodeId: string): Connection {
  return {
    id: `conn-${fromNodeId}-${toNodeId}`,
    workflowId: "wf-1",
    fromNodeId,
    toNodeId,
    fromOutput: "main",
    toInput: "main",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("topologicalSort", () => {
  test("handles empty graph", () => {
    const result = topologicalSort([], []);
    assert.deepEqual(result, []);
  });

  test("handles single isolated node without throwing cycle error", () => {
    const nodeA = createMockNode("A");
    const result = topologicalSort([nodeA], []);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "A");
  });

  test("handles multiple unconnected/isolated nodes", () => {
    const nodes = [createMockNode("A"), createMockNode("B"), createMockNode("C")];
    const result = topologicalSort(nodes, []);
    assert.equal(result.length, 3);
    const resultIds = result.map((n) => n.id);
    assert.ok(resultIds.includes("A"));
    assert.ok(resultIds.includes("B"));
    assert.ok(resultIds.includes("C"));
  });

  test("sorts a linear graph in dependency order (A -> B -> C)", () => {
    const nodes = [createMockNode("C"), createMockNode("A"), createMockNode("B")];
    const connections = [
      createMockConnection("A", "B"),
      createMockConnection("B", "C"),
    ];

    const result = topologicalSort(nodes, connections);
    const resultIds = result.map((n) => n.id);

    assert.deepEqual(resultIds, ["A", "B", "C"]);
  });

  test("sorts a diamond / branched graph (A -> B, A -> C, B -> D, C -> D)", () => {
    const nodes = [
      createMockNode("D"),
      createMockNode("B"),
      createMockNode("A"),
      createMockNode("C"),
    ];
    const connections = [
      createMockConnection("A", "B"),
      createMockConnection("A", "C"),
      createMockConnection("B", "D"),
      createMockConnection("C", "D"),
    ];

    const result = topologicalSort(nodes, connections);
    const resultIds = result.map((n) => n.id);

    assert.equal(resultIds[0], "A");
    assert.equal(resultIds[3], "D");
    assert.ok(resultIds.indexOf("B") < resultIds.indexOf("D"));
    assert.ok(resultIds.indexOf("C") < resultIds.indexOf("D"));
  });

  test("handles disconnected components with isolated nodes", () => {
    const nodes = [
      createMockNode("X"), // isolated
      createMockNode("A"),
      createMockNode("B"),
      createMockNode("C"),
      createMockNode("D"),
      createMockNode("Y"), // isolated
    ];
    const connections = [
      createMockConnection("A", "B"),
      createMockConnection("C", "D"),
    ];

    const result = topologicalSort(nodes, connections);
    const resultIds = result.map((n) => n.id);

    assert.equal(result.length, 6);
    assert.ok(resultIds.indexOf("A") < resultIds.indexOf("B"));
    assert.ok(resultIds.indexOf("C") < resultIds.indexOf("D"));
    assert.ok(resultIds.includes("X"));
    assert.ok(resultIds.includes("Y"));
  });

  test("handles duplicate edges gracefully", () => {
    const nodes = [createMockNode("A"), createMockNode("B")];
    const connections = [
      createMockConnection("A", "B"),
      createMockConnection("A", "B"), // duplicate
    ];

    const result = topologicalSort(nodes, connections);
    const resultIds = result.map((n) => n.id);

    assert.deepEqual(resultIds, ["A", "B"]);
  });

  test("throws Workflow contains a cycle on direct 2-node cycle (A -> B -> A)", () => {
    const nodes = [createMockNode("A"), createMockNode("B")];
    const connections = [
      createMockConnection("A", "B"),
      createMockConnection("B", "A"),
    ];

    assert.throws(
      () => topologicalSort(nodes, connections),
      /Workflow contains a cycle/,
    );
  });

  test("throws Workflow contains a cycle on 3-node cycle (A -> B -> C -> A)", () => {
    const nodes = [createMockNode("A"), createMockNode("B"), createMockNode("C")];
    const connections = [
      createMockConnection("A", "B"),
      createMockConnection("B", "C"),
      createMockConnection("C", "A"),
    ];

    assert.throws(
      () => topologicalSort(nodes, connections),
      /Workflow contains a cycle/,
    );
  });

  test("throws Workflow contains a cycle on self-loop (A -> A)", () => {
    const nodes = [createMockNode("A")];
    const connections = [createMockConnection("A", "A")];

    assert.throws(
      () => topologicalSort(nodes, connections),
      /Workflow contains a cycle/,
    );
  });
});
