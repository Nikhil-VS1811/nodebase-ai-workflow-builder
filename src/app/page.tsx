import {
  ActivityIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  FlaskConicalIcon,
  FolderOpenIcon,
  GlobeIcon,
  KeyRoundIcon,
  LayersIcon,
  MousePointerClickIcon,
  PlusIcon,
  SaveIcon,
  ShieldCheckIcon,
  SparklesIcon,
  WebhookIcon,
  WorkflowIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOptionalSession } from "@/lib/auth-utils";
import { getGetStartedHref, getSignInHref } from "@/lib/redirect-utils";

const triggerIntegrations = [
  {
    name: "Manual Trigger",
    description: "Run workflows on demand directly from the editor canvas.",
    icon: null,
  },
  {
    name: "Google Forms",
    description: "Trigger workflows automatically on form submissions.",
    icon: "/logos/googleform.svg",
  },
  {
    name: "Stripe Events",
    description: "Respond to signature-verified Stripe payment webhook events.",
    icon: "/logos/stripe.svg",
  },
];

const actionIntegrations = [
  {
    name: "OpenAI",
    category: "AI Generation",
    description:
      "Generate structured or freeform responses with OpenAI models.",
    icon: "/logos/openai.svg",
  },
  {
    name: "Google Gemini",
    category: "AI Generation",
    description: "Run multi-step prompts and synthesis with Google Gemini.",
    icon: "/logos/gemini.svg",
  },
  {
    name: "Anthropic Claude",
    category: "AI Generation",
    description: "Process complex reasoning tasks using Anthropic Claude.",
    icon: "/logos/anthropic.svg",
  },
  {
    name: "HTTP Request",
    category: "API Connector",
    description:
      "Execute outbound REST requests with Handlebars template interpolation.",
    icon: null,
  },
  {
    name: "Slack",
    category: "Messaging",
    description: "Deliver automated workflow outputs to Slack channels.",
    icon: "/logos/slack.svg",
  },
  {
    name: "Discord",
    category: "Messaging",
    description: "Post real-time notifications and AI summaries to Discord.",
    icon: "/logos/discord.svg",
  },
];

const platformFeatures = [
  {
    title: "Visual Drag-and-Drop Editor",
    description:
      "Design directed acyclic workflows on an interactive React Flow canvas with cycle detection, edge sanitization, and instant node configuration.",
    icon: WorkflowIcon,
  },
  {
    title: "Multi-Provider AI Orchestration",
    description:
      "Chain OpenAI, Google Gemini, and Anthropic Claude nodes together and pass dynamic context between steps using Handlebars variables.",
    icon: SparklesIcon,
  },
  {
    title: "Event & Webhook Triggers",
    description:
      "Start workflows manually from the canvas or automatically from incoming Google Form submissions and verified Stripe webhook events.",
    icon: WebhookIcon,
  },
  {
    title: "Durable Background Execution",
    description:
      "Powered by Inngest for reliable step-by-step asynchronous execution, real-time node status updates, and complete execution logs.",
    icon: ActivityIcon,
  },
  {
    title: "Encrypted Credential Management",
    description:
      "Store OpenAI, Gemini, and Anthropic API keys encrypted at rest with strict user-scoped access and masked responses across all APIs.",
    icon: KeyRoundIcon,
  },
  {
    title: "Hardened Outbound HTTP & Webhooks",
    description:
      "Connect external REST APIs, Slack, and Discord with built-in SSRF protection against private network and metadata targets.",
    icon: ShieldCheckIcon,
  },
];

