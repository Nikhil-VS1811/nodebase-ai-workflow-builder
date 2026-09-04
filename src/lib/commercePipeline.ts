import {
  type TransactionIntent,
  type HumanApprovalRecord,
  type PolicyEvaluationResult,
  type PolicyConfig,
  validateHumanApproval,
  evaluatePolicy,
} from "@/lib/policyEngine";
import agentPolicy from "@/config/agentPolicy.json";
import { policyGateExecutor } from "@/features/executions/components/policy-gate/executor";
import { razorpayExecutor } from "@/features/executions/components/razorpay/executor";
import { getRazorpayCallCount, getRazorpayMockHandler } from "@/lib/razorpayInstrumentation";
import { encrypt } from "@/lib/encryption";
import { buildDecisionReceipt, type DecisionReceipt } from "@/lib/decisionReceipt";

/**
 * Phase 13.3A: Canonical Commerce Execution Pipeline
 *
 * UNIFIED EXECUTION PIPELINE FOR ALL COMMERCE TRANSACTIONS.
 *
 * Owns the execution orchestration of:
 * Trusted TransactionIntent
 *     ↓
 * Existing Policy Gate (policyGateExecutor)
 *     ↓
 * Existing Human Approval handling (APPROVED_BY_HUMAN)
 *     ↓
 * Existing Authorization Boundary (policyEvaluation.allowed === true)
 *     ↓
 * Existing PaymentOrder persistence & Idempotency
 *     ↓
 * Existing Razorpay Executor (razorpayExecutor)
 *     ↓
 * Existing Decision Receipt (buildDecisionReceipt) & SHA-256 Seal
 *
 * CRITICAL SAFETY INVARIANTS:
 * 1. ZERO SHORTCUTS: If policy is ESCALATED (without approval) or DENIED, Razorpay calls MUST be 0.
 * 2. ONE PIPELINE: Direct purchases, accepted recommendations, and test workflows all share
 *    this canonical execution sequencing.
 */

export interface CommercePipelineInput {
  transactionIntent: TransactionIntent;
  userId?: string;
  humanApproval?: HumanApprovalRecord;
  idempotencyKey?: string;
  credentialId?: string;
  step?: any;
  publish?: any;
  workflowId?: string;
  executionId?: string;
}

export interface CommercePipelineResult {
  status: "SUCCESS" | "PENDING_APPROVAL" | "DENIED" | "FAILED";
  policyDecision: "APPROVED" | "ESCALATED" | "DENIED";
  allowed: boolean;
  razorpayCallCount: number;
  razorpayOrder?: any;
  decisionReceipt?: DecisionReceipt | null;
  failureReason?: string;
  executionId?: string;
  context: Record<string, any>;
}

/**
 * Executes a trusted TransactionIntent through the canonical commerce safety pipeline.
 */
