"use client";

import { Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { ShieldCheckIcon } from "lucide-react";
import { memo } from "react";
import { BaseNode, BaseNodeContent, BaseNodeHeader, BaseNodeHeaderTitle } from "@/components/react-flow/base-node";
import { BaseHandle } from "@/components/react-flow/base-handle";
import { WorkflowNode } from "@/components/workflow-node";
import { NodeStatusIndicator } from "@/components/react-flow/node-status-indicator";
import { useNodeStatus } from "../../hooks/use-node-status";
import { POLICY_GATE_CHANNEL_NAME } from "@/inngest/channels/policy-gate";
import { fetchPolicyGateRealtimeToken } from "./actions";

type PolicyGateNodeData = {
  intentKey?: string;
};

type PolicyGateNodeType = Node<PolicyGateNodeData>;

export const PolicyGateNode = memo((props: NodeProps<PolicyGateNodeType>) => {
  const { setNodes, setEdges } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: POLICY_GATE_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchPolicyGateRealtimeToken,
  });

  const handleDelete = () => {
    setNodes((nodes) => nodes.filter((n) => n.id !== props.id));
    setEdges((edges) =>
      edges.filter((e) => e.source !== props.id && e.target !== props.id),
    );
  };

  const intentKey = props.data?.intentKey ?? "transactionIntent";

  return (
    <WorkflowNode
      name="Policy Gate"
      description={`Evaluates: ${intentKey}`}
      onDelete={handleDelete}
    >
      <NodeStatusIndicator status={nodeStatus} variant="border">
        <BaseNode status={nodeStatus}>
          {/* Single input handle — receives TransactionIntent from the left */}
          <BaseHandle
            id="target-intent"
            type="target"
            position={Position.Left}
            style={{ top: "50%" }}
          />

          <BaseNodeHeader className="bg-amber-50 dark:bg-amber-950/30 rounded-t-sm border-b border-amber-200 dark:border-amber-800">
            <ShieldCheckIcon className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <BaseNodeHeaderTitle className="text-amber-900 dark:text-amber-100 text-xs">
              Policy Gate
            </BaseNodeHeaderTitle>
          </BaseNodeHeader>

          <BaseNodeContent className="py-3 px-3 gap-y-3">
            {/* Approved output — top-right */}
            <div className="flex items-center justify-between relative pr-3">
              <span className="text-[10px] font-medium text-green-700 dark:text-green-400 uppercase tracking-wide">
                Approved
              </span>
              <BaseHandle
                id="source-approved"
                type="source"
                position={Position.Right}
                className="!bg-green-500 !border-green-600"
                style={{ top: "auto", bottom: "auto", position: "relative", transform: "none", right: "-12px" }}
              />
            </div>

            {/* Denied output — bottom-right */}
            <div className="flex items-center justify-between relative pr-3">
              <span className="text-[10px] font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">
                Denied
              </span>
              <BaseHandle
                id="source-denied"
                type="source"
                position={Position.Right}
                className="!bg-red-500 !border-red-600"
                style={{ top: "auto", bottom: "auto", position: "relative", transform: "none", right: "-12px" }}
              />
            </div>
          </BaseNodeContent>
        </BaseNode>
      </NodeStatusIndicator>
    </WorkflowNode>
  );
});

PolicyGateNode.displayName = "PolicyGateNode";
