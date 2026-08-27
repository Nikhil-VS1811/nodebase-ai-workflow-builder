import { NonRetriableError } from "inngest";
import type { NodeExecutor } from "@/features/executions/types";
import {
  evaluatePolicy,
  type TransactionIntent,
  type PolicyConfig,
} from "@/lib/policyEngine";
import agentPolicy from "@/config/agentPolicy.json";

type PolicyGateData = {
  /** The key in the workflow context that holds the TransactionIntent object. */
  intentKey?: string;
};

export const policyGateExecutor: NodeExecutor<PolicyGateData> = async ({
  data,
  nodeId,
  context,
  step,
}) => {
  const result = await step.run("policy-gate-evaluate", async () => {
    const intentKey = data.intentKey ?? "transactionIntent";
    const rawIntent = context[intentKey];

    if (!rawIntent || typeof rawIntent !== "object") {
      throw new NonRetriableError(
        `Policy Gate [${nodeId}]: No TransactionIntent found at context key "${intentKey}". ` +
          "Ensure an upstream node populates this field before the Policy Gate.",
      );
    }

    // Cast — the policy engine will surface any structural mismatches through
    // its own validation rules (e.g. unknown action → DENIED).
    const intent = rawIntent as TransactionIntent;
    const policy = agentPolicy as PolicyConfig;

    const evaluation = evaluatePolicy(intent, policy);

    if (!evaluation.allowed) {
      throw new NonRetriableError(
        `Policy Gate [${nodeId}]: Transaction DENIED. ` +
          `Status: ${evaluation.status} | Reason: ${evaluation.reason} | ` +
          `Risk: ${evaluation.riskScore} | ` +
          `Untrusted input detected: ${evaluation.untrustedInputDetected}`,
      );
    }

    return {
      policyEvaluation: evaluation,
    };
  });

  return {
    ...context,
    ...result,
  };
};
