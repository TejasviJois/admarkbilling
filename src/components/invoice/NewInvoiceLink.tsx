import { Link } from "@tanstack/react-router";
import { preloadNewInvoiceRoute } from "@/lib/prefetch-invoice-editor";

type NewInvoiceLinkProps = React.ComponentProps<typeof Link>;

/** Prefetches the invoice form chunk on hover / touch so /new opens fast. */
export function NewInvoiceLink({ to = "/new", onMouseEnter, onTouchStart, ...props }: NewInvoiceLinkProps) {
  const warm = () => preloadNewInvoiceRoute();

  return (
    <Link
      to={to}
      preload="intent"
      onMouseEnter={(e) => {
        warm();
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        onTouchStart?.(e);
      }}
      {...props}
    />
  );
}
