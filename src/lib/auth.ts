import { checkout, polar, portal } from "@polar-sh/better-auth";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@/lib/db";
import { getSocialProvidersConfig } from "./auth-config";
import { getPolarProProductId, isPolarConfigured, polarClient } from "./polar";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    "https://nodebase-ai-workflow-builder.vercel.app",
    "http://localhost:3000",
  ].filter(Boolean) as string[],
  socialProviders: getSocialProvidersConfig(),
  plugins: [
    polar({
      client: polarClient,
      createCustomerOnSignUp: isPolarConfigured(),
      use: [
        checkout({
          products: [
            {
              productId: getPolarProProductId(),
              slug: "pro",
            },
          ],
          successUrl: process.env.POLAR_SUCCESS_URL,
          authenticatedUsersOnly: true,
        }),
        portal(),
      ],
    }),
  ],
});
