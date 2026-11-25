"use client";

import { useTransition } from "react";
import { CheckCircle2Icon, CircleOffIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setBomActive } from "../actions";

export function BomActiveToggle({ bomId, active }: { bomId: number; active: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      className={active ? "hover:border-destructive/40 hover:text-destructive" : "hover:border-primary/50 hover:text-primary"}
      onClick={() =>
        startTransition(async () => {
          const result = await setBomActive(bomId, !active);
          if (result.status === "success") toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : active ? <CircleOffIcon /> : <CheckCircle2Icon />}
      {active ? "Deactivate" : "Make active"}
    </Button>
  );
}
