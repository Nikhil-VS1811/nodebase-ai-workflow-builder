import { createTRPCRouter } from '../init';
import { workflowsRouter } from '@/features/workflows/server/routers';
import { credentialsRouter } from '@/features/credentials/server/routers';
import { executionsRouter } from '@/features/executions/server/routers';
import { safetyLabRouter } from '@/features/safety-lab/server/routers';
import { merchantGrowthRouter } from '@/features/merchant-growth/server/routers';
import { aiBuyerRouter } from '@/features/ai-buyer/server/routers';

export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  credentials: credentialsRouter,
  executions: executionsRouter,
  safetyLab: safetyLabRouter,
  merchantGrowth: merchantGrowthRouter,
  aiBuyer: aiBuyerRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;