export default async function LandingPage() {
  const session = await getOptionalSession();
  const isAuthenticated = Boolean(session?.user?.id);
  const getStartedHref = getGetStartedHref(isAuthenticated);
  const signInHref = getSignInHref();

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      {/* Brand Header */}
      <header className="border-border/80 bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-semibold tracking-tight"
          >
            <Image
              src="/logos/logo.svg"
              alt="NodeBase"
              width={32}
              height={32}
              priority
            />
            <span className="text-base">Nodebase</span>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="text-muted-foreground hidden items-center gap-6 text-sm font-medium md:flex"
          >
            <a
              href="#preview"
              className="hover:text-foreground transition-colors"
            >
              Product Preview
            </a>
            <a
              href="#features"
              className="hover:text-foreground transition-colors"
            >
              Features
            </a>
            <a
              href="#integrations"
              className="hover:text-foreground transition-colors"
            >
              Integrations
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Button variant="ghost" size="sm" asChild>
              <Link href={signInHref} prefetch={false}>
                Sign In
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link
                href={getStartedHref}
                prefetch={false}
                aria-label="Get Started as Guest"
              >
                Get Started as Guest
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-12 pb-16 sm:pt-20 sm:pb-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
              <Badge
                variant="secondary"
                className="border-border mb-6 gap-1.5 border px-3 py-1 text-xs font-medium"
              >
                <SparklesIcon className="text-primary size-3.5" />
                Visual AI Workflow Automation
              </Badge>

              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                Build, execute, and monitor{" "}
                <span className="text-primary">AI workflows</span> visually
              </h1>

              <p className="text-muted-foreground mt-5 max-w-2xl text-base leading-relaxed sm:text-lg">
                NodeBase is a visual workflow builder that connects webhooks and
                manual triggers to OpenAI, Google Gemini, Anthropic Claude, HTTP
                APIs, Slack, and Discord—orchestrated asynchronously with
                real-time execution tracking.
              </p>

              <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
                <Button size="lg" className="w-full sm:w-auto" asChild>
                  <Link
                    href={getStartedHref}
                    prefetch={false}
                    aria-label="Get Started as Guest"
                  >
                    Get Started as Guest
                    <ArrowRightIcon className="size-4" />
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                  asChild
                >
                  <Link href={signInHref} prefetch={false}>
                    Sign In to Workspace
                  </Link>
                </Button>
              </div>
            </div>

            {/* Product Preview Section */}
            <div id="preview" className="mt-12 sm:mt-16">
              <div className="border-border bg-card overflow-hidden rounded-xl border shadow-lg">
                {/* Simulated Editor Header */}
                <div className="border-border bg-background flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
                  <div className="flex items-center gap-2 text-sm">
                    <FolderOpenIcon className="text-muted-foreground size-4" />
                    <span className="text-muted-foreground">Workflows</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="font-medium">
                      stripe-ai-notification-pipeline
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="hidden gap-1.5 sm:inline-flex"
                    >
                      <CheckCircle2Icon className="text-primary size-3.5" />3
                      nodes connected
                    </Badge>
                    <div className="bg-primary text-primary-foreground inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium">
                      <SaveIcon className="size-3.5" />
                      Save
                    </div>
                  </div>
                </div>

                {/* Simulated React Flow Canvas */}
                <div className="bg-muted/30 relative px-4 py-10 sm:px-8 sm:py-14">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px] opacity-70 dark:bg-[radial-gradient(#475569_1px,transparent_1px)]"
                  />

                  <div className="relative z-10 flex flex-col items-center justify-between gap-6 sm:gap-8">
                    {/* Top-right Add Node Button */}
                    <div className="hidden w-full justify-end sm:flex">
                      <div className="border-border bg-background inline-flex size-9 items-center justify-center rounded-md border shadow-xs">
                        <PlusIcon className="text-muted-foreground size-4" />
                      </div>
                    </div>

                    {/* Nodes Pipeline */}
                    <div className="flex w-full max-w-4xl flex-col items-center justify-center gap-4 md:flex-row md:gap-0">
                      {/* Node 1: Trigger */}
                      <div className="flex flex-col items-center text-center">
                        <div className="border-primary/60 bg-card relative flex size-20 items-center justify-center rounded-l-2xl rounded-r-md border-2 shadow-sm">
                          <Image
                            src="/logos/stripe.svg"
                            alt="Stripe Event Trigger"
                            width={28}
                            height={28}
                          />
                          <span className="bg-primary absolute -right-1.5 size-3 rounded-full ring-2 ring-white dark:ring-slate-900" />
                        </div>
                        <span className="mt-2.5 text-sm font-semibold">
                          Stripe Event
                        </span>
                        <span className="text-muted-foreground text-xs">
                          Trigger: payment_intent.succeeded
                        </span>
                      </div>

                      {/* Connector 1 */}
                      <div
                        aria-hidden="true"
                        className="bg-border h-8 w-0.5 md:mx-2 md:h-0.5 md:w-20 lg:w-28"
                      />

                      {/* Node 2: AI Execution */}
                      <div className="flex flex-col items-center text-center">
                        <div className="border-border bg-card relative flex size-20 items-center justify-center rounded-md border-2 shadow-sm">
                          <span className="bg-muted-foreground/60 absolute -left-1.5 size-3 rounded-full ring-2 ring-white dark:ring-slate-900" />
                          <Image
                            src="/logos/openai.svg"
                            alt="OpenAI Node"
                            width={28}
                            height={28}
                          />
                          <span className="bg-primary absolute -right-1.5 size-3 rounded-full ring-2 ring-white dark:ring-slate-900" />
                        </div>
                        <span className="mt-2.5 text-sm font-semibold">
                          OpenAI
                        </span>
                        <span className="text-muted-foreground text-xs">
                          Summarize event &amp; draft alert
                        </span>
                      </div>

                      {/* Connector 2 */}
                      <div
                        aria-hidden="true"
                        className="bg-border h-8 w-0.5 md:mx-2 md:h-0.5 md:w-20 lg:w-28"
                      />

                      {/* Node 3: Slack Action */}
                      <div className="flex flex-col items-center text-center">
                        <div className="border-border bg-card relative flex size-20 items-center justify-center rounded-md border-2 shadow-sm">
                          <span className="bg-muted-foreground/60 absolute -left-1.5 size-3 rounded-full ring-2 ring-white dark:ring-slate-900" />
                          <Image
                            src="/logos/slack.svg"
                            alt="Slack Node"
                            width={28}
                            height={28}
                          />
                        </div>
                        <span className="mt-2.5 text-sm font-semibold">
                          Slack
                        </span>
                        <span className="text-muted-foreground text-xs">
                          Send message to channel
                        </span>
                      </div>
                    </div>

                    {/* Simulated Execute Workflow Button */}
                    <div className="pt-2">
                      <div className="bg-primary text-primary-foreground inline-flex h-10 items-center gap-2 rounded-md px-5 text-sm font-medium shadow-sm">
                        <FlaskConicalIcon className="size-4" />
                        Execute workflow
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Features Section */}
        <section id="features" className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="outline" className="mb-3">
                Core Capabilities
              </Badge>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Everything needed to build and run AI workflows
              </h2>
              <p className="text-muted-foreground mt-3 text-sm sm:text-base">
                Built with Next.js, React Flow, tRPC, Prisma, Better Auth, and
                Inngest for reliable end-to-end workflow execution.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {platformFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card key={feature.title} className="h-full">
                    <CardHeader>
                      <div className="bg-primary/10 text-primary mb-2 flex size-10 items-center justify-center rounded-lg">
                        <Icon className="size-5" />
                      </div>
                      <CardTitle className="text-base">
                        {feature.title}
                      </CardTitle>
                      <CardDescription className="leading-relaxed">
                        {feature.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        <Separator />

        {/* Triggers & Integrations Section */}
        <section id="integrations" className="bg-muted/30 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <Badge variant="outline" className="mb-3">
                Built-in Nodes
              </Badge>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Triggers, AI models, and action connectors
              </h2>
              <p className="text-muted-foreground mt-3 text-sm sm:text-base">
                Combine event triggers with LLM providers, HTTP requests, and
                messaging webhooks in a single pipeline.
              </p>
            </div>

            <div className="mt-12 space-y-10">
              {/* Triggers */}
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <MousePointerClickIcon className="text-primary size-4" />
                  <h3 className="text-sm font-semibold tracking-wide uppercase">
                    Workflow Triggers
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {triggerIntegrations.map((trigger) => (
                    <Card key={trigger.name}>
                      <CardContent className="flex items-start gap-3.5 pt-6">
                        <div className="border-border bg-background flex size-10 shrink-0 items-center justify-center rounded-lg border">
                          {trigger.icon ? (
                            <Image
                              src={trigger.icon}
                              alt={trigger.name}
                              width={20}
                              height={20}
                            />
                          ) : (
                            <MousePointerClickIcon className="text-muted-foreground size-5" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-semibold">
                            {trigger.name}
                          </div>
                          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                            {trigger.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Actions & AI Models */}
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <LayersIcon className="text-primary size-4" />
                  <h3 className="text-sm font-semibold tracking-wide uppercase">
                    AI &amp; Action Nodes
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {actionIntegrations.map((node) => (
                    <Card key={node.name}>
                      <CardContent className="flex items-start gap-3.5 pt-6">
                        <div className="border-border bg-background flex size-10 shrink-0 items-center justify-center rounded-lg border">
                          {node.icon ? (
                            <Image
                              src={node.icon}
                              alt={node.name}
                              width={20}
                              height={20}
                            />
                          ) : (
                            <GlobeIcon className="text-muted-foreground size-5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">
                              {node.name}
                            </span>
                            <Badge variant="secondary" className="text-[10px]">
                              {node.category}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                            {node.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* Bottom CTA Section */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Ready to automate your first workflow?
            </h2>
            <p className="text-muted-foreground mx-auto mt-3 max-w-xl text-sm sm:text-base">
              Create an account to access the visual workflow editor, configure
              encrypted API credentials, and monitor executions in real time.
            </p>
            <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" className="w-full sm:w-auto" asChild>
                <Link
                  href={getStartedHref}
                  prefetch={false}
                  aria-label="Get Started as Guest"
                >
                  Get Started as Guest
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto"
                asChild
              >
                <Link href={signInHref} prefetch={false}>
                  Sign In
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-border bg-muted/20 border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Image
              src="/logos/logo.svg"
              alt="NodeBase"
              width={24}
              height={24}
            />
            <span className="text-sm font-semibold">Nodebase</span>
            <span className="text-muted-foreground text-xs">
              — AI Workflow Builder
            </span>
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-6 text-xs font-medium">
            <Link
              href={signInHref}
              prefetch={false}
              className="hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href={getStartedHref}
              prefetch={false}
              aria-label="Get Started as Guest"
              className="hover:text-foreground transition-colors"
            >
              Get Started as Guest
            </Link>
            <Link
              href="/workflows"
              prefetch={false}
              className="hover:text-foreground transition-colors"
            >
              Workflows Dashboard
            </Link>
            <a
              href="https://github.com/Nikhil-VS1811/nodebase-ai-workflow-builder"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
