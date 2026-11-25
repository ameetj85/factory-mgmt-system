import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/lib/db/client";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Initial setup" };

export default function SetupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Create the administrator</h1>
        <p className="text-muted-foreground text-sm">
          This first account has full access. You can add the rest of the team afterwards.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <SetupContent />
      </Suspense>
    </div>
  );
}

async function SetupContent() {
  const users = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM users");
  if ((users?.n ?? 0) > 0) redirect("/login");
  return <SetupForm />;
}
