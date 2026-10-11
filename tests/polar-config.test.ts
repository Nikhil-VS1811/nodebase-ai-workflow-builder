import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
  getPolarProProductId,
  getPolarServer,
  isPolarConfigured,
} from "../src/lib/polar";

describe("Polar Billing Configuration & Environment Validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.POLAR_SERVER;
    delete process.env.POLAR_PRODUCT_ID_PRO;
    delete process.env.POLAR_ACCESS_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("getPolarServer", () => {
    test("defaults to 'sandbox' when POLAR_SERVER is unset", () => {
      delete process.env.POLAR_SERVER;
      assert.equal(getPolarServer(), "sandbox");
    });

    test("defaults to 'sandbox' when POLAR_SERVER is empty or whitespace", () => {
      process.env.POLAR_SERVER = "   ";
      assert.equal(getPolarServer(), "sandbox");
    });

    test("accepts 'sandbox' case-insensitively", () => {
      process.env.POLAR_SERVER = "SANDBOX";
      assert.equal(getPolarServer(), "sandbox");
    });

    test("accepts 'production' case-insensitively", () => {
      process.env.POLAR_SERVER = "Production";
      assert.equal(getPolarServer(), "production");
    });

    test("throws descriptive error for invalid server values", () => {
      process.env.POLAR_SERVER = "staging";
      assert.throws(
        () => getPolarServer(),
        /Invalid POLAR_SERVER configuration: 'staging'/i,
      );
    });
  });

  describe("getPolarProProductId", () => {
    test("returns sandbox fallback UUID when unset in sandbox mode", () => {
      delete process.env.POLAR_SERVER;
      delete process.env.POLAR_PRODUCT_ID_PRO;
      assert.equal(
        getPolarProProductId(),
        "f81be8a8-45e1-4e45-a1e9-b9d3fd79f814",
      );
    });

    test("returns configured POLAR_PRODUCT_ID_PRO when provided", () => {
      process.env.POLAR_PRODUCT_ID_PRO = "prod_custom_uuid_12345";
      assert.equal(getPolarProProductId(), "prod_custom_uuid_12345");
    });

    test("throws error in production mode if POLAR_PRODUCT_ID_PRO is missing", () => {
      process.env.POLAR_SERVER = "production";
      delete process.env.POLAR_PRODUCT_ID_PRO;
      assert.throws(
        () => getPolarProProductId(),
        /POLAR_PRODUCT_ID_PRO is required when POLAR_SERVER is set to 'production'/i,
      );
    });

    test("returns custom product ID in production mode when provided", () => {
      process.env.POLAR_SERVER = "production";
      process.env.POLAR_PRODUCT_ID_PRO = "prod_pro_plan_uuid_999";
      assert.equal(getPolarProProductId(), "prod_pro_plan_uuid_999");
    });
  });

  describe("isPolarConfigured", () => {
    test("returns false when POLAR_ACCESS_TOKEN is unset", () => {
      delete process.env.POLAR_ACCESS_TOKEN;
      assert.equal(isPolarConfigured(), false);
    });

    test("returns false when POLAR_ACCESS_TOKEN is empty or whitespace", () => {
      process.env.POLAR_ACCESS_TOKEN = "   ";
      assert.equal(isPolarConfigured(), false);
    });

    test("returns true when POLAR_ACCESS_TOKEN is non-empty", () => {
      process.env.POLAR_ACCESS_TOKEN = "polar_at_test123";
      assert.equal(isPolarConfigured(), true);
    });
  });
});
