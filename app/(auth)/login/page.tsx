import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2Icon, SparklesIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/db/client";
import { safeRedirectPath } from "@/lib/forms";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground text-sm">Sign in with your username and password.</p>
      </div>
      <Suspense fallback={<FormSkeleton />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function LoginContent({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);

  const users = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  if ((users?.n ?? 0) === 0) {
    return (
      <Alert className="border-primary/30 bg-primary/5">
        <SparklesIcon className="text-primary" />
        <AlertTitle>No accounts yet</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>Create the first administrator account to get started.</p>
          <Button asChild size="sm">
            <Link href="/setup">Run initial setup</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {params.reset === "1" && (
        <Alert className="border-success/40 bg-success/10 text-success">
          <CheckCircle2Icon />
          <AlertDescription className="text-success">
            Your password has been reset. Sign in with your new password.
          </AlertDescription>
        </Alert>
      )}
      <LoginForm next={next} />
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
