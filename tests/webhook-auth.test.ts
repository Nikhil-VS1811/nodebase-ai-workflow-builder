import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

function computeStripeHeader(secret: string, payload: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payload}`;
  const sig = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

import { verifyStripeSignature, verifyGoogleFormSecret } from "../src/lib/webhook-verification";

describe("Webhook Authentication & Validation", () => {
  const secret = "whsec_test_secret_key_1234567890";
  const rawBody = JSON.stringify({ id: "evt_test123", type: "payment_intent.succeeded" });

  describe("Stripe Signature Verification", () => {
    test("accepts valid signature within tolerance window", () => {
      const now = Math.floor(Date.now() / 1000);
      const header = computeStripeHeader(secret, rawBody, now);
      const isValid = verifyStripeSignature(rawBody, header, secret);
      assert.equal(isValid, true);
    });

    test("rejects tampered payload", () => {
      const now = Math.floor(Date.now() / 1000);
      const header = computeStripeHeader(secret, rawBody, now);
      const tamperedBody = JSON.stringify({ id: "evt_test123", type: "charge.refunded" });
      const isValid = verifyStripeSignature(tamperedBody, header, secret);
      assert.equal(isValid, false);
    });

    test("rejects expired timestamp (replay attack > 300s)", () => {
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 301;
      const header = computeStripeHeader(secret, rawBody, expiredTimestamp);
      const isValid = verifyStripeSignature(rawBody, header, secret);
      assert.equal(isValid, false);
    });

    test("rejects future timestamp outside tolerance", () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 305;
      const header = computeStripeHeader(secret, rawBody, futureTimestamp);
      const isValid = verifyStripeSignature(rawBody, header, secret);
      assert.equal(isValid, false);
    });

    test("rejects malformed signature header without v1 or t", () => {
      assert.equal(verifyStripeSignature(rawBody, "invalid_header", secret), false);
      assert.equal(verifyStripeSignature(rawBody, "t=12345", secret), false);
      assert.equal(verifyStripeSignature(rawBody, "v1=abcde", secret), false);
      assert.equal(verifyStripeSignature(rawBody, "", secret), false);
    });

    test("rejects signature signed with different secret", () => {
      const now = Math.floor(Date.now() / 1000);
      const wrongHeader = computeStripeHeader("whsec_wrong_key", rawBody, now);
      const isValid = verifyStripeSignature(rawBody, wrongHeader, secret);
      assert.equal(isValid, false);
    });
  });

  describe("Google Form Secret Verification", () => {
    const gfSecret = "my_super_secret_form_token_456";

    test("accepts matching secret token", () => {
      assert.equal(verifyGoogleFormSecret(gfSecret, gfSecret), true);
    });

    test("rejects mismatched secret token", () => {
      assert.equal(verifyGoogleFormSecret("wrong_token", gfSecret), false);
    });

    test("rejects different length token without throwing", () => {
      assert.equal(verifyGoogleFormSecret("short", gfSecret), false);
      assert.equal(verifyGoogleFormSecret(gfSecret + "_extra", gfSecret), false);
    });

    test("rejects empty token", () => {
      assert.equal(verifyGoogleFormSecret("", gfSecret), false);
    });
  });
});
