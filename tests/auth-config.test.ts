import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GET, POST } from "../src/app/api/auth/[...all]/route";
import {
  getAuthErrorMessage,
  getDatabaseNotConfiguredMessage,
  getSocialProviderNotConfiguredMessage,
  getSocialProvidersConfig,
  isDatabaseConfigured,
  isSocialProviderConfigured,
} from "../src/lib/auth-config";

describe("auth configuration helpers", () => {
  it("detects whether DATABASE_URL is configured", () => {
    assert.equal(isDatabaseConfigured({}), false);
    assert.equal(isDatabaseConfigured({ DATABASE_URL: "   " }), false);
    assert.equal(
      isDatabaseConfigured({
        DATABASE_URL: "postgresql://localhost:5432/nodebase",
      }),
      true,
    );
  });

  it("detects whether GitHub and Google OAuth credentials are configured", () => {
    assert.equal(isSocialProviderConfigured("github", {}), false);
    assert.equal(
      isSocialProviderConfigured("github", { GITHUB_CLIENT_ID: "id-only" }),
      false,
    );
    assert.equal(
      isSocialProviderConfigured("github", {
        GITHUB_CLIENT_ID: "gh-id",
        GITHUB_CLIENT_SECRET: "gh-secret",
      }),
      true,
    );

    assert.equal(isSocialProviderConfigured("google", {}), false);
    assert.equal(
      isSocialProviderConfigured("google", {
        GOOGLE_CLIENT_SECRET: "sec-only",
      }),
      false,
    );
    assert.equal(
      isSocialProviderConfigured("google", {
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
      }),
      true,
    );
  });

  it("only registers social providers that have both clientId and clientSecret", () => {
    assert.deepEqual(getSocialProvidersConfig({}), {});
    assert.deepEqual(
      getSocialProvidersConfig({
        GITHUB_CLIENT_ID: "gh-id",
        GITHUB_CLIENT_SECRET: "gh-secret",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
      }),
      {
        github: {
          clientId: "gh-id",
          clientSecret: "gh-secret",
        },
      },
    );
  });

  it("formats clear missing-configuration messages without exposing secret values", () => {
    assert.match(getDatabaseNotConfiguredMessage(), /DATABASE_URL/);
    assert.match(
      getSocialProviderNotConfiguredMessage("github", {}),
      /GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and DATABASE_URL/,
    );
    assert.match(
      getSocialProviderNotConfiguredMessage("google", {
        DATABASE_URL: "postgresql://localhost:5432/nodebase",
      }),
      /GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET/,
    );
  });

  it("never returns an empty error string for toast notifications", () => {
    assert.equal(
      getAuthErrorMessage(
        { error: { message: "", statusText: "" } },
        "Fallback error",
      ),
      "Fallback error",
    );
    assert.equal(
      getAuthErrorMessage(
        { error: { message: "   ", statusText: "Service Unavailable" } },
        "Fallback error",
      ),
      "Service Unavailable",
    );
    assert.equal(
      getAuthErrorMessage(
        { error: { message: "Invalid email or password" } },
        "Fallback error",
      ),
      "Invalid email or password",
    );
  });
});

describe("/api/auth/[...all] route configuration guards", () => {
  it("returns 503 with DATABASE_NOT_CONFIGURED on email signup when DATABASE_URL is unset", async () => {
    const savedDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const response = await POST(
        new Request("http://localhost:3000/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: "user@example.com",
            email: "user@example.com",
            password: "Password123!",
          }),
        }),
      );
      assert.equal(response.status, 503);
      const payload = (await response.json()) as {
        code?: string;
        message?: string;
      };
      assert.equal(payload.code, "DATABASE_NOT_CONFIGURED");
      assert.match(payload.message ?? "", /DATABASE_URL/);
    } finally {
      if (savedDbUrl !== undefined) {
        process.env.DATABASE_URL = savedDbUrl;
      }
    }
  });

  it("returns 503 with OAUTH_NOT_CONFIGURED on social sign-in when provider credentials are unset", async () => {
    const savedGithubId = process.env.GITHUB_CLIENT_ID;
    const savedGithubSecret = process.env.GITHUB_CLIENT_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
    try {
      const response = await POST(
        new Request("http://localhost:3000/api/auth/sign-in/social", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: "github",
            callbackURL: "/workflows",
          }),
        }),
      );
      assert.equal(response.status, 503);
      const payload = (await response.json()) as {
        code?: string;
        message?: string;
      };
      assert.equal(payload.code, "OAUTH_NOT_CONFIGURED");
      assert.match(
        payload.message ?? "",
        /GITHUB_CLIENT_ID.*GITHUB_CLIENT_SECRET/,
      );
    } finally {
      if (savedGithubId !== undefined) {
        process.env.GITHUB_CLIENT_ID = savedGithubId;
      }
      if (savedGithubSecret !== undefined) {
        process.env.GITHUB_CLIENT_SECRET = savedGithubSecret;
      }
    }
  });

  it("returns 200 with null session on GET /api/auth/get-session when DATABASE_URL is unset", async () => {
    const savedDbUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const response = await GET(
        new Request("http://localhost:3000/api/auth/get-session", {
          method: "GET",
        }),
      );
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload, null);
    } finally {
      if (savedDbUrl !== undefined) {
        process.env.DATABASE_URL = savedDbUrl;
      }
    }
  });
});
