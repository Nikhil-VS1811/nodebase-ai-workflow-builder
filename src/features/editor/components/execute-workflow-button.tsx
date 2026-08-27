"use client";

import { Button } from "@/components/ui/button";
import { useUpdateWorkflow, useExecuteWorkflow } from "@/features/workflows/hooks/use-workflows";
import { editorAtom } from "@/features/editor/store/atoms";
import { useAtomValue } from "jotai";
import { FlaskConicalIcon } from "lucide-react";
import { toast } from "sonner";

export const ExecuteWorkflowButton = ({
  workflowId,
}: {
  workflowId: string;
}) => {
  const editor = useAtomValue(editorAtom);
  const saveWorkflow = useUpdateWorkflow();
  const executeWorkflow = useExecuteWorkflow();

  const isPending = saveWorkflow.isPending || executeWorkflow.isPending;

  const handleExecute = async () => {
    if (!editor) {
      toast.error("Editor not ready");
      return;
    }

    // Always flush the current canvas state to the DB before firing execution.
    // This guarantees that node.data (including the Manual Trigger's JSON
    // payload) reflects what the user sees on screen — not a stale saved copy.
    try {
      await saveWorkflow.mutateAsync({
        id: workflowId,
        nodes: editor.getNodes(),
        edges: editor.getEdges(),
      });
    } catch {
      // saveWorkflow already shows a toast on error; abort execution.
      return;
    }

    executeWorkflow.mutate({ id: workflowId });
  };

  return (
    <Button size="lg" onClick={handleExecute} disabled={isPending}>
      <FlaskConicalIcon className="size-4" />
      {saveWorkflow.isPending ? "Saving…" : "Execute workflow"}
    </Button>
  );
};
