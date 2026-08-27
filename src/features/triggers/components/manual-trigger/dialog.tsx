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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import z from "zod";

const formSchema = z.object({
  payload: z
    .string()
    .optional()
    .refine(
      (val) => {
        if (!val || val.trim() === "") return true;
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "Payload must be valid JSON (or left empty)" },
    ),
});

export type ManualTriggerFormValues = z.infer<typeof formSchema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ManualTriggerFormValues) => void;
  defaultValues?: Partial<ManualTriggerFormValues>;
}

export const ManualTriggerDialog = ({
  open,
  onOpenChange,
  onSubmit,
  defaultValues = {},
}: Props) => {
  const form = useForm<ManualTriggerFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      payload: defaultValues.payload ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ payload: defaultValues.payload ?? "" });
    }
  }, [open, defaultValues, form]);

  const handleSubmit = (values: ManualTriggerFormValues) => {
    onSubmit(values);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manual Trigger</DialogTitle>
          <DialogDescription>
            Optionally paste a JSON payload to inject into the workflow context
            when this trigger fires. Downstream nodes (e.g. Policy Gate) can
            read fields directly from it.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 mt-2"
          >
            <FormField
              control={form.control}
              name="payload"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Test Payload (JSON)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={`{\n  "transactionIntent": {\n    "action": "payment.execute",\n    "amount": 1500,\n    "currency": "INR",\n    "merchantId": "merchant_001",\n    "productTitle": "Pro Plan",\n    "productDescription": "Monthly subscription"\n  }\n}`}
                      className="min-h-[200px] font-mono text-sm resize-y"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Leave empty to start with a blank context. Keys at the top
                    level of this object are merged directly into the workflow
                    context.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="submit">Save</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
