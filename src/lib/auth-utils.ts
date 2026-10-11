import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { buildAuthHref, sanitizeRedirectPath } from "./redirect-utils";

export const getOptionalSession = async () => {
  try {
    return await auth.api.getSession({
      headers: await headers(),
    });
  } catch {
    return null;
  }
};

export const requireAuth = async (redirectTo: string | null = "/workflows") => {
  const session = await getOptionalSession();

  if (!session) {
    redirect(redirectTo ? buildAuthHref("/login", redirectTo) : "/login");
  }

  return session;
};

export const requireUnauth = async (redirectTo?: string | string[] | null) => {
  const session = await getOptionalSession();

  if (session) {
    redirect(sanitizeRedirectPath(redirectTo));
  }
};
