import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import type { CompanyMember } from "@/lib/types";

export function DeleteMemberDialog({
  open,
  onOpenChange,
  member,
  deleting = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: CompanyMember | null;
  deleting?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  if (!member) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border border-white/10 bg-[#0d0d12]/95 backdrop-blur-2xl text-white shadow-2xl sm:max-w-md">
        <AlertDialogHeader className="space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
            <Trash2 className="h-6 w-6" />
          </div>
          <AlertDialogTitle className="text-xl font-bold text-white">
            Delete Team Member?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs leading-relaxed text-white/60">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-white">{member.name}</span>
            {member.employeeId ? ` (${member.employeeId})` : ""}? This will remove them from the
            team directory, salary tracker, and any project assignments. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 gap-2 sm:gap-3">
          <AlertDialogCancel
            disabled={deleting}
            className="rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          >
            Cancel
          </AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={onConfirm}
            className="gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-rose-600 font-bold text-white shadow-lg shadow-rose-500/25 hover:brightness-110 active:scale-95 transition-all"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Deleting…
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4" /> Delete Member
              </>
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
