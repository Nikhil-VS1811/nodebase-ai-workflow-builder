import { Button } from "@/components/ui/button";
import { useExecuteWorkflow, useUpdateWorkflow } from "@/features/workflows/hooks/use-workflows";
import { FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { useAtomValue } from "jotai";
import { editorAtom } from "../store/atoms";

export const ExecuteWorkflowButton = ({
  workflowId,
}: {
  workflowId: string;
}) => {
  const editor = useAtomValue(editorAtom);
  const executeWorkflow = useExecuteWorkflow();
  const updateWorkflow = useUpdateWorkflow();

  const isPending = executeWorkflow.isPending || updateWorkflow.isPending;

  const handleExecute = async () => {
    try {
      if (editor) {
        const nodes = editor.getNodes();
        const edges = editor.getEdges();
        await updateWorkflow.mutateAsync({
          id: workflowId,
          nodes,
          edges,
        });
      }
      await executeWorkflow.mutateAsync({ id: workflowId });
    } catch {
      // Errors handled by mutation callbacks/toasts
    }
  };

  return (
    <Button size="lg" onClick={handleExecute} disabled={isPending}>
      {isPending ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <FlaskConicalIcon className="size-4" />
      )}
      Execute workflow
    </Button>
  );
};
