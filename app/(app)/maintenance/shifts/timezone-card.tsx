"use client";

import { useSyncExternalStore, useState, useTransition } from "react";
import { GlobeIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Combobox } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { setFactoryTimeZone } from "./actions";

const noop = () => () => {};
const zones = (): string[] => (typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"]);

export function TimezoneCard({ timeZone }: { timeZone: string }) {
  const browserZone = useSyncExternalStore(noop, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "");
  const [value, setValue] = useState(timeZone);
  const [pending, startTransition] = useTransition();
  const unset = timeZone === "UTC" && browserZone && browserZone !== "UTC";

  const save = (tz: string) =>
    startTransition(async () => {
      const result = await setFactoryTimeZone(tz);
      if (result.status === "success") toast.success(result.message);
      else toast.error(result.message);
    });

  return (
    <Card className={cn(unset && "border-warning/50 bg-warning/5")}>
      <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
            <GlobeIcon className="size-5" />
          </div>
          <div>
            <p className="font-medium">Factory time zone: {timeZone}</p>
            <p className="text-muted-foreground text-sm">
              {unset
                ? `Shift start times are read in this zone. Your browser is in ${browserZone}. Is that where the factory is?`
                : "Shift start times are read in this zone, including daylight-saving changes."}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {unset && (
            <Button onClick={() => save(browserZone)} disabled={pending}>
              {pending && <Loader2Icon className="animate-spin" />} Use {browserZone}
            </Button>
          )}
          <div className="sm:w-64">
            <Combobox
              value={value}
              onChange={(tz) => {
                setValue(tz);
                if (tz !== timeZone) save(tz);
              }}
              searchPlaceholder="Search time zones…"
              options={zones().map((z) => ({ value: z, label: z }))}
              disabled={pending}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
