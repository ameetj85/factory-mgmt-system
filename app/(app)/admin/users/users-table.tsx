"use client";

import { useState, useTransition } from "react";
import {
  KeyRoundIcon,
  LockIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  UserCheckIcon,
  UserXIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { LocalTime } from "@/components/local-time";
import { RoleBadge } from "@/components/role-badge";
import { UserAvatar } from "@/components/user-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Role } from "@/lib/auth/permissions";
import type { FormState } from "@/lib/forms";
import { sendUserPasswordReset, setUserActive } from "./actions";
import { EditUserDialog } from "./edit-user-dialog";
import { SetPasswordDialog } from "./set-password-dialog";

export interface UserRow {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  isLocked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

type DialogState =
  | { kind: "edit"; user: UserRow }
  | { kind: "password"; user: UserRow }
  | { kind: "deactivate"; user: UserRow }
  | null;

function notify(result: FormState) {
  if (result.status === "success") toast.success(result.message);
  else if (result.status === "error") toast.error(result.message);
}

export function UsersTable({ users, currentUserId }: { users: UserRow[]; currentUserId: number }) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<FormState>) => startTransition(async () => notify(await fn()));

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center">
        <div className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          <UsersIcon className="size-5" />
        </div>
        <p className="font-medium">No users match these filters</p>
        <p className="text-muted-foreground text-sm">Try a different search or clear the filters.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader className="bg-muted/60">
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Last sign-in</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} className="group hover:bg-accent/40 transition-colors">
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={user.fullName} className={user.isActive ? "" : "opacity-50 grayscale"} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {user.fullName}
                        {user.id === currentUserId && <span className="text-muted-foreground ml-1.5 text-xs">(you)</span>}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        @{user.username} · {user.email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <RoleBadge role={user.role} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {user.isActive ? (
                      <Badge variant="outline" className="border-success/40 text-success">
                        <span className="bg-success size-1.5 rounded-full" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                    {user.isLocked && (
                      <Badge variant="outline" className="border-warning/50 text-warning">
                        <LockIcon /> Locked
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-sm lg:table-cell">
                  {user.lastLoginAt ? <LocalTime iso={user.lastLoginAt} /> : "Never"}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={`Actions for ${user.fullName}`}
                        className="opacity-70 group-hover:opacity-100 hover:bg-primary/10 hover:text-primary"
                      >
                        <MoreHorizontalIcon />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", user })}>
                        <PencilIcon /> Edit details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!user.isActive}
                        onSelect={() => run(() => sendUserPasswordReset(user.id))}
                      >
                        <MailIcon /> Send reset link
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "password", user })}>
                        <KeyRoundIcon /> Set password
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {user.isActive ? (
                        <DropdownMenuItem
                          variant="destructive"
                          disabled={user.id === currentUserId}
                          onSelect={() => setDialog({ kind: "deactivate", user })}
                        >
                          <UserXIcon /> Deactivate
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => run(() => setUserActive(user.id, true))}>
                          <UserCheckIcon /> Reactivate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {dialog?.kind === "edit" && <EditUserDialog user={dialog.user} onClose={() => setDialog(null)} />}
      {dialog?.kind === "password" && <SetPasswordDialog user={dialog.user} onClose={() => setDialog(null)} />}
      <AlertDialog open={dialog?.kind === "deactivate"} onOpenChange={(open) => !open && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate {dialog?.user.fullName}?</AlertDialogTitle>
            <AlertDialogDescription>
              They&apos;ll be signed out immediately and won&apos;t be able to sign in. Their history stays in the
              audit log, and you can reactivate them at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={() => {
                const user = dialog?.user;
                if (user) run(() => setUserActive(user.id, false));
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
