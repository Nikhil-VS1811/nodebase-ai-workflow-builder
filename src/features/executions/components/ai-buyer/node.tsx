"use client";

import { useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { ShoppingBagIcon } from "lucide-react";
import { memo, useState } from "react";
import { BaseExecutionNode } from "../base-execution-node";
import { useNodeStatus } from "../../hooks/use-node-status";
import { AI_BUYER_CHANNEL_NAME } from "@/inngest/channels/ai-buyer";
import { fetchAiBuyerRealtimeToken } from "./actions";
import { AiBuyerDialog, type AiBuyerFormValues } from "./dialog";

type AiBuyerNodeData = {
  inputKey?: string;
  outputKey?: string;
};

type AiBuyerNodeType = Node<AiBuyerNodeData>;

export const AiBuyerNode = memo((props: NodeProps<AiBuyerNodeType>) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { setNodes } = useReactFlow();

  const nodeStatus = useNodeStatus({
    nodeId: props.id,
    channel: AI_BUYER_CHANNEL_NAME,
    topic: "status",
    refreshToken: fetchAiBuyerRealtimeToken,
  });

  const handleOpenSettings = () => setDialogOpen(true);

  const handleSubmit = (values: AiBuyerFormValues) => {
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
  const inputKey = nodeData?.inputKey || "userMessage";
  const outputKey = nodeData?.outputKey || "transactionIntent";
  const description = `${inputKey} → ${outputKey}`;

  return (
    <>
      <AiBuyerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        defaultValues={nodeData}
      />
      <BaseExecutionNode
        {...props}
        id={props.id}
        icon={ShoppingBagIcon}
        name="AI Buyer"
        status={nodeStatus}
        description={description}
        onSettings={handleOpenSettings}
        onDoubleClick={handleOpenSettings}
      />
    </>
  );
});

AiBuyerNode.displayName = "AiBuyerNode";
