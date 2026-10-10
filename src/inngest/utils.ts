import { Connection, Node } from "@/generated/prisma";
import toposort from "toposort";
import { inngest } from "./client";
import { createId } from "@paralleldrive/cuid2";

export const topologicalSort = (
  nodes: Node[],
  connections: Connection[],
): Node[] => {
  // If no connections, return node as-is (they're all independent)
  if (connections.length === 0) {
    return nodes;
  }

  // Create edges array for toposort
  const edges: [string, string][] = connections.map((conn) => [
    conn.fromNodeId,
    conn.toNodeId,
  ]);

  // Perform topological sort on connected edges
  let sortedConnectedIds: string[];
  try {
    sortedConnectedIds = toposort(edges);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Cyclic")) {
      throw new Error("Workflow contains a cycle");
    }
    throw error;
  }

  // Preserve all unconnected/independent nodes
  const connectedIdSet = new Set(sortedConnectedIds);
  const unconnectedNodes = nodes.filter((node) => !connectedIdSet.has(node.id));

  // Map sorted IDs back to node objects and append unconnected nodes
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const sortedConnectedNodes = sortedConnectedIds
    .map((id) => nodeMap.get(id)!)
    .filter(Boolean);

  return [...sortedConnectedNodes, ...unconnectedNodes];
};

export const sendWorkflowExecution = async (data: {
  workflowId: string;
  [key: string]: any;
}) => {
  return inngest.send({
    name: "workflows/execute.workflow",
    data,
    id: createId(),
  });
};
