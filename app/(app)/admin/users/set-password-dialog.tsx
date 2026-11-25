"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { FormAlert, PasswordField, SubmitButton } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { initialFormState, type FormState } from "@/lib/forms";
import { setUserPassword } from "./actions";
import type { UserRow } from "./users-table";

export function SetPasswordDialog({ user, onClose }: { user: UserRow; onClose: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await setUserPassword(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      onClose();
    }
    return result;
  }, initialFormState);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set password for {user.fullName}</DialogTitle>
          <DialogDescription>
            This also unlocks the account and signs the user out of every device. Share the new password securely.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="id" value={user.id} />
          <FormAlert state={state} />
          <PasswordField
            name="password"
            label="New password"
            autoComplete="new-password"
            hint="At least 10 characters, including a letter and a number."
            required
            errors={state.fieldErrors?.password}
          />
          <PasswordField
            name="confirmPassword"
            label="Confirm password"
            autoComplete="new-password"
            required
            errors={state.fieldErrors?.confirmPassword}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SubmitButton pending={pending} pendingText="Saving…">
              Set password
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
