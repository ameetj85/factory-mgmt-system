import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-muted-foreground text-sm">
          Enter your username or email. If it matches an active account, we&apos;ll email you a reset link.
        </p>
      </div>
      <ForgotPasswordForm />
      <Link
        href="/login"
        className="text-muted-foreground hover:text-primary inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeftIcon className="size-4" /> Back to sign in
      </Link>
    </div>
  );
}
