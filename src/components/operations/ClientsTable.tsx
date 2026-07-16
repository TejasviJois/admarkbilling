import { Edit2, Eye, Trash2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Client } from "@/lib/types";

export function ClientsTable({
  clients,
  onEdit,
  onRemove,
}: {
  clients: Client[];
  onEdit: (client: Client) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 font-medium text-muted-foreground">
              <th className="px-4 py-3">Company Name</th>
              <th className="px-4 py-3">Contact Person</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Client Since</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No clients configured. Add your first client profile to get started.
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap px-4 py-3 font-semibold text-foreground">
                    <Link
                      to="/clients/$id"
                      params={{ id: c.id }}
                      className="hover:underline text-primary"
                    >
                      {c.companyName}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {c.contactPerson}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {c.email}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {c.phone}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {c.clientSince}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        c.status === "active"
                          ? "bg-green-500/10 text-green-500"
                          : "bg-muted-foreground/10 text-muted-foreground"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Link
                        to="/clients/$id"
                        params={{ id: c.id }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-secondary"
                        title="View Client Overview"
                        aria-label="View Client Overview"
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => onEdit(c)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-muted-foreground hover:bg-secondary"
                        title="Edit Client"
                        aria-label="Edit Client"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemove(c.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-card text-destructive hover:bg-destructive/10"
                        title="Delete Client"
                        aria-label="Delete Client"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
