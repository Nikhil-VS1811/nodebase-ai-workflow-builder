"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { CreditCardIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { RAZORPAY_CHANNEL_NAME } from "@/inngest/channels/razorpay";
import { fetchRazorpayRealtimeToken } from "./actions";
import { RazorpayDialog, type RazorpayFormValues } from "./dialog";

type RazorpayNodeData = {
  variableName?: string;
  credentialId?: string;
  intentKey?: string;
};

type RazorpayNodeType = Node<RazorpayNodeData>;

export const RazorpayNode = memo((props: NodeProps<RazorpayNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: RAZORPAY_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchRazorpayRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: RazorpayFormValues) => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id === props.id) {
          return {
            ...node,
            data: {
              ...node.data,
              ...values,
            },
          };
        }
        return node;
      }),
    );
  };

  const nodeData = props.data;
  const description = nodeData?.variableName
    ? `Result → ${nodeData.variableName}`
    : "Not configured";

  return (
    <>
      <RazorpayDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={CreditCardIcon}
        name="Razorpay"
        status={nodeStatus}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

RazorpayNode.displayName = "RazorpayNode";
