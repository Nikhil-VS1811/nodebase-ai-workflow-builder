"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { CreditCardIcon } from "lucide-react";
import { memo } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { RAZORPAY_CHANNEL_NAME } from "@/inngest/channels/razorpay";
import { fetchRazorpayRealtimeToken } from "./actions";

type RazorpayNodeData = {
  variableName?: string;
  intentKey?: string;
};

type RazorpayNodeType = Node<RazorpayNodeData>;

export const RazorpayNode = memo((props: NodeProps<RazorpayNodeType>) => {
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: RAZORPAY_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchRazorpayRealtimeToken,
  });

  const nodeData = props.data;
  const description = nodeData?.variableName
    ? `Result → ${nodeData.variableName}`
    : "Not configured";

  return (
    <BaseExecutionNode
      {...props}
      id={props.id}
      icon={CreditCardIcon}
      name="Razorpay"
      status={nodeStatus}
      description={description}
    />
  );
});

RazorpayNode.displayName = "RazorpayNode";
