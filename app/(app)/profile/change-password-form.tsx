"use client";

import { useActionState, useRef } from "react";
import { toast } from "sonner";
import { PasswordField, SubmitButton, FormAlert } from "@/components/forms";
import { initialFormState, type FormState } from "@/lib/forms";
import { changePassword } from "./actions";

export function ChangePasswordForm({ username }: { username: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await changePassword(prev, formData);
    if (result.status === "success") {
      toast.success(result.message);
      formRef.current?.reset();
      return initialFormState;
    }
    return result;
  }, initialFormState);

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <input type="hidden" name="username" autoComplete="username" value={username} />
      <FormAlert state={state} />
      <PasswordField
        name="currentPassword"
        label="Current password"
        autoComplete="current-password"
        required
        errors={state.fieldErrors?.currentPassword}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField
          name="password"
          label="New password"
          autoComplete="new-password"
          required
          hint="10+ characters, a letter and a number."
          errors={state.fieldErrors?.password}
        />
        <PasswordField
          name="confirmPassword"
          label="Confirm new password"
          autoComplete="new-password"
          required
          errors={state.fieldErrors?.confirmPassword}
        />
      </div>
      <SubmitButton pending={pending} pendingText="Updating…">
        Update password
      </SubmitButton>
    </form>
  );
}
