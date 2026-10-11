import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";
import {
  getDatabaseNotConfiguredMessage,
  getSocialProviderNotConfiguredMessage,
  isDatabaseConfigured,
  isSocialProviderConfigured,
  type SocialProviderId,
} from "@/lib/auth-config";

const handler = toNextJsHandler(auth);

const DATABASE_ERROR_FALLBACK =
  "Authentication failed due to a server database error. Verify DATABASE_URL is reachable and migrations are applied.";

function isSocialProviderId(value: unknown): value is SocialProviderId {
  return value === "github" || value === "google";
}

async function normalizeServerErrorResponse(
  response: Response,
): Promise<Response> {
  if (response.status < 500) {
    return response;
  }

  const text = await response.clone().text();
  if (text.trim().length > 0) {
    return response;
  }

  return Response.json(
    {
      code: isDatabaseConfigured()
        ? "AUTH_SERVER_ERROR"
        : "DATABASE_NOT_CONFIGURED",
      message: isDatabaseConfigured()
        ? DATABASE_ERROR_FALLBACK
        : getDatabaseNotConfiguredMessage(),
    },
    { status: response.status },
  );
}

export async function GET(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  if (!isDatabaseConfigured()) {
    if (pathname.endsWith("/get-session")) {
      return Response.json(null, { status: 200 });
    }

    return Response.json(
      {
        code: "DATABASE_NOT_CONFIGURED",
        message: getDatabaseNotConfiguredMessage(),
      },
      { status: 503 },
    );
  }

  try {
    const response = await handler.GET(request);
    return await normalizeServerErrorResponse(response);
  } catch {
    return Response.json(
      {
        code: "AUTH_SERVER_ERROR",
        message: DATABASE_ERROR_FALLBACK,
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;

  if (pathname.endsWith("/sign-in/social")) {
    try {
      const body = (await request.clone().json()) as { provider?: unknown };
      if (
        isSocialProviderId(body?.provider) &&
        !isSocialProviderConfigured(body.provider)
      ) {
        return Response.json(
          {
            code: "OAUTH_NOT_CONFIGURED",
            message: getSocialProviderNotConfiguredMessage(body.provider),
          },
          { status: 503 },
        );
      }
    } catch {
      // Allow downstream handler to validate malformed JSON payloads
    }
  }

  if (!isDatabaseConfigured()) {
    return Response.json(
      {
        code: "DATABASE_NOT_CONFIGURED",
        message: getDatabaseNotConfiguredMessage(),
      },
      { status: 503 },
    );
  }

  try {
    const response = await handler.POST(request);
    return await normalizeServerErrorResponse(response);
  } catch {
    return Response.json(
      {
        code: "AUTH_SERVER_ERROR",
        message: DATABASE_ERROR_FALLBACK,
      },
      { status: 503 },
    );
  }
}
