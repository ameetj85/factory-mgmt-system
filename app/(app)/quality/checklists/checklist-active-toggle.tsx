"use client";

import { useTransition } from "react";
import { PowerIcon, PowerOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setChecklistActive } from "./actions";

export function ChecklistActiveToggle({ id, active }: { id: number; active: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={active ? "Deactivate checklist" : "Reactivate checklist"}
      className={active ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-primary/10 hover:text-primary"}
      onClick={() =>
        startTransition(async () => {
          const result = await setChecklistActive(id, !active);
          if (result.status === "success") toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      {active ? <PowerOffIcon /> : <PowerIcon />}
    </Button>
  );
}
