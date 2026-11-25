"use client";

import { useActionState } from "react";
import { MailIcon } from "lucide-react";
import { Field, FormAlert, SubmitButton } from "@/components/forms";
import { initialFormState } from "@/lib/forms";
import { forgotPassword } from "../actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPassword, initialFormState);

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      {state.status !== "success" && (
        <>
          <Field
            name="identifier"
            label="Username or email"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
            required
            errors={state.fieldErrors?.identifier}
          />
          <SubmitButton pending={pending} pendingText="Sending…" className="w-full shadow-md shadow-primary/25">
            <MailIcon /> Send reset link
          </SubmitButton>
        </>
      )}
    </form>
  );
}
