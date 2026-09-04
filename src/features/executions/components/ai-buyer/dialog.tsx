"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  inputKey: z
    .string()
    .min(1, { message: "Input key is required" })
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message:
        "Input key must start with a letter or underscore and contain only alphanumeric characters and underscores",
    }),
  outputKey: z
    .string()
    .min(1, { message: "Output key is required" })
    .regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, {
      message:
        "Output key must start with a letter or underscore and contain only alphanumeric characters and underscores",
    }),
});

export type AiBuyerFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: AiBuyerFormValues) => void;
  defaultValues?: Partial<AiBuyerFormValues>;
}

export const AiBuyerDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<AiBuyerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      inputKey: defaultValues.inputKey || "userMessage",
      outputKey: defaultValues.outputKey || "transactionIntent",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        inputKey: defaultValues.inputKey || "userMessage",
        outputKey: defaultValues.outputKey || "transactionIntent",
      });
    }
  }, [open, defaultValues, form]);

  const watchInputKey = form.watch("inputKey") || "userMessage";
  const watchOutputKey = form.watch("outputKey") || "transactionIntent";

  const handleSubmit = (values: AiBuyerFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI Buyer Configuration</DialogTitle>
          <DialogDescription>
            Configure the input shopping request context key and the output transaction intent key.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 mt-4"
          >
            <FormField
              control={form.control}
              name="inputKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Input Request Key</FormLabel>
                  <FormControl>
                    <Input placeholder="userMessage" {...field} />
                  </FormControl>
                  <FormDescription>
                    Workflow context key containing the user's shopping request:{" "}
                    {`{{${watchInputKey}}}`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="outputKey"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Output Intent Key</FormLabel>
                  <FormControl>
                    <Input placeholder="transactionIntent" {...field} />
                  </FormControl>
                  <FormDescription>
                    Key where the validated TransactionIntent will be placed in workflow context:{" "}
                    {`{{${watchOutputKey}.productTitle}}`}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="mt-4">
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