export async function executeCommercePipeline(
  input: CommercePipelineInput,
): Promise<CommercePipelineResult> {
  const {
    transactionIntent,
    userId = "user_commerce_pipeline",
    humanApproval,
    idempotencyKey,
    credentialId = "cred_pipeline_default",
    workflowId = "wf_commerce_pipeline",
    executionId = `exec_${Date.now()}`,
    publish,
    step,
  } = input;

  if (!transactionIntent || typeof transactionIntent !== "object") {
    return {
      status: "FAILED",
      policyDecision: "DENIED",
      allowed: false,
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: "Missing or invalid TransactionIntent",
      context: {},
    };
  }

  // 1. Setup execution context and step/publish delegates
  const effectiveIdempotencyKey =
    idempotencyKey || `idem_${executionId}_${transactionIntent.productId || "tx"}`;
  const mockPublish = publish || (async () => {});
  const mockStep = step || {
    run: async (name: string, fn: () => Promise<any>) => {
      if (name.startsWith("payment-order-init-")) {
        return {
          id: `po_${executionId}`,
          executionId,
          nodeId: "razorpay_node",
          idempotencyKey: effectiveIdempotencyKey,
          razorpayOrderId: null,
          status: "PENDING",
          amount: transactionIntent.amount,
          currency: transactionIntent.currency,
        };
      }
      if (name.startsWith("get-credential-")) {
        const dbRecord = await fn().catch(() => null);
        if (dbRecord) {
          return dbRecord;
        }
        if (getRazorpayMockHandler()) {
          return {
            id: credentialId,
            name: "Pipeline Test Credential",
            type: "RAZORPAY",
            value: encrypt("rzp_test_mock_id:rzp_test_mock_secret"),
          };
        }
        return null;
      }
      return fn();
    },
  };

  const context: Record<string, any> = {
    transactionIntent,
    idempotencyKey: effectiveIdempotencyKey,
    executionId,
    workflowId,
  };

  // If human approval is attached (resumed flow), configure policyEvaluation for resumption
  if (humanApproval && humanApproval.approved && humanApproval.decision === "APPROVED_BY_HUMAN") {
    const approvalCheck = validateHumanApproval(humanApproval);
    if (!approvalCheck.valid) {
      return {
        status: "DENIED",
        policyDecision: "DENIED",
        allowed: false,
        razorpayCallCount: getRazorpayCallCount(),
        failureReason: `Human approval is invalid or expired: ${approvalCheck.reason}`,
        context: {},
      };
    }

    context.policyEvaluation = {
      decision: "ESCALATED",
      status: "ESCALATED",
      allowed: true,
      riskLevel: "MEDIUM",
      riskScore: "MEDIUM",
      reason: "Approved by authorized human operator",
      reasons: ["Approved by authorized human operator"],
      untrustedInputDetected: false,
      timestamp: new Date().toISOString(),
      humanApproval,
    };
  }

  // 2. Pass through the EXISTING Policy Gate
  let policyContext: Record<string, any>;
  try {
    policyContext = await policyGateExecutor({
      data: { intentKey: "transactionIntent" },
      nodeId: "policy_gate_node",
      userId,
      context,
      step: mockStep,
      publish: mockPublish,
    });
  } catch (error: any) {
    const deniedEvaluation = evaluatePolicy(transactionIntent, agentPolicy as PolicyConfig);
    const failureReason = error?.message || deniedEvaluation.reason || "Policy Gate denied the transaction";

    const deniedContext: Record<string, any> = {
      ...context,
      policyEvaluation: deniedEvaluation,
      failureReason,
      allowed: false,
    };

    const decisionReceipt = buildDecisionReceipt({
      executionId,
      workflowId,
      context: deniedContext,
      finalOutcome: { status: "REJECTED", reason: failureReason, completedAt: new Date().toISOString() },
    });

    return {
      status: "DENIED",
      policyDecision: "DENIED",
      allowed: false,
      razorpayCallCount: getRazorpayCallCount(),
      failureReason,
      executionId,
      decisionReceipt,
      context: {
        ...deniedContext,
        decisionReceipt,
      },
    };
  }

  const policyEval = policyContext.policyEvaluation as PolicyEvaluationResult;

  // 3. Check for ESCALATION (Pending Human Approval)
  if (
    (policyEval.decision === "ESCALATED" || policyContext.__pendingApproval === true) &&
    (!policyEval.humanApproval || !policyEval.humanApproval.approved)
  ) {
    return {
      status: "PENDING_APPROVAL",
      policyDecision: "ESCALATED",
      allowed: false,
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: "Transaction exceeds policy limit and requires human approval",
      executionId,
      context: policyContext,
    };
  }

  // 4. Check for DENIAL or unauthorized state
  if (policyEval.decision === "DENIED" || !policyEval.allowed) {
    const failureReason = policyEval.reason || policyEval.reasons?.join("; ");
    const decisionReceipt = buildDecisionReceipt({
      executionId,
      workflowId,
      context: policyContext,
      finalOutcome: { status: "REJECTED", reason: failureReason, completedAt: new Date().toISOString() },
    });

    return {
      status: "DENIED",
      policyDecision: policyEval.decision,
      allowed: false,
      razorpayCallCount: getRazorpayCallCount(),
      failureReason,
      executionId,
      decisionReceipt,
      context: {
        ...policyContext,
        decisionReceipt,
      },
    };
  }

  // 5. Pass through the EXISTING Razorpay Executor
  let rzpContext: Record<string, any>;
  try {
    rzpContext = await razorpayExecutor({
      data: { credentialId },
      nodeId: "razorpay_node",
      userId,
      context: policyContext,
      step: mockStep,
      publish: mockPublish,
    });
  } catch (error: any) {
    return {
      status: "FAILED",
      policyDecision: policyEval.decision,
      allowed: policyEval.allowed,
      razorpayCallCount: getRazorpayCallCount(),
      failureReason: error?.message || "Razorpay execution failed",
      executionId,
      context: policyContext,
    };
  }

  const order = rzpContext.razorpayResult || rzpContext.razorpayOrder;

  // 6. Generate Decision Receipt via the existing Phase 8 mechanism
  const decisionReceipt = buildDecisionReceipt({
    executionId,
    workflowId,
    context: rzpContext,
    finalOutcome: { status: "VERIFIED", completedAt: new Date().toISOString() },
  });

  const finalContext = {
    ...rzpContext,
    decisionReceipt,
  };

  return {
    status: "SUCCESS",
    policyDecision: policyEval.decision,
    allowed: true,
    razorpayCallCount: getRazorpayCallCount(),
    razorpayOrder: order,
    decisionReceipt,
    executionId,
    context: finalContext,
  };
}
