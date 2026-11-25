import { z } from "zod";

/** Result shape returned by every form Server Action, consumed with useActionState. */
export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialFormState: FormState = { status: "idle" };

export function validationError(error: z.ZodError): FormState {
  return {
    status: "error",
    message: "Please correct the highlighted fields.",
    fieldErrors: z.flattenError(error).fieldErrors as Record<string, string[] | undefined>,
  };
}

export function formError(message: string): FormState {
  return { status: "error", message };
}

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(128, "Use at most 128 characters.")
  .regex(/[A-Za-z]/, "Include at least one letter.")
  .regex(/[0-9]/, "Include at least one number.");

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters.")
  .max(32, "Use at most 32 characters.")
  .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores.");

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address."));

export const fullNameSchema = z.string().trim().min(2, "Enter a name.").max(100, "Use at most 100 characters.");

/** Adds a "passwords must match" check for forms with password + confirmPassword fields. */
export function withPasswordConfirmation<T extends z.ZodObject<{ password: z.ZodType; confirmPassword: z.ZodType }>>(
  schema: T,
) {
  return schema.refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });
}

/** Only allows same-site relative paths, preventing open redirects through ?next=. */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
