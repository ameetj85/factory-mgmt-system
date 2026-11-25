"use client";

import { useTransition } from "react";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signOutOtherSessions } from "./actions";

export function SignOutOthersButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      className="hover:border-destructive/40 hover:text-destructive"
      onClick={() =>
        startTransition(async () => {
          const result = await signOutOtherSessions();
          if (result.message) toast.success(result.message);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <LogOutIcon />}
      Sign out other devices
    </Button>
  );
}
