"use client";

import { useState, useTransition } from "react";
import { DatabaseBackupIcon, DownloadIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { backupNow, removeBackup } from "./actions";

export function BackupNowButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      className="shadow-md shadow-primary/25"
      onClick={() =>
        startTransition(async () => {
          const result = await backupNow();
          if (result.status === "success") toast.success(result.message);
          else toast.error(result.message);
        })
      }
    >
      {pending ? <Loader2Icon className="animate-spin" /> : <DatabaseBackupIcon />} {pending ? "Backing up…" : "Back up now"}
    </Button>
  );
}

export function BackupActions({ name }: { name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex justify-end gap-1">
      <Button asChild variant="ghost" size="sm" className="hover:text-primary">
        <a href={`/api/backups/${name}`} download>
          <DownloadIcon /> Download
        </a>
      </Button>
      <Button variant="ghost" size="icon-sm" className="hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirm(true)} aria-label={`Delete ${name}`}>
        <Trash2Icon />
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this backup?</AlertDialogTitle>
            <AlertDialogDescription>{name} will be removed from the server. Download it first if you want to keep a copy.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={(e) => {
                e.preventDefault();
                startTransition(async () => {
                  const result = await removeBackup(name);
                  if (result.status === "success") toast.success(result.message);
                  else toast.error(result.message);
                  setConfirm(false);
                });
              }}
            >
              {pending && <Loader2Icon className="animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
