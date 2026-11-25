import { z } from "zod";
import { parseCents, parseQtyMilli } from "@/lib/quantity";

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

/** Decimal quantity input (up to 3 decimals) → integer thousandths. */
export function qtyMilliSchema({ allowZero = false, label = "quantity" }: { allowZero?: boolean; label?: string } = {}) {
  return z
    .string()
    .trim()
    .transform((value, ctx) => {
      const milli = parseQtyMilli(value);
      if (milli === null) {
        ctx.addIssue({ code: "custom", message: `Enter a ${label} with up to 3 decimals.` });
        return z.NEVER;
      }
      if (!allowZero && milli === 0) {
        ctx.addIssue({ code: "custom", message: `The ${label} must be greater than zero.` });
        return z.NEVER;
      }
      return milli;
    });
}

/** Optional money input → integer cents, or null when left blank. */
export const optionalCentsSchema = z
  .string()
  .default("")
  .transform((raw, ctx) => {
    const value = raw.trim();
    if (value === "") return null;
    const cents = parseCents(value);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 12.50." });
      return z.NEVER;
    }
    return cents;
  });

/** Optional free text: trims and turns empty strings into null. */
export function optionalText(max = 500) {
  return z
    .string()
    .default("")
    .transform((v) => v.trim())
    .refine((v) => v.length <= max, `Use at most ${max} characters.`)
    .transform((v) => (v === "" ? null : v));
}

export const idSchema = z.coerce.number().int().positive();

/** Only allows same-site relative paths, preventing open redirects through ?next=. */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  return value;
}
