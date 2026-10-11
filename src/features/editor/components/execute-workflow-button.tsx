import { useAtomValue } from "jotai";
import { FlaskConicalIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  isDemoWorkflow,
  saveGuestWorkflow,
} from "@/features/workflows/guest-workflow";
import {
  useExecuteWorkflow,
  useUpdateWorkflow,
} from "@/features/workflows/hooks/use-workflows";
import { editorAtom } from "../store/atoms";

export const ExecuteWorkflowButton = ({
  workflowId,
}: {
  workflowId: string;
}) => {
  const isGuest = isDemoWorkflow(workflowId);
  const editor = useAtomValue(editorAtom);
  const executeWorkflow = useExecuteWorkflow();
  const updateWorkflow = useUpdateWorkflow();

  const isPending =
    !isGuest && (executeWorkflow.isPending || updateWorkflow.isPending);

  const handleExecute = async () => {
    if (isGuest) {
      if (editor) {
        const nodes = editor.getNodes();
        const edges = editor.getEdges();
        saveGuestWorkflow({ nodes, edges });
      }
      toast.info("Cloud execution requires a free account", {
        description:
          "Sign in or create an account to run workflows with live webhooks and AI integrations.",
        action: {
          label: "Sign In",
          onClick: () => {
            window.location.href = "/login?redirect=/workflows";
          },
        },
      });
      return;
    }

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
