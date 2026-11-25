"use client";

import { useActionState, useState } from "react";
import { UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Field, FormAlert, PasswordField, SubmitButton } from "@/components/forms";
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
import { initialFormState, type FormState } from "@/lib/forms";
import { createUser } from "./actions";
import { RoleSelect } from "./role-select";

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await createUser(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      setOpen(false);
      return initialFormState;
    }
    return result;
  }, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="shadow-md shadow-primary/25">
          <UserPlusIcon /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a user</DialogTitle>
          <DialogDescription>
            Leave the password blank to email the user a link to set their own.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <FormAlert state={state} />
          <Field name="fullName" label="Full name" required errors={errors.fullName} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="username" label="Username" autoCapitalize="none" required errors={errors.username} />
            <Field name="email" type="email" label="Email" required errors={errors.email} />
          </div>
          <RoleSelect errors={errors.role} />
          <PasswordField
            name="password"
            label="Password (optional)"
            autoComplete="new-password"
            hint="10+ characters with a letter and a number, or leave blank to send an email."
            errors={errors.password}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Creating…">
              Create user
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
