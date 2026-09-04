import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import {
  evaluatePolicy,
  validateHumanApproval,
  type TransactionIntent,
  type PolicyConfig,
  type PolicyEvaluationResult,
} from "@/lib/policyEngine";
import agentPolicy from "@/config/agentPolicy.json";
import { policyGateChannel } from "@/inngest/channels/policy-gate";

type PolicyGateData = {
  /** The key in the workflow context that holds the TransactionIntent object. */
  intentKey?: string;
};

export const policyGateExecutor: NodeExecutor<PolicyGateData> = async ({
  data,
  nodeId,
  context,
  step,
  publish,
}) => {
  await publish(
    policyGateChannel().status({
      nodeId,
      status: "loading",
    }),
  );

  try {
    const result = await step.run(`policy-gate-evaluate-${nodeId}`, async () => {
      const intentKey = data.intentKey ?? "transactionIntent";
      const rawIntent = context[intentKey];

      if (!rawIntent || typeof rawIntent !== "object") {
        throw new NonRetriableError(
          `Policy Gate [${nodeId}]: No TransactionIntent found at context key "${intentKey}". ` +
            "Ensure an upstream node populates this field before the Policy Gate.",
        );
      }

      const intent = rawIntent as TransactionIntent;
      const policy = agentPolicy as PolicyConfig;

      // 1. Check if human approval was already granted in workflow context (resumed flow)
      const existingEvaluation = context.policyEvaluation as PolicyEvaluationResult | undefined;
      if (
        existingEvaluation &&
        existingEvaluation.decision === "ESCALATED" &&
        existingEvaluation.humanApproval?.approved === true &&
        existingEvaluation.humanApproval?.decision === "APPROVED_BY_HUMAN"
      ) {
        const approvalCheck = validateHumanApproval(existingEvaluation.humanApproval);
        if (!approvalCheck.valid) {
          throw new NonRetriableError(
            `Policy Gate [${nodeId}]: Human approval is invalid or expired. Reason: ${approvalCheck.reason}`,
          );
        }

        return {
          policyEvaluation: {
            ...existingEvaluation,
            allowed: true, // Approved by authorized human
          },
        };
      }

      // 2. Perform automated policy evaluation
      const evaluation = evaluatePolicy(intent, policy);

      // Handle DENIED state
      if (evaluation.decision === "DENIED" || evaluation.status === "DENIED") {
        throw new NonRetriableError(
          `Policy Gate [${nodeId}]: Transaction DENIED. ` +
            `Status: ${evaluation.status} | Reason: ${evaluation.reason} | ` +
            `Risk: ${evaluation.riskScore} | ` +
            `Untrusted input detected: ${evaluation.untrustedInputDetected}`,
        );
      }

      // Handle ESCALATED state: Mark as pending approval so execution runner halts before financial action
      if (evaluation.decision === "ESCALATED" || evaluation.status === "ESCALATED") {
        return {
          policyEvaluation: evaluation,
          __pendingApproval: true,
        };
      }

      // Handle unexpected non-APPROVED state
      if (evaluation.decision !== "APPROVED" || !evaluation.allowed) {
        throw new NonRetriableError(
          `Policy Gate [${nodeId}]: Transaction not approved. Decision: ${evaluation.decision}`,
        );
      }

      return {
        policyEvaluation: evaluation,
      };
    });

    const isPending = (result as any).__pendingApproval === true;

    await publish(
      policyGateChannel().status({
        nodeId,
        status: isPending ? "loading" : "success",
      }),
    );

    return {
      ...context,
      ...result,
    };
  } catch (error) {
    await publish(
      policyGateChannel().status({
        nodeId,
        status: "error",
      }),
    );
    throw error;
  }
};
