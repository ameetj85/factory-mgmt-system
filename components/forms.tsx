"use client";

import { useState } from "react";
import { AlertCircleIcon, CheckCircle2Icon, EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/forms";
import { cn } from "@/lib/utils";

interface FieldProps extends React.ComponentProps<typeof Input> {
  name: string;
  label: string;
  hint?: string;
  errors?: string[];
}

export function Field({ name, label, hint, errors, className, id, ...props }: FieldProps) {
  const fieldId = id ?? name;
  const invalid = Boolean(errors?.length);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        name={name}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn("h-10", className)}
        {...props}
      />
      <FieldMessage id={fieldId} hint={hint} errors={errors} />
    </div>
  );
}

export function PasswordField({ name, label, hint, errors, className, id, ...props }: FieldProps) {
  const [visible, setVisible] = useState(false);
  const fieldId = id ?? name;
  const invalid = Boolean(errors?.length);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId}>{label}</Label>
      <div className="relative">
        <Input
          id={fieldId}
          name={name}
          type={visible ? "text" : "password"}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
          className={cn("h-10 pr-10", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="text-muted-foreground hover:text-primary absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg transition-colors"
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
      <FieldMessage id={fieldId} hint={hint} errors={errors} />
    </div>
  );
}

export function FieldMessage({ id, hint, errors }: { id: string; hint?: string; errors?: string[] }) {
  if (errors?.length) {
    return (
      <p id={`${id}-error`} className="text-destructive text-xs">
        {errors[0]}
      </p>
    );
  }
  if (hint) {
    return (
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {hint}
      </p>
    );
  }
  return null;
}

export function FormAlert({ state }: { state: FormState }) {
  if (state.status === "idle" || !state.message) return null;
  const success = state.status === "success";
  return (
    <Alert
      variant={success ? "default" : "destructive"}
      className={cn(success && "border-success/40 bg-success/10 text-success")}
    >
      {success ? <CheckCircle2Icon /> : <AlertCircleIcon />}
      <AlertDescription className={cn(success && "text-success")}>{state.message}</AlertDescription>
    </Alert>
  );
}

export function SubmitButton({
  pending,
  children,
  pendingText,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pending: boolean; pendingText?: string }) {
  return (
    <Button type="submit" disabled={pending} className={cn("h-10", className)} {...props}>
      {pending && <Loader2Icon className="animate-spin" />}
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}
