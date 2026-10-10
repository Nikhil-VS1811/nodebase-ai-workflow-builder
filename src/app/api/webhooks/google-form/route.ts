import { sendWorkflowExecution } from "@/inngest/utils";
import prisma from "@/lib/db";
import { NodeType } from "@/generated/prisma";
import { type NextRequest, NextResponse } from "next/server";
import { validateGoogleFormWebhookAuth } from "@/lib/webhook-verification";

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

    // Enforce shared secret validation: mandatory in production, optional in local dev
    const configuredSecret = process.env.GOOGLE_FORM_WEBHOOK_SECRET;
    const isProduction = process.env.NODE_ENV === "production";
    const providedSecret =
      request.headers.get("x-webhook-secret") ||
      url.searchParams.get("secret") ||
      url.searchParams.get("token");

    const authResult = validateGoogleFormWebhookAuth(
      providedSecret,
      configuredSecret,
      isProduction,
    );

    if (!authResult.authorized) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: authResult.status || 401 },
      );
    }

    // Verify workflow exists and has a GOOGLE_FORM_TRIGGER node
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: {
        nodes: {
          where: { type: NodeType.GOOGLE_FORM_TRIGGER },
        },
      },
    });

    if (!workflow || workflow.nodes.length === 0) {
      return NextResponse.json(
        { success: false, error: "Workflow not found or does not have a Google Form trigger" },
        { status: 404 },
      );
    }

    const body = await request.json();

    const formData = {
      formId: body.formId,
      formTitle: body.formTitle,
      responseId: body.responseId,
      timestamp: body.timestamp,
      respondentEmail: body.respondentEmail,
      responses: body.responses,
      raw: body,
    };

    // Trigger an Inngest job
    await sendWorkflowExecution({
      workflowId,
      initialData: {
        googleForm: formData,
      },
    });

    return NextResponse.json(
      { success: true },
      { status: 200 },
    );
  } catch (error) {
    console.error("Google form webhook error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to process Google Form submission" },
      { status: 500 },
    );
  }
}
