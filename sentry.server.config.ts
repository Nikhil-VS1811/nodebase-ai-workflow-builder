// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN || "https://f1a2853e6bb4b74c72976cd5c3b37dd9@o4507629901053952.ingest.de.sentry.io/4510150041337936",

  integrations: [
    // Prevent leaking sensitive user prompts and LLM outputs to Sentry
    Sentry.vercelAIIntegration({
      recordInputs: false,
      recordOutputs: false,
    }),
    Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
  sendDefaultPii: false,

  // Enable logs to be sent to Sentry
  enableLogs: false,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
