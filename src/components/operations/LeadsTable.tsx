import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DataTable,
  EmptyRow,
  RowDelete,
  RowEdit,
  StatusPill,
} from "@/components/operations/operations-ui";
import {
  formatLeadPhone,
  leadStatusLabel,
  leadTelHref,
  sortLeads,
} from "@/lib/lead-utils";
import type { Lead } from "@/lib/types";

export function LeadsTable({
  leads,
  onEdit,
  onRemove,
}: {
  leads: Lead[];
  onEdit: (lead: Lead) => void;
  onRemove: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sortLeads(leads);
    if (!q) return list;
    return list.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.business.toLowerCase().includes(q) ||
        (l.phone ?? "").includes(q) ||
        (l.notes ?? "").toLowerCase().includes(q),
    );
  }, [leads, search]);

  if (leads.length === 0) {
    return <EmptyRow message="No leads yet. Tap + to add your first lead." />;
  }

  const rows = filtered.map((lead) => {
    const tel = leadTelHref(lead.phone);
    return [
      <span key={`name-${lead.id}`} className="font-medium">
        {lead.name}
      </span>,
      lead.business,
      tel ? (
        <a key={`phone-${lead.id}`} href={tel} className="tabular-nums text-primary hover:underline">
          {formatLeadPhone(lead.phone)}
        </a>
      ) : (
        <span key={`phone-${lead.id}`} className="text-muted-foreground">
          —
        </span>
      ),
      <StatusPill key={`status-${lead.id}`} label={leadStatusLabel(lead.status)} />,
      lead.notes?.trim() ? (
        <span key={`notes-${lead.id}`} className="line-clamp-2 max-w-[14rem] text-muted-foreground">
          {lead.notes}
        </span>
      ) : (
        <span key={`notes-${lead.id}`} className="text-muted-foreground">
          —
        </span>
      ),
      <span key={`actions-${lead.id}`} className="flex items-center gap-1">
        <RowEdit onClick={() => onEdit(lead)} />
        <RowDelete onClick={() => onRemove(lead.id)} />
      </span>,
    ];
  });

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search leads…"
          className="pl-9"
          aria-label="Search leads"
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyRow message="No leads match your search." />
      ) : (
        <DataTable
          headers={["Name", "Business", "Phone", "Status", "Notes", ""]}
          rows={rows}
          footerRow={[
            `${filtered.length} lead${filtered.length === 1 ? "" : "s"}`,
            "",
            "",
            "",
            "",
            "",
          ]}
        />
      )}
    </div>
  );
}
