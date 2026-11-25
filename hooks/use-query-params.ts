"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/**
 * Updates search params without a full navigation. Setting a value to "" or undefined removes it;
 * any filter change resets pagination.
 */
export function useQueryParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(changes: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    if (!("page" in changes)) params.delete("page");
    startTransition(() => router.replace(params.size ? `${pathname}?${params}` : pathname));
  }

  return { update, pending, searchParams };
}
