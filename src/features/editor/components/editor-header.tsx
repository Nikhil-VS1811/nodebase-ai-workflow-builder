"use client";

import { useAtomValue } from "jotai";
import { SaveIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  getGuestWorkflow,
  isDemoWorkflow,
  resetGuestWorkflow,
  saveGuestWorkflow,
  saveGuestWorkflowName,
} from "@/features/workflows/guest-workflow";
import {
  useSuspenseWorkflow,
  useUpdateWorkflow,
  useUpdateWorkflowName,
} from "@/features/workflows/hooks/use-workflows";
import { editorAtom } from "../store/atoms";

export const EditorSaveButton = ({ workflowId }: { workflowId: string }) => {
  const isGuest = isDemoWorkflow(workflowId);
  const editor = useAtomValue(editorAtom);
  const saveWorkflow = useUpdateWorkflow();

  const handleSave = () => {
    if (!editor) {
      return;
    }

    const nodes = editor.getNodes();
    const edges = editor.getEdges();

    if (isGuest) {
      saveGuestWorkflow({ nodes, edges });
      toast.success("Draft saved to browser storage");
      return;
    }

    saveWorkflow.mutate({
      id: workflowId,
      nodes,
      edges,
    });
  };

  return (
    <div className="ml-auto flex items-center gap-2">
      {isGuest && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            resetGuestWorkflow();
            window.location.reload();
          }}
        >
          Reset Demo
        </Button>
      )}
      <Button
        size="sm"
        onClick={handleSave}
        disabled={!isGuest && saveWorkflow.isPending}
      >
        <SaveIcon className="size-4" />
        {isGuest ? "Save Draft" : "Save"}
      </Button>
    </div>
  );
};

const AuthenticatedEditorNameInput = ({
  workflowId,
}: {
  workflowId: string;
}) => {
  const { data: workflow } = useSuspenseWorkflow(workflowId);
  const updateWorkflow = useUpdateWorkflowName();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(workflow.name);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (workflow.name) {
      setName(workflow.name);
    }
  }, [workflow.name]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (name === workflow.name) {
      setIsEditing(false);
      return;
    }

    try {
      await updateWorkflow.mutateAsync({
        id: workflowId,
        name,
      });
    } catch {
      setName(workflow.name);
    } finally {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setName(workflow.name);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        disabled={updateWorkflow.isPending}
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-7 w-auto min-w-[100px] px-2"
      />
    );
  }

  return (
    <BreadcrumbItem
      onClick={() => setIsEditing(true)}
      className="cursor-pointer hover:text-foreground transition-colors"
    >
      {workflow.name}
    </BreadcrumbItem>
  );
};

const GuestEditorNameInput = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(() => getGuestWorkflow().name);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setName(getGuestWorkflow().name);
      setIsEditing(false);
      return;
    }

    saveGuestWorkflowName(trimmed);
    setName(trimmed);
    setIsEditing(false);
    toast.success("Draft name updated");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setName(getGuestWorkflow().name);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-7 w-auto min-w-[100px] px-2"
      />
    );
  }

  return (
    <BreadcrumbItem
      onClick={() => setIsEditing(true)}
      className="cursor-pointer hover:text-foreground transition-colors"
    >
      {name}
    </BreadcrumbItem>
  );
};

export const EditorNameInput = ({ workflowId }: { workflowId: string }) => {
  if (isDemoWorkflow(workflowId)) {
    return <GuestEditorNameInput />;
  }
  return <AuthenticatedEditorNameInput workflowId={workflowId} />;
};

export const EditorBreadcrumbs = ({ workflowId }: { workflowId: string }) => {
  const isGuest = isDemoWorkflow(workflowId);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link prefetch={false} href={isGuest ? "/" : "/workflows"}>
              {isGuest ? "Home" : "Workflows"}
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <EditorNameInput workflowId={workflowId} />
        {isGuest && (
          <Badge variant="secondary" className="text-xs font-normal ml-2">
            Guest Demo
          </Badge>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export const EditorHeader = ({ workflowId }: { workflowId: string }) => {
  const isGuest = isDemoWorkflow(workflowId);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 bg-background">
      <SidebarTrigger />
      <div className="flex flex-row items-center justify-between gap-x-4 w-full">
        <EditorBreadcrumbs workflowId={workflowId} />
        <div className="flex items-center gap-2 ml-auto">
          {isGuest && (
            <Button asChild size="sm" variant="ghost">
              <Link href="/login?redirect=/workflows">Sign In</Link>
            </Button>
          )}
          <EditorSaveButton workflowId={workflowId} />
        </div>
      </div>
    </header>
  );
};
