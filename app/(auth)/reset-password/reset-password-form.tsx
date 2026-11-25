"use client";

import { useActionState } from "react";
import { KeyRoundIcon } from "lucide-react";
import { FormAlert, PasswordField, SubmitButton } from "@/components/forms";
import { initialFormState } from "@/lib/forms";
import { resetPassword } from "../actions";

export function ResetPasswordForm({ token, username }: { token: string; username: string }) {
  const [state, action, pending] = useActionState(resetPassword, initialFormState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {/* Lets password managers associate the new password with the right account. */}
      <input type="hidden" name="username" autoComplete="username" value={username} />
      <FormAlert state={state} />
      <PasswordField
        name="password"
        label="New password"
        autoComplete="new-password"
        autoFocus
        required
        hint="At least 10 characters, including a letter and a number."
        errors={state.fieldErrors?.password}
      />
      <PasswordField
        name="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        required
        errors={state.fieldErrors?.confirmPassword}
      />
      <SubmitButton pending={pending} pendingText="Saving…" className="w-full shadow-md shadow-primary/25">
        <KeyRoundIcon /> Reset password
      </SubmitButton>
    </form>
  );
}
