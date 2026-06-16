# NodeBase AI Workflow Builder

A visual workflow automation platform that enables users to build, execute, and monitor AI-powered workflows through a drag-and-drop interface.

Inspired by modern automation platforms like n8n and Zapier, NodeBase combines workflow orchestration, AI integrations, event-driven execution, and third-party service connectivity into a single platform.

## Live Demo

**Application:** https://nodebase-ai-workflow-builder.vercel.app

## Features

### Visual Workflow Builder

* Drag-and-drop workflow editor
* Interactive node-based interface
* Real-time workflow design
* Dynamic node connections

### AI Integrations

* OpenAI integration
* Google Gemini integration
* Anthropic Claude integration
* AI-powered workflow automation

### Workflow Triggers

* Manual Trigger
* Google Forms Trigger
* Stripe Payment Trigger

### Actions & Integrations

* HTTP Request Node
* Discord Integration
* Slack Integration
* AI Processing Nodes

### Execution Engine

* Asynchronous workflow execution
* Event-driven architecture
* Execution tracking
* Workflow monitoring

### Authentication & Security

* Secure user authentication
* Credential management system
* Encrypted credential storage
* Protected API routes

### Workflow Management

* Create workflows
* Edit workflows
* Execute workflows
* Track execution history
* Manage workflow credentials

## Screenshots

### 🔐 Login Page

Secure authentication interface with email/password and OAuth-based sign-in options. Built using Better Auth for seamless user onboarding.

![Login](./screenshots/login.png)

### 📝 Registration Page

User registration flow supporting email authentication and social login providers. Designed for quick account creation and secure access management.

![Register](./screenshots/register.png)

### 📊 Dashboard

Centralized workspace for managing workflows, credentials, and execution history. Provides a clean overview of all automation activities.

![Dashboard](./screenshots/dashboard.png)

### 🔑 Credentials Management

Secure credential storage system for managing API keys and third-party integrations. Sensitive data is encrypted before being stored.

![Credentials](./screenshots/credentials.png)

### ⚡ Workflow Builder

Visual drag-and-drop editor for designing automation pipelines. Supports AI nodes, triggers, actions, and real-time workflow execution.

![Workflow Builder](./screenshots/workflow.png)

## Architecture

```text
Trigger Nodes
      │
      ▼
Workflow Engine
      │
      ▼
Execution Queue
      │
      ▼
Action Nodes
      │
 ┌────┼────┐
 ▼    ▼    ▼
AI   APIs Messaging
```

## Tech Stack

### Frontend

* Next.js 15
* React
* TypeScript
* Tailwind CSS
* React Flow

### Backend

* Next.js Server Components
* tRPC
* Better Auth

### Database

* PostgreSQL
* Prisma ORM
* Neon Database

### Workflow Infrastructure

* Inngest
* Event-Driven Processing

### Monitoring

* Sentry

### Deployment

* Vercel

## Getting Started

### Clone Repository

```bash
git clone https://github.com/Nikhil-VS1811/nodebase-ai-workflow-builder.git
cd nodebase-ai-workflow-builder
```

### Install Dependencies

```bash
npm install
```

### Configure Environment Variables

Create a `.env` file:

```env
DATABASE_URL=

ENCRYPTION_KEY=

BETTER_AUTH_SECRET=
BETTER_AUTH_URL=

NEXT_PUBLIC_APP_URL=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

POLAR_ACCESS_TOKEN=
POLAR_SUCCESS_URL=
```

### Run Database Migrations

```bash
npx prisma migrate deploy
```

### Start Development Server

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Project Structure

```text
src/
├── app/
├── components/
├── features/
├── hooks/
├── inngest/
├── lib/
├── trpc/
└── config/

prisma/
public/
```

## Key Highlights

* Visual workflow automation platform
* AI model integrations (OpenAI, Gemini, Anthropic)
* Event-driven execution architecture
* Secure credential management
* Real-time workflow orchestration
* Production deployment on Vercel
* PostgreSQL + Prisma backend
* Full-stack TypeScript application

## Future Improvements

* Multi-workspace support
* Workflow templates
* Webhook triggers
* Scheduled workflows
* Team collaboration
* Workflow versioning
* Marketplace for custom nodes
* Advanced analytics dashboard

## Author

**Nikhil VS**

GitHub: https://github.com/Nikhil-VS1811

---

If you found this project interesting, consider starring the repository.
