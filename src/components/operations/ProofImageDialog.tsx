import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ProofImageDialog({
  open,
  onOpenChange,
  src,
  title,
  description,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string | null;
  title: string;
  description?: string;
  footer?: ReactNode;
}) {
  if (!src) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(92vh,900px)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="rounded-lg border border-border bg-muted/20 p-2">
          <img
            src={src}
            alt="Payment proof"
            className="mx-auto max-h-[min(70vh,640px)] w-full object-contain"
          />
        </div>
        {footer ? <DialogFooter className="gap-2 sm:gap-0">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

export function ProofImageDialogCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button type="button" variant="outline" onClick={onClose}>
      Close
    </Button>
  );
}
