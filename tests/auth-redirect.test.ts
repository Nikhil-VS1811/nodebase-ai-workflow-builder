import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import {
  buildAuthHref,
  DEFAULT_AUTH_REDIRECT,
  getGetStartedHref,
  getSignInHref,
  resolveClientRedirectPath,
  resolveRedirectParam,
  sanitizeRedirectPath,
} from "../src/lib/redirect-utils";

describe("Landing Page CTA & Authentication Redirect Handling", () => {
  describe("Get Started & Sign In CTA Hrefs", () => {
    it("routes unauthenticated Get Started CTA directly to /workflows/demo without login or signup", () => {
      assert.equal(getGetStartedHref(false), "/workflows/demo");
    });

    it("routes authenticated Get Started CTA directly to /workflows", () => {
      assert.equal(getGetStartedHref(true), "/workflows");
    });

    it("routes Sign In CTA to /login with return destination /workflows", () => {
      assert.equal(getSignInHref(), "/login?redirect=/workflows");
    });

    it("sanitizes custom redirect targets passed to CTA helpers", () => {
      assert.equal(
        getGetStartedHref(false, "https://evil.example/phish"),
        "/workflows/demo",
      );
      assert.equal(
        getGetStartedHref(true, "//evil.example/phish"),
        "/workflows",
      );
      assert.equal(
        getSignInHref("javascript:alert(1)"),
        "/login?redirect=/workflows",
      );
    });
  });

  describe("Redirect Destination Preservation", () => {
    it("defaults to /workflows when no redirect param is present", () => {
      assert.equal(resolveRedirectParam(undefined), DEFAULT_AUTH_REDIRECT);
      assert.equal(resolveRedirectParam({}), DEFAULT_AUTH_REDIRECT);
      assert.equal(
        resolveRedirectParam(new URLSearchParams("")),
        DEFAULT_AUTH_REDIRECT,
      );
      assert.equal(
        resolveClientRedirectPath(undefined, ""),
        DEFAULT_AUTH_REDIRECT,
      );
    });

    it("preserves safe internal application paths across query params and client resolution", () => {
      assert.equal(
        resolveRedirectParam({ redirect: "/workflows" }),
        "/workflows",
      );
      assert.equal(
        resolveRedirectParam({ redirect: "/workflows/wf_123" }),
        "/workflows/wf_123",
      );
      assert.equal(
        resolveRedirectParam({ callbackUrl: "/credentials" }),
        "/credentials",
      );
      assert.equal(
        resolveRedirectParam({ returnTo: "/executions/exec_456?tab=logs" }),
        "/executions/exec_456?tab=logs",
      );
      assert.equal(
        resolveClientRedirectPath(undefined, "?redirect=%2Fworkflows%2Fwf_123"),
        "/workflows/wf_123",
      );
      assert.equal(resolveClientRedirectPath("/credentials"), "/credentials");
    });

    it("preserves return destination when switching between /login and /signup", () => {
      assert.equal(
        buildAuthHref("/login", "/workflows"),
        "/login?redirect=/workflows",
      );
      assert.equal(
        buildAuthHref("/signup", "/workflows"),
        "/signup?redirect=/workflows",
      );
      assert.equal(
        buildAuthHref("/login", "/workflows?page=2"),
        "/login?redirect=%2Fworkflows%3Fpage%3D2",
      );
    });
  });

  describe("End-to-End Navigation & Auth Flow Simulation", () => {
    it("simulates signed-out Get Started -> direct /workflows/demo builder navigation without login prompt", () => {
      // 1. Visitor is unauthenticated on /
      const landingGetStartedHref = getGetStartedHref(false);
      assert.equal(landingGetStartedHref, "/workflows/demo");

      // 2. Visitor opens /workflows/demo directly - no redirect to /signup or /login
      const url = new URL(landingGetStartedHref, "http://nodebase.local");
      assert.equal(url.pathname, "/workflows/demo");
      assert.equal(url.search, "");
    });

    it("simulates signed-out user explicitly choosing Sign Up -> /signup?redirect=/workflows flow", () => {
      // 1. Visitor clicks "Sign Up" or "Create Account"
      const explicitSignupHref = buildAuthHref("/signup", "/workflows");
      assert.equal(explicitSignupHref, "/signup?redirect=/workflows");

      // 2. Visitor lands on /signup?redirect=/workflows
      const url = new URL(explicitSignupHref, "http://nodebase.local");
      const serverRedirectTo = resolveRedirectParam(url.searchParams);
      assert.equal(serverRedirectTo, "/workflows");

      // 3. RegisterForm resolves redirectPath for signUp.email / signIn.social
      const formRedirectPath = resolveClientRedirectPath(
        serverRedirectTo,
        url.search,
      );
      assert.equal(formRedirectPath, "/workflows");

      // 4. If visitor clicks "Already have an account? Login", return destination is preserved
      const switchToLoginHref = buildAuthHref("/login", formRedirectPath);
      assert.equal(switchToLoginHref, "/login?redirect=/workflows");
    });

    it("simulates signed-in Get Started -> direct /workflows navigation", () => {
      // 1. Visitor is already authenticated on /
      const landingGetStartedHref = getGetStartedHref(true);
      assert.equal(landingGetStartedHref, "/workflows");
    });

    it("simulates Sign In to Workspace -> Login -> /workflows flow", () => {
      // 1. Visitor clicks "Sign In to Workspace" or "Sign In" on /
      const landingSignInHref = getSignInHref();
      assert.equal(landingSignInHref, "/login?redirect=/workflows");

      // 2. Visitor lands on /login?redirect=/workflows
      const url = new URL(landingSignInHref, "http://nodebase.local");
      const serverRedirectTo = resolveRedirectParam(url.searchParams);
      assert.equal(serverRedirectTo, "/workflows");

      // 3. LoginForm resolves redirectPath for signIn.email / signIn.social
      const formRedirectPath = resolveClientRedirectPath(
        serverRedirectTo,
        url.search,
      );
      assert.equal(formRedirectPath, "/workflows");

      // 4. If visitor clicks "Don't have an account? Sign up", return destination is preserved
      const switchToSignupHref = buildAuthHref("/signup", formRedirectPath);
      assert.equal(switchToSignupHref, "/signup?redirect=/workflows");
    });

    it("simulates tampered external redirect parameter on /login and /signup safely falling back to /workflows", () => {
      for (const tamperedSearch of [
        "?redirect=https%3A%2F%2Fevil.com",
        "?redirect=%2F%2Fevil.com",
        "?callbackUrl=javascript%3Aalert(1)",
        "?returnTo=%2F%5Cevil.com",
      ]) {
        const searchParams = new URLSearchParams(tamperedSearch);
        const serverRedirectTo = resolveRedirectParam(searchParams);
        assert.equal(serverRedirectTo, "/workflows");
        assert.equal(
          resolveClientRedirectPath(undefined, tamperedSearch),
          "/workflows",
        );
      }
    });

    it("simulates OAuth sign-in flow with and without redirect query param", () => {
      // Case A: With redirect query param
      const searchWithRedirect = "?redirect=/workflows/wf_789";
      const resolvedTargetA = resolveClientRedirectPath(
        undefined,
        searchWithRedirect,
      );
      assert.equal(resolvedTargetA, "/workflows/wf_789");

      const oauthOptionsA = {
        provider: "github",
        callbackURL: resolvedTargetA,
        newUserCallbackURL: resolvedTargetA,
        errorCallbackURL: buildAuthHref("/login", resolvedTargetA),
      };
      assert.equal(oauthOptionsA.callbackURL, "/workflows/wf_789");
      assert.equal(oauthOptionsA.newUserCallbackURL, "/workflows/wf_789");
      assert.equal(
        oauthOptionsA.errorCallbackURL,
        "/login?redirect=/workflows/wf_789",
      );

      // Case B: Without redirect query param (direct /login visit)
      const resolvedTargetB = resolveClientRedirectPath(undefined, "");
      assert.equal(resolvedTargetB, "/workflows");

      const oauthOptionsB = {
        provider: "google",
        callbackURL: resolvedTargetB,
        newUserCallbackURL: resolvedTargetB,
        errorCallbackURL: buildAuthHref("/login", resolvedTargetB),
      };
      assert.equal(oauthOptionsB.callbackURL, "/workflows");
      assert.equal(oauthOptionsB.newUserCallbackURL, "/workflows");
      assert.equal(
        oauthOptionsB.errorCallbackURL,
        "/login?redirect=/workflows",
      );
    });

    it("simulates unauthenticated direct access to protected routes redirecting to /login with return destination", () => {
      // Visiting /workflows unauthenticated
      const workflowsHref = buildAuthHref("/login", "/workflows");
      assert.equal(workflowsHref, "/login?redirect=/workflows");

      // Visiting /workflows/wf_abc unauthenticated
      const workflowDetailHref = buildAuthHref("/login", "/workflows/wf_abc");
      assert.equal(workflowDetailHref, "/login?redirect=/workflows/wf_abc");

      // Visiting /credentials unauthenticated
      const credentialsHref = buildAuthHref("/login", "/credentials");
      assert.equal(credentialsHref, "/login?redirect=/credentials");
    });

    it("simulates authenticated direct access to /login or /signup redirecting to workflows or preserved target", () => {
      // Authenticated user visits /login without param
      assert.equal(sanitizeRedirectPath(undefined), "/workflows");

      // Authenticated user visits /signup with preserved return destination
      assert.equal(
        sanitizeRedirectPath("/credentials/new"),
        "/credentials/new",
      );

      // Authenticated user visits /login with malicious param
      assert.equal(sanitizeRedirectPath("https://attacker.com"), "/workflows");
    });
  });

  describe("Open-Redirect Prevention", () => {
    it("rejects external absolute URLs and falls back to /workflows", () => {
      const externalUrls = [
        "https://evil.com",
        "http://evil.com/workflows",
        "https://evil.com:8080/login",
        "ftp://evil.com/file",
      ];
      for (const malicious of externalUrls) {
        assert.equal(
          sanitizeRedirectPath(malicious),
          "/workflows",
          `Expected ${malicious} to fallback to /workflows`,
        );
      }
    });

    it("rejects protocol-relative, backslash, and encoded open-redirect payloads", () => {
      const payloads = [
        "//evil.com",
        "///evil.com",
        "////evil.com",
        "/\\evil.com",
        "\\\\evil.com",
        "/%2fevil.com",
        "/%2Fevil.com",
        "/%5cevil.com",
        "/%5Cevil.com",
        "%2f%2fevil.com",
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
        "vbscript:msgbox(1)",
        "/workflows/../../evil",
        "/../evil",
        "/workflows\u0000/evil",
      ];
      for (const payload of payloads) {
        assert.equal(
          sanitizeRedirectPath(payload),
          "/workflows",
          `Expected ${payload} to fallback to /workflows`,
        );
      }
    });

    it("prevents redirect loops back to /, /login, /signup, or /api routes", () => {
      const loopPaths = [
        "/",
        "/login",
        "/login?redirect=/workflows",
        "/signup",
        "/signup?redirect=/workflows",
        "/api/auth/get-session",
      ];
      for (const loopPath of loopPaths) {
        assert.equal(
          sanitizeRedirectPath(loopPath),
          "/workflows",
          `Expected ${loopPath} to fallback to /workflows`,
        );
      }
    });
  });

  describe("Landing Page, Auth Pages, and Auth Forms Wiring", () => {
    const repoRoot = path.resolve(__dirname, "..");

    it("landing page wires all Get Started and Sign In CTAs through session-aware helpers", () => {
      const pageSource = fs.readFileSync(
        path.join(repoRoot, "src/app/page.tsx"),
        "utf8",
      );

      assert.ok(
        pageSource.includes("getOptionalSession()"),
        "LandingPage must check optional session on server",
      );
      assert.ok(
        pageSource.includes("getGetStartedHref(isAuthenticated)"),
        "LandingPage must compute getStartedHref from session state",
      );
      assert.ok(
        pageSource.includes("getSignInHref()"),
        "LandingPage must compute signInHref with /workflows return destination",
      );
      assert.equal(
        (pageSource.match(/href=\{getStartedHref\}/g) ?? []).length,
        4,
        "All 4 Get Started CTAs on LandingPage must use getStartedHref",
      );
      assert.equal(
        (pageSource.match(/href=\{signInHref\}/g) ?? []).length,
        4,
        "All 4 Sign In CTAs on LandingPage must use signInHref",
      );
      assert.ok(
        !pageSource.includes('href="/signup"'),
        'LandingPage must not contain raw href="/signup" without redirect handling',
      );
      assert.ok(
        !pageSource.includes('href="/login"'),
        'LandingPage must not contain raw href="/login" without redirect handling',
      );
    });

    it("login and signup pages forward validated redirect target to requireUnauth and forms", () => {
      const loginPageSource = fs.readFileSync(
        path.join(repoRoot, "src/app/(auth)/login/page.tsx"),
        "utf8",
      );
      const signupPageSource = fs.readFileSync(
        path.join(repoRoot, "src/app/(auth)/signup/page.tsx"),
        "utf8",
      );

      assert.ok(loginPageSource.includes("resolveRedirectParam"));
      assert.ok(loginPageSource.includes("await requireUnauth(redirectTo)"));
      assert.ok(
        loginPageSource.includes("<LoginForm redirectTo={redirectTo} />"),
      );

      assert.ok(signupPageSource.includes("resolveRedirectParam"));
      assert.ok(signupPageSource.includes("await requireUnauth(redirectTo)"));
      assert.ok(
        signupPageSource.includes("<RegisterForm redirectTo={redirectTo} />"),
      );
    });

    it("login and register forms preserve redirectPath across social OAuth, email auth, and cross-links", () => {
      const loginFormSource = fs.readFileSync(
        path.join(repoRoot, "src/features/auth/components/login-form.tsx"),
        "utf8",
      );
      const registerFormSource = fs.readFileSync(
        path.join(repoRoot, "src/features/auth/components/register-form.tsx"),
        "utf8",
      );

      assert.equal(
        (loginFormSource.match(/callbackURL:\s*redirectPath/g) ?? []).length,
        2,
        "LoginForm must pass callbackURL: redirectPath to GitHub and Google OAuth signIn",
      );
      assert.equal(
        (loginFormSource.match(/newUserCallbackURL:\s*redirectPath/g) ?? [])
          .length,
        2,
        "LoginForm must pass newUserCallbackURL: redirectPath to GitHub and Google OAuth signIn",
      );
      assert.equal(
        (loginFormSource.match(/errorCallbackURL:\s*buildAuthHref/g) ?? [])
          .length,
        2,
        "LoginForm must pass errorCallbackURL with return destination to OAuth providers",
      );
      assert.ok(
        loginFormSource.includes("router.replace(redirectPath)"),
        "LoginForm must router.replace(redirectPath) on email signIn success",
      );
      assert.ok(
        loginFormSource.includes("router.refresh()"),
        "LoginForm must router.refresh() on email signIn success to refresh server cache",
      );
      assert.ok(
        !loginFormSource.includes("router.push(redirectPath)"),
        "LoginForm must not prematurely call router.push(redirectPath) before OAuth completes",
      );
      assert.ok(
        loginFormSource.includes('buildAuthHref("/signup", redirectPath)'),
        "LoginForm must preserve redirectPath on Sign up link",
      );

      assert.equal(
        (registerFormSource.match(/callbackURL:\s*redirectPath/g) ?? []).length,
        3,
        "RegisterForm must pass callbackURL: redirectPath to GitHub, Google, and email signUp",
      );
      assert.equal(
        (registerFormSource.match(/newUserCallbackURL:\s*redirectPath/g) ?? [])
          .length,
        2,
        "RegisterForm must pass newUserCallbackURL: redirectPath to GitHub and Google OAuth signIn",
      );
      assert.equal(
        (registerFormSource.match(/errorCallbackURL:\s*buildAuthHref/g) ?? [])
          .length,
        2,
        "RegisterForm must pass errorCallbackURL with return destination to OAuth providers",
      );
      assert.ok(
        registerFormSource.includes("router.replace(redirectPath)"),
        "RegisterForm must router.replace(redirectPath) on email signUp success",
      );
      assert.ok(
        registerFormSource.includes("router.refresh()"),
        "RegisterForm must router.refresh() on email signUp success to refresh server cache",
      );
      assert.ok(
        !registerFormSource.includes("router.push(redirectPath)"),
        "RegisterForm must not prematurely call router.push(redirectPath) before OAuth completes",
      );
      assert.ok(
        registerFormSource.includes('buildAuthHref("/login", redirectPath)'),
        "RegisterForm must preserve redirectPath on Login link",
      );
    });

    it("auth.ts and auth-utils.ts configure trustedOrigins, resilient customer sync, and default protected redirect", () => {
      const authSource = fs.readFileSync(
        path.join(repoRoot, "src/lib/auth.ts"),
        "utf8",
      );
      const authUtilsSource = fs.readFileSync(
        path.join(repoRoot, "src/lib/auth-utils.ts"),
        "utf8",
      );

      assert.ok(
        authSource.includes("trustedOrigins:"),
        "auth.ts must define trustedOrigins to prevent Better Auth originCheckMiddleware rejections",
      );
      assert.ok(
        authSource.includes("isPolarConfigured()"),
        "auth.ts must only enable createCustomerOnSignUp when Polar is configured",
      );
      assert.ok(
        authUtilsSource.includes('redirectTo: string | null = "/workflows"'),
        'requireAuth must default redirectTo to "/workflows" so direct visits to protected routes redirect to /login?redirect=/workflows',
      );
      assert.ok(
        authUtilsSource.includes("sanitizeRedirectPath(redirectTo)"),
        "requireUnauth must sanitize redirectTo before redirecting authenticated users",
      );
    });
  });
});
