import type { Edge, Node } from "@xyflow/react";
import { NodeType } from "@/generated/prisma";

export const DEMO_WORKFLOW_ID = "demo";
const STORAGE_KEY = "nodebase_guest_workflow_demo";
const MAX_STORAGE_BYTES = 100 * 1024; // 100 KB limit
const MAX_NODES = 50;
const MAX_EDGES = 100;

export interface GuestWorkflowData {
  id: string;
  name: string;
  nodes: Node[];
  edges: Edge[];
}

export const DEFAULT_DEMO_NODES: Node[] = [
  {
    id: "demo-trigger",
    type: NodeType.MANUAL_TRIGGER,
    position: { x: 100, y: 180 },
    data: {},
  },
  {
    id: "demo-http",
    type: NodeType.HTTP_REQUEST,
    position: { x: 420, y: 180 },
    data: {
      variableName: "weatherData",
      endpoint:
        "https://api.open-meteo.com/v1/forecast?latitude=37.77&longitude=-122.41&current_weather=true",
      method: "GET",
    },
  },
  {
    id: "demo-gemini",
    type: NodeType.GEMINI,
    position: { x: 780, y: 180 },
    data: {
      variableName: "summary",
      systemPrompt: "You are a concise weather assistant.",
      userPrompt: "Summarize current weather conditions from {{weatherData}}.",
    },
  },
];

export const DEFAULT_DEMO_EDGES: Edge[] = [
  {
    id: "demo-edge-1",
    source: "demo-trigger",
    target: "demo-http",
  },
  {
    id: "demo-edge-2",
    source: "demo-http",
    target: "demo-gemini",
  },
];

export const DEFAULT_DEMO_WORKFLOW: GuestWorkflowData = {
  id: DEMO_WORKFLOW_ID,
  name: "Weather AI Summary (Demo)",
  nodes: DEFAULT_DEMO_NODES,
  edges: DEFAULT_DEMO_EDGES,
};

export function isDemoWorkflow(workflowId: string | null | undefined): boolean {
  if (!workflowId) return false;
  return workflowId.toLowerCase() === DEMO_WORKFLOW_ID;
}

export function getGuestWorkflow(): GuestWorkflowData {
  if (typeof window === "undefined") {
    return DEFAULT_DEMO_WORKFLOW;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_DEMO_WORKFLOW;
    }

    if (raw.length > MAX_STORAGE_BYTES) {
      return DEFAULT_DEMO_WORKFLOW;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return DEFAULT_DEMO_WORKFLOW;
    }

    const name =
      typeof parsed.name === "string" && parsed.name.trim().length > 0
        ? parsed.name.trim().slice(0, 100)
        : DEFAULT_DEMO_WORKFLOW.name;

    const nodes = Array.isArray(parsed.nodes)
      ? parsed.nodes.slice(0, MAX_NODES)
      : DEFAULT_DEMO_WORKFLOW.nodes;

    const edges = Array.isArray(parsed.edges)
      ? parsed.edges.slice(0, MAX_EDGES)
      : DEFAULT_DEMO_WORKFLOW.edges;

    return {
      id: DEMO_WORKFLOW_ID,
      name,
      nodes,
      edges,
    };
  } catch {
    return DEFAULT_DEMO_WORKFLOW;
  }
}

export function saveGuestWorkflow(updates: {
  name?: string;
  nodes?: Node[];
  edges?: Edge[];
}): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const current = getGuestWorkflow();
    const updatedName =
      updates.name !== undefined
        ? updates.name.trim().slice(0, 100)
        : current.name;
    const updatedNodes =
      updates.nodes !== undefined
        ? updates.nodes.slice(0, MAX_NODES)
        : current.nodes;
    const updatedEdges =
      updates.edges !== undefined
        ? updates.edges.slice(0, MAX_EDGES)
        : current.edges;

    const payload: GuestWorkflowData = {
      id: DEMO_WORKFLOW_ID,
      name: updatedName || DEFAULT_DEMO_WORKFLOW.name,
      nodes: updatedNodes,
      edges: updatedEdges,
    };

    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_STORAGE_BYTES) {
      return false;
    }

    window.localStorage.setItem(STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function saveGuestWorkflowName(name: string): boolean {
  return saveGuestWorkflow({ name });
}

export function resetGuestWorkflow(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage clear errors
  }
}
