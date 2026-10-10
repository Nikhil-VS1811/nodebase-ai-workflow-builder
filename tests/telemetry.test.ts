import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("Telemetry & Privacy Sanitization", () => {
  const rootDir = path.resolve(__dirname, "..");
  const serverConfigPath = path.join(rootDir, "sentry.server.config.ts");
  const edgeConfigPath = path.join(rootDir, "sentry.edge.config.ts");

  test("sentry.server.config.ts disables PII and AI inputs/outputs recording", () => {
    const content = fs.readFileSync(serverConfigPath, "utf-8");

    assert.ok(
      content.includes("recordInputs: false"),
      "recordInputs must be false to prevent sending prompts to Sentry",
    );
    assert.ok(
      content.includes("recordOutputs: false"),
      "recordOutputs must be false to prevent sending LLM completions to Sentry",
    );
    assert.ok(
      content.includes("sendDefaultPii: false"),
      "sendDefaultPii must be false to protect user personal identity",
    );
    assert.ok(
      content.includes("process.env.SENTRY_DSN"),
      "SENTRY_DSN should be parameterized via environment variable",
    );
  });

  test("sentry.edge.config.ts disables default PII and parameterizes DSN", () => {
    const content = fs.readFileSync(edgeConfigPath, "utf-8");

    assert.ok(
      content.includes("sendDefaultPii: false"),
      "sendDefaultPii must be false on edge configuration",
    );
    assert.ok(
      content.includes("process.env.SENTRY_DSN"),
      "SENTRY_DSN should be parameterized via environment variable on edge",
    );
  });

  test("AI executors do not enable input/output telemetry recording", () => {
    const executorDir = path.join(rootDir, "src/features/executions/components");
    const aiExecutors = ["gemini", "openai", "anthropic"];

    for (const name of aiExecutors) {
      const filePath = path.join(executorDir, name, "executor.ts");
      const content = fs.readFileSync(filePath, "utf-8");
      assert.ok(
        !content.includes("recordInputs: true"),
        `${name} executor must not enable recordInputs: true`,
      );
      assert.ok(
        !content.includes("recordOutputs: true"),
        `${name} executor must not enable recordOutputs: true`,
      );
    }
  });
});
