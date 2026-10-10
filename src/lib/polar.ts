import { Polar } from "@polar-sh/sdk";

export type PolarServer = "sandbox" | "production";

/**
 * Resolves the Polar environment. Defaults to "sandbox" for safe local development.
 * Validates against allowed values ("sandbox" | "production") and throws on invalid configuration.
 */
export function getPolarServer(): PolarServer {
  const envServer = process.env.POLAR_SERVER?.trim().toLowerCase();
  if (!envServer) {
    return "sandbox";
  }
  if (envServer === "sandbox" || envServer === "production") {
    return envServer;
  }
  throw new Error(
    `Invalid POLAR_SERVER configuration: '${envServer}'. Allowed values are 'sandbox' or 'production'.`
  );
}

/**
 * Resolves the Polar Pro Product ID.
 * Returns the configured environment variable if present.
 * If unset in sandbox mode, falls back to the safe sandbox test product UUID.
 * Throws in production mode if POLAR_PRODUCT_ID_PRO is missing.
 */
export function getPolarProProductId(): string {
  const productId = process.env.POLAR_PRODUCT_ID_PRO?.trim();
  if (productId) {
    return productId;
  }
  const server = getPolarServer();
  if (server === "production") {
    throw new Error(
      "POLAR_PRODUCT_ID_PRO is required when POLAR_SERVER is set to 'production'."
    );
  }
  // Safe default for sandbox development if environment variable is not provided
  return "f81be8a8-45e1-4e45-a1e9-b9d3fd79f814";
}

export const polarClient = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN,
  server: getPolarServer(),
});
