"use client";

import { formatDistanceToNow } from "date-fns";
import { ArrowRightIcon, WorkflowIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  EmptyView,
  EntityContainer,
  EntityHeader,
  EntityItem,
  EntityList,
  EntityPagination,
  EntitySearch,
  ErrorView,
  LoadingView,
} from "@/components/entity-components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Workflow } from "@/generated/prisma";
import { useEntitySearch } from "@/hooks/use-entity-search";
import { useUpgradeModal } from "@/hooks/use-upgrade-modal";
import {
  DEFAULT_DEMO_WORKFLOW,
  DEMO_WORKFLOW_ID,
  type GuestWorkflowData,
  getGuestWorkflow,
} from "../guest-workflow";
import {
  useCreateWorkflow,
  useRemoveWorkflow,
  useSuspenseWorkflows,
} from "../hooks/use-workflows";
import { useWorkflowsParams } from "../hooks/use-workflows-params";

export const WorkflowsSearch = () => {
  const [params, setParams] = useWorkflowsParams();
  const { searchValue, onSearchChange } = useEntitySearch({
    params,
    setParams,
  });

  return (
    <EntitySearch
      value={searchValue}
      onChange={onSearchChange}
      placeholder="Search workflows"
    />
  );
};

export const WorkflowsList = () => {
  const workflows = useSuspenseWorkflows();

  return (
    <EntityList
      items={workflows.data.items}
      getKey={(workflow) => workflow.id}
      renderItem={(workflow) => <WorkflowItem data={workflow} />}
      emptyView={<WorkflowsEmpty />}
    />
  );
};

export const WorkflowsHeader = ({ disabled }: { disabled?: boolean }) => {
  const router = useRouter();
  const createWorkflow = useCreateWorkflow();
  const { handleError, modal } = useUpgradeModal();

  const handleCreate = () => {
    createWorkflow.mutate(undefined, {
      onSuccess: (data) => {
        router.push(`/workflows/${data.id}`);
      },
      onError: (error) => {
        handleError(error);
      },
    });
  };

  return (
    <>
      {modal}
      <EntityHeader
        title="Workflows"
        description="Create and manage your workflows"
        onNew={handleCreate}
        newButtonLabel="New workflow"
        disabled={disabled}
        isCreating={createWorkflow.isPending}
      />
    </>
  );
};

export const WorkflowsPagination = () => {
  const workflows = useSuspenseWorkflows();
  const [params, setParams] = useWorkflowsParams();

  return (
    <EntityPagination
      disabled={workflows.isFetching}
      totalPages={workflows.data.totalPages}
      page={workflows.data.page}
      onPageChange={(page) => setParams({ ...params, page })}
    />
  );
};

export const WorkflowsContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <EntityContainer
      header={<WorkflowsHeader />}
      search={<WorkflowsSearch />}
      pagination={<WorkflowsPagination />}
    >
      {children}
    </EntityContainer>
  );
};

export const GuestWorkflowsView = () => {
  const [guestWorkflow, setGuestWorkflow] = useState<GuestWorkflowData>(
    DEFAULT_DEMO_WORKFLOW,
  );

  useEffect(() => {
    setGuestWorkflow(getGuestWorkflow());
  }, []);

  const demoHref = `/workflows/${DEMO_WORKFLOW_ID}`;

  return (
    <EntityContainer
      header={
        <EntityHeader
          title="Workflows"
          description="Explore the workflow builder in guest mode or sign in to manage cloud workflows"
          newButtonHref={demoHref}
          newButtonLabel="Open workflow builder"
        />
      }
    >
      <div className="flex flex-col gap-y-4">
        <EntityItem
          href={demoHref}
          title={guestWorkflow.name}
          subtitle={
            <>
              {guestWorkflow.nodes.length} nodes &bull;{" "}
              {guestWorkflow.edges.length} connections &bull; Saved in browser
              storage
            </>
          }
          image={
            <div className="size-8 flex items-center justify-center">
              <WorkflowIcon className="size-5 text-muted-foreground" />
            </div>
          }
          actions={<Badge variant="secondary">Guest Demo</Badge>}
        />

        <Card className="border-dashed shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Working in Guest Mode
            </CardTitle>
            <CardDescription className="text-xs">
              Click the demo workflow above to open the visual React Flow canvas
              immediately. Sign in or create a free account when you want to
              persist multiple workflows to the cloud, store encrypted API
              credentials, or run background executions.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 pt-0">
            <Button size="sm" asChild>
              <Link href={demoHref} prefetch={false}>
                Open Demo Builder
                <ArrowRightIcon className="size-4" />
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/login?redirect=/workflows" prefetch={false}>
                Sign in
              </Link>
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/signup?redirect=/workflows" prefetch={false}>
                Create account
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </EntityContainer>
  );
};

export const WorkflowsLoading = () => {
  return <LoadingView message="Loading workflows..." />;
};

export const WorkflowsError = () => {
  return <ErrorView message="Error loading workflows" />;
};

export const WorkflowsEmpty = () => {
  const router = useRouter();
  const createWorkflow = useCreateWorkflow();
  const { handleError, modal } = useUpgradeModal();

  const handleCreate = () => {
    createWorkflow.mutate(undefined, {
      onError: (error) => {
        handleError(error);
      },
      onSuccess: (data) => {
        router.push(`/workflows/${data.id}`);
      },
    });
  };

  return (
    <>
      {modal}
      <EmptyView
        onNew={handleCreate}
        message="You haven't created any workflows yet. Get started by creating your first workflow"
      />
    </>
  );
};

export const WorkflowItem = ({ data }: { data: Workflow }) => {
  const removeWorkflow = useRemoveWorkflow();

  const handleRemove = () => {
    removeWorkflow.mutate({ id: data.id });
  };

  return (
    <EntityItem
      href={`/workflows/${data.id}`}
      title={data.name}
      subtitle={
        <>
          Updated {formatDistanceToNow(data.updatedAt, { addSuffix: true })}{" "}
          &bull; Created{" "}
          {formatDistanceToNow(data.createdAt, { addSuffix: true })}
        </>
      }
      image={
        <div className="size-8 flex items-center justify-center">
          <WorkflowIcon className="size-5 text-muted-foreground" />
        </div>
      }
      onRemove={handleRemove}
      isRemoving={removeWorkflow.isPending}
    />
  );
};
