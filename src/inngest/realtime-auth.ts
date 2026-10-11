import { getSubscriptionToken, type Realtime } from "@inngest/realtime";
import { headers } from "next/headers";
import { inngest } from "@/inngest/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export interface RealtimeTokenRequestOptions {
  nodeId?: string;
  workflowId?: string;
}

export interface RealtimeAuthSession {
  user: {
    id: string;
  };
}

export interface RealtimeAuthDependencies {
  getSession?: () => Promise<RealtimeAuthSession | null>;
  findWorkflowById?: (
    workflowId: string,
  ) => Promise<{ id: string; userId: string } | null>;
  findNodeById?: (nodeId: string) => Promise<{
    id: string;
    workflowId: string;
    workflow: { userId: string };
  } | null>;
  mintToken?: (args: {
    channel: Realtime.Channel;
    topics: ["status"];
  }) => Promise<{
    channel: Realtime.Channel;
    topics: ["status"];
    key?: string;
  }>;
}

export function buildUserScopedChannelId(
  baseChannelName: string,
  userId?: string,
): string {
  if (userId === undefined) {
    return baseChannelName;
  }
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error("Realtime channel requires a non-empty userId");
  }
  return `${baseChannelName}:${normalizedUserId}`;
}

export function matchesRealtimeChannel(
  messageChannel: string | undefined,
  expectedBaseChannel: string,
): boolean {
  if (!messageChannel) {
    return false;
  }
  return (
    messageChannel === expectedBaseChannel ||
    messageChannel.startsWith(`${expectedBaseChannel}:`)
  );
}

async function defaultGetSession(): Promise<RealtimeAuthSession | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return null;
  }

  return {
    user: {
      id: session.user.id,
    },
  };
}

async function defaultFindWorkflowById(workflowId: string) {
  return prisma.workflow.findUnique({
    where: { id: workflowId },
    select: {
      id: true,
      userId: true,
    },
  });
}

async function defaultFindNodeById(nodeId: string) {
  return prisma.node.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      workflowId: true,
      workflow: {
        select: {
          userId: true,
        },
      },
    },
  });
}

export async function authorizeRealtimeSubscription(
  options?: RealtimeTokenRequestOptions,
  deps?: RealtimeAuthDependencies,
): Promise<{ userId: string }> {
  const getSession = deps?.getSession ?? defaultGetSession;
  const findWorkflowById = deps?.findWorkflowById ?? defaultFindWorkflowById;
  const findNodeById = deps?.findNodeById ?? defaultFindNodeById;

  const session = await getSession();
  const userId = session?.user?.id?.trim();

  if (!userId) {
    throw new Error(
      "Unauthorized: Authentication required to subscribe to realtime workflow status",
    );
  }

  if (options?.workflowId !== undefined) {
    const workflowId = options.workflowId.trim();
    if (!workflowId) {
      throw new Error("Bad Request: workflowId cannot be empty");
    }

    const workflow = await findWorkflowById(workflowId);
    if (!workflow || workflow.userId !== userId) {
      throw new Error("Forbidden: You do not have access to this workflow");
    }
  }

  if (options?.nodeId !== undefined) {
    const nodeId = options.nodeId.trim();
    if (!nodeId) {
      throw new Error("Bad Request: nodeId cannot be empty");
    }

    const node = await findNodeById(nodeId);
    if (node) {
      if (node.workflow.userId !== userId) {
        throw new Error(
          "Forbidden: You do not have access to this workflow node",
        );
      }

      if (
        options.workflowId !== undefined &&
        node.workflowId !== options.workflowId.trim()
      ) {
        throw new Error(
          "Forbidden: Node does not belong to the specified workflow",
        );
      }
    }
  }

  return { userId };
}

export async function mintRealtimeSubscriptionToken<
  TChannelDef extends Realtime.Channel.Definition<(userId?: string) => string>,
>(
  channelDefinition: TChannelDef,
  options?: RealtimeTokenRequestOptions,
  deps?: RealtimeAuthDependencies,
): Promise<Realtime.Token<TChannelDef, ["status"]>> {
  const { userId } = await authorizeRealtimeSubscription(options, deps);
  const scopedChannel = channelDefinition(userId);

  if (!scopedChannel.name.endsWith(`:${userId}`)) {
    throw new Error(
      "Internal Error: Realtime subscription channel must be user-scoped",
    );
  }

  if (deps?.mintToken) {
    return (await deps.mintToken({
      channel: scopedChannel,
      topics: ["status"],
    })) as Realtime.Token<TChannelDef, ["status"]>;
  }

  const token = await getSubscriptionToken(inngest, {
    channel: scopedChannel,
    topics: ["status"],
  });

  return token as Realtime.Token<TChannelDef, ["status"]>;
}
