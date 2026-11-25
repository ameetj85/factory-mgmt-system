"use client";

import { FieldMessage } from "@/components/forms";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLES, type Role } from "@/lib/auth/permissions";

export function RoleSelect({ defaultValue, errors }: { defaultValue?: Role; errors?: string[] }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="role">Role</Label>
      <Select name="role" defaultValue={defaultValue}>
        <SelectTrigger id="role" className="h-10 w-full" aria-invalid={errors?.length ? true : undefined}>
          <SelectValue placeholder="Choose a role" />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((role) => (
            <SelectItem key={role} value={role} className="py-2">
              <div className="flex flex-col items-start">
                <span className="font-medium">{ROLE_LABELS[role]}</span>
                <span className="text-muted-foreground max-w-72 text-xs whitespace-normal">{ROLE_DESCRIPTIONS[role]}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldMessage id="role" errors={errors} />
    </div>
  );
}
