import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useExecutionsParams } from "./use-executions-params";

/**
 * Hook to fetch all executions using suspense
 */
export const useSuspenseExecutions = () => {
  const trpc = useTRPC();
  const [params] = useExecutionsParams();

  return useSuspenseQuery(trpc.executions.getMany.queryOptions(params));
};

/**
 * Hook to fetch a single execution using suspense
 */
export const useSuspenseExecution = (id: string) => {
  const trpc = useTRPC();
  return useSuspenseQuery(trpc.executions.getOne.queryOptions({ id }));
};

/**
 * Hook to approve an escalated execution
 */
export const useApproveExecution = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.executions.approve.mutationOptions({
      onSuccess: (data) => {
        toast.success("Transaction approved successfully. Resuming workflow.");
        queryClient.invalidateQueries(trpc.executions.getMany.queryOptions({}));
        queryClient.invalidateQueries(
          trpc.executions.getOne.queryOptions({ id: data.id }),
        );
      },
      onError: (error) => {
        toast.error(`Failed to approve transaction: ${error.message}`);
      },
    }),
  );
};

/**
 * Hook to reject an escalated execution
 */
export const useRejectExecution = () => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return useMutation(
    trpc.executions.reject.mutationOptions({
      onSuccess: (data) => {
        toast.error("Transaction rejected. Workflow halted permanently.");
        queryClient.invalidateQueries(trpc.executions.getMany.queryOptions({}));
        queryClient.invalidateQueries(
          trpc.executions.getOne.queryOptions({ id: data.id }),
        );
      },
      onError: (error) => {
        toast.error(`Failed to reject transaction: ${error.message}`);
      },
    }),
  );
};
