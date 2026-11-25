import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { findValidResetToken } from "@/lib/auth/password-reset";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Reset password" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-muted-foreground text-sm">You&apos;ll be signed out of every device once it&apos;s changed.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <ResetContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ResetContent({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 ? await findValidResetToken(token) : undefined;

  if (!valid || typeof token !== "string") {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Link invalid or expired</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Reset links work once and expire after an hour.</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/forgot-password">Request a new link</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return <ResetPasswordForm token={token} username={valid.username} />;
}
