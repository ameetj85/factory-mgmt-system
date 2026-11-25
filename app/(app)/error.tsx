"use client";

import { TriangleAlertIcon } from "lucide-react";
import { StatusScreen } from "@/components/status-screen";
import { Button } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <StatusScreen
      icon={TriangleAlertIcon}
      title="Something went wrong"
      description={
        error.digest
          ? `The page couldn't be loaded. If this keeps happening, share reference ${error.digest} with an administrator.`
          : "The page couldn't be loaded. Check your connection and try again."
      }
    >
      <Button onClick={() => retry()}>Try again</Button>
    </StatusScreen>
  );
}
