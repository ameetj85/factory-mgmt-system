"use client";

import { useActionState } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { Field, FormAlert, PasswordField, SubmitButton } from "@/components/forms";
import { initialFormState } from "@/lib/forms";
import { setupAdmin } from "../actions";

export function SetupForm() {
  const [state, action, pending] = useActionState(setupAdmin, initialFormState);
  const errors = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4">
      <FormAlert state={state} />
      <Field name="fullName" label="Full name" autoComplete="name" autoFocus required errors={errors.fullName} />
      <Field
        name="username"
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        required
        errors={errors.username}
      />
      <Field
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        hint="Used for password reset emails."
        required
        errors={errors.email}
      />
      <PasswordField
        name="password"
        label="Password"
        autoComplete="new-password"
        hint="At least 10 characters, including a letter and a number."
        required
        errors={errors.password}
      />
      <PasswordField
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        required
        errors={errors.confirmPassword}
      />
      <SubmitButton pending={pending} pendingText="Creating account…" className="w-full shadow-md shadow-primary/25">
        <ShieldCheckIcon /> Create administrator
      </SubmitButton>
    </form>
  );
}
