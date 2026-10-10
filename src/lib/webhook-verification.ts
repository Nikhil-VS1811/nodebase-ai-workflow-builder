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

export function verifyGoogleFormSecret(provided: string, expected: string): boolean {
  try {
    const providedBuffer = Buffer.from(provided, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");
    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

export interface GoogleFormAuthResult {
  authorized: boolean;
  error?: string;
  status?: number;
}

/**
 * Validates Google Form webhook authentication.
 * In production, GOOGLE_FORM_WEBHOOK_SECRET is mandatory; if missing, returns status 500.
 * In local development, if GOOGLE_FORM_WEBHOOK_SECRET is omitted, requests are permitted.
 * When GOOGLE_FORM_WEBHOOK_SECRET is present, the caller must supply a matching secret token (status 401 if invalid).
 */
export function validateGoogleFormWebhookAuth(
  providedSecret: string | null | undefined,
  configuredSecret: string | undefined,
  isProduction: boolean,
): GoogleFormAuthResult {
  if (!configuredSecret) {
    if (isProduction) {
      return {
        authorized: false,
        error: "Google Form webhook secret is not configured in production",
        status: 500,
      };
    }
    return { authorized: true };
  }

  if (!providedSecret || !verifyGoogleFormSecret(providedSecret, configuredSecret)) {
    return {
      authorized: false,
      error: "Unauthorized: Invalid or missing webhook secret",
      status: 401,
    };
  }

  return { authorized: true };
}
