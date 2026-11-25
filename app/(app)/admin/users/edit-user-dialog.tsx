"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Field, FormAlert, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { initialFormState, type FormState } from "@/lib/forms";
import { updateUser } from "./actions";
import { RoleSelect } from "./role-select";
import type { UserRow } from "./users-table";

export function EditUserDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await updateUser(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      onClose();
    }
    return result;
  }, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {user.fullName}</DialogTitle>
          <DialogDescription>Signed in as @{user.username}. Usernames can&apos;t be changed.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={user.id} />
          <FormAlert state={state} />
          <Field name="fullName" label="Full name" defaultValue={user.fullName} required errors={errors.fullName} />
          <Field name="email" type="email" label="Email" defaultValue={user.email} required errors={errors.email} />
          <RoleSelect defaultValue={user.role} errors={errors.role} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              Save changes
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
