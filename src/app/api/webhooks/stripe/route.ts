import { sendWorkflowExecution } from "@/inngest/utils";
import prisma from "@/lib/db";
import { NodeType } from "@/generated/prisma";
import { type NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
  toleranceInSeconds = 300,
): boolean {
  try {
    const parts = signatureHeader.split(",");
    let timestamp: number | null = null;
    const signatures: string[] = [];

    for (const part of parts) {
      const [key, value] = part.trim().split("=");
      if (key === "t") {
        timestamp = parseInt(value, 10);
      } else if (key === "v1") {
        signatures.push(value);
      }
    }

    if (!timestamp || signatures.length === 0) {
      return false;
    }

    // Verify timestamp tolerance against replay attacks
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceInSeconds) {
      return false;
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(signedPayload, "utf8")
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    return signatures.some((sig) => {
      const sigBuffer = Buffer.from(sig, "hex");
      return (
        sigBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(sigBuffer, expectedBuffer)
      );
    });
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const workflowId = url.searchParams.get("workflowId");

    if (!workflowId) {
      return NextResponse.json(
        { success: false, error: "Missing required query parameter: workflowId" },
        { status: 400 },
      );
    }

    const signingSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!signingSecret) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      return NextResponse.json(
        { success: false, error: "Stripe webhook secret is not configured" },
        { status: 500 },
      );
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return NextResponse.json(
        { success: false, error: "Missing stripe-signature header" },
        { status: 401 },
      );
    }

    const rawBody = await request.text();
    const isValid = verifyStripeSignature(rawBody, signature, signingSecret);

    if (!isValid) {
      return NextResponse.json(
        { success: false, error: "Invalid Stripe signature" },
        { status: 401 },
      );
    }

    const body = JSON.parse(rawBody);

    // Verify target workflow exists and has an enabled Stripe trigger
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        nodes: {
          where: { type: NodeType.STRIPE_TRIGGER },
        },
      },
    });

    if (!workflow || workflow.nodes.length === 0) {
      return NextResponse.json(
        { success: false, error: "Workflow not found or does not have a Stripe trigger" },
        { status: 404 },
      );
    }

    const stripeData = {
      // Event metadata
      eventId: body.id,
      eventType: body.type,
      timestamp: body.created,
      livemode: body.livemode,
      raw: body.data?.object,
    };

    // Trigger an Inngest job
    await sendWorkflowExecution({
      workflowId,
      initialData: {
        stripe: stripeData,
      },
    });

    return NextResponse.json(
      { success: true },
      { status: 200 },
    );
  } catch (error) {
    console.error("Stripe webhook error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process Stripe event" },
      { status: 500 },
    );
  }
}
