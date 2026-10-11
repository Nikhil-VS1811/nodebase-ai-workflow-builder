export type SocialProviderId = "github" | "google";

type EnvMap = Record<string, string | undefined>;

const SOCIAL_PROVIDER_LABELS: Record<SocialProviderId, string> = {
  github: "GitHub",
  google: "Google",
};

const SOCIAL_PROVIDER_ENV_KEYS: Record<
  SocialProviderId,
  readonly [clientIdKey: string, clientSecretKey: string]
> = {
  github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
};

export function isDatabaseConfigured(env: EnvMap = process.env): boolean {
  return Boolean(env.DATABASE_URL?.trim());
}

export function isSocialProviderConfigured(
  provider: SocialProviderId,
  env: EnvMap = process.env,
): boolean {
  const [clientIdKey, clientSecretKey] = SOCIAL_PROVIDER_ENV_KEYS[provider];
  return Boolean(env[clientIdKey]?.trim() && env[clientSecretKey]?.trim());
}

export function getSocialProvidersConfig(env: EnvMap = process.env) {
  const providers: {
    github?: { clientId: string; clientSecret: string };
    google?: { clientId: string; clientSecret: string };
  } = {};

  const githubClientId = env.GITHUB_CLIENT_ID?.trim();
  const githubClientSecret = env.GITHUB_CLIENT_SECRET?.trim();
  if (githubClientId && githubClientSecret) {
    providers.github = {
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    };
  }

  const googleClientId = env.GOOGLE_CLIENT_ID?.trim();
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  if (googleClientId && googleClientSecret) {
    providers.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    };
  }

  return providers;
}

export function getDatabaseNotConfiguredMessage(): string {
  return "Authentication is unavailable: DATABASE_URL is not configured on the server.";
}

export function getSocialProviderNotConfiguredMessage(
  provider: SocialProviderId,
  env: EnvMap = process.env,
): string {
  const label = SOCIAL_PROVIDER_LABELS[provider];
  const [clientIdKey, clientSecretKey] = SOCIAL_PROVIDER_ENV_KEYS[provider];

  if (!isDatabaseConfigured(env)) {
    return `${label} OAuth is unavailable: ${clientIdKey}, ${clientSecretKey}, and DATABASE_URL are not configured on the server.`;
  }

  return `${label} OAuth is not configured on the server. Set ${clientIdKey} and ${clientSecretKey}.`;
}

export function getAuthErrorMessage(
  ctx:
    | {
        error?: {
          message?: string | null;
          statusText?: string | null;
        } | null;
      }
    | null
    | undefined,
  fallback = "Authentication failed. Please try again.",
): string {
  const message = ctx?.error?.message?.trim();
  if (message) {
    return message;
  }

  const statusText = ctx?.error?.statusText?.trim();
  if (statusText) {
    return statusText;
  }

  return fallback;
}
