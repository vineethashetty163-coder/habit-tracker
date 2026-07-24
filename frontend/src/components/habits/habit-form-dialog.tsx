"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";

type HabitFormValues = {
  name: string;
  description: string;
};

type HabitFormDialogProps = {
  trigger: React.ReactElement;
  title: string;
  description: string;
  submitLabel: string;
  initialValues?: HabitFormValues;
  onSubmit: (values: HabitFormValues) => Promise<void>;
};

export function HabitFormDialog({
  trigger,
  title,
  description,
  submitLabel,
  initialValues,
  onSubmit,
}: HabitFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initialValues?.name ?? "");
  const [habitDescription, setHabitDescription] = useState(
    initialValues?.description ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setName(initialValues?.name ?? "");
      setHabitDescription(initialValues?.description ?? "");
      setError(null);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({ name, description: habitDescription });
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="habit-name">Name</Label>
              <Input
                id="habit-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="habit-description">Description (optional)</Label>
              <Textarea
                id="habit-description"
                value={habitDescription}
                onChange={(e) => setHabitDescription(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
