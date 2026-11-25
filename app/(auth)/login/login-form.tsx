"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LogInIcon } from "lucide-react";
import { Field, FormAlert, PasswordField, SubmitButton } from "@/components/forms";
import { initialFormState } from "@/lib/forms";
import { login } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, initialFormState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormAlert state={state} />
      <Field
        name="username"
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        autoFocus
        required
        errors={state.fieldErrors?.username}
      />
      <div className="space-y-1.5">
        <PasswordField
          name="password"
          label="Password"
          autoComplete="current-password"
          required
          errors={state.fieldErrors?.password}
        />
        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-primary text-xs font-medium underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      </div>
      <SubmitButton pending={pending} pendingText="Signing in…" className="w-full shadow-md shadow-primary/25">
        <LogInIcon /> Sign in
      </SubmitButton>
    </form>
  );
}
