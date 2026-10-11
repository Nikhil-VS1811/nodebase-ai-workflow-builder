export const DEFAULT_AUTH_REDIRECT = "/workflows";

const INTERNAL_BASE_ORIGIN = "http://nodebase.local";

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function hasDotSegments(pathWithQuery: string): boolean {
  const pathnameOnly = pathWithQuery.split(/[?#]/, 1)[0] ?? "";
  return pathnameOnly
    .split("/")
    .some((segment) => segment === "." || segment === "..");
}

function isDisallowedAuthOrApiPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/signup" ||
    pathname.startsWith("/signup/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

/**
 * Validates and normalizes an internal redirect path.
 * Rejects external URLs, protocol-relative URLs, backslashes, path traversal,
 * and auth/API loop paths, falling back to `/workflows`.
 */
export function sanitizeRedirectPath(
  rawRedirect?: string | string[] | null,
  fallback: string = DEFAULT_AUTH_REDIRECT,
): string {
  const value = Array.isArray(rawRedirect) ? rawRedirect[0] : rawRedirect;
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (
    !trimmed ||
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    hasControlCharacters(trimmed) ||
    hasDotSegments(trimmed)
  ) {
    return fallback;
  }

  try {
    const decodedOnce = decodeURIComponent(trimmed);
    if (
      !decodedOnce.startsWith("/") ||
      decodedOnce.startsWith("//") ||
      decodedOnce.includes("\\") ||
      hasControlCharacters(decodedOnce) ||
      hasDotSegments(decodedOnce)
    ) {
      return fallback;
    }
  } catch {
    return fallback;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, INTERNAL_BASE_ORIGIN);
  } catch {
    return fallback;
  }

  if (
    parsed.origin !== INTERNAL_BASE_ORIGIN ||
    parsed.protocol !== "http:" ||
    parsed.host !== "nodebase.local" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    !parsed.pathname.startsWith("/") ||
    parsed.pathname.startsWith("//") ||
    parsed.pathname.includes("\\")
  ) {
    return fallback;
  }

  if (isDisallowedAuthOrApiPath(parsed.pathname)) {
    return fallback;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function resolveRedirectParam(
  searchParams?:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | null,
  fallback: string = DEFAULT_AUTH_REDIRECT,
): string {
  if (!searchParams) {
    return fallback;
  }

  const keys = ["redirect", "callbackUrl", "callbackURL", "returnTo"] as const;

  if (searchParams instanceof URLSearchParams) {
    for (const key of keys) {
      const candidate = searchParams.get(key);
      if (candidate !== null) {
        return sanitizeRedirectPath(candidate, fallback);
      }
    }
    return fallback;
  }

  for (const key of keys) {
    const candidate = searchParams[key];
    if (candidate !== undefined) {
      return sanitizeRedirectPath(candidate, fallback);
    }
  }

  return fallback;
}

export function resolveClientRedirectPath(
  redirectTo?: string | null,
  locationSearch?: string,
): string {
  if (redirectTo !== undefined && redirectTo !== null) {
    return sanitizeRedirectPath(redirectTo);
  }

  const search =
    locationSearch ??
    (typeof window !== "undefined" ? window.location.search : "");
  if (search) {
    return resolveRedirectParam(new URLSearchParams(search));
  }

  return DEFAULT_AUTH_REDIRECT;
}

export function buildAuthHref(
  authPath: "/login" | "/signup",
  redirectTarget?: string | null,
): string {
  const safeRedirect = sanitizeRedirectPath(redirectTarget);
  if (/^\/[A-Za-z0-9/_-]*$/.test(safeRedirect)) {
    return `${authPath}?redirect=${safeRedirect}`;
  }
  return `${authPath}?redirect=${encodeURIComponent(safeRedirect)}`;
}

export function getGetStartedHref(
  isAuthenticated: boolean,
  redirectTarget: string = DEFAULT_AUTH_REDIRECT,
): string {
  const safeRedirect = sanitizeRedirectPath(redirectTarget);
  if (isAuthenticated) {
    return safeRedirect;
  }
  return buildAuthHref("/signup", safeRedirect);
}

export function getSignInHref(
  redirectTarget: string = DEFAULT_AUTH_REDIRECT,
): string {
  return buildAuthHref("/login", redirectTarget);
}
