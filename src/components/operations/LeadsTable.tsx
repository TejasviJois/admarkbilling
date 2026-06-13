import { useMemo, useState } from "react";
import { SearchWithPeriodFilter } from "@/components/operations/SearchWithPeriodFilter";
import {
  DataTable,
  EmptyRow,
  RowDelete,
  RowEdit,
  StatusPill,
} from "@/components/operations/operations-ui";
import { isWithinPeriod, DEFAULT_PERIOD, type PeriodKey } from "@/lib/date-range-filter";
import {
  formatLeadPhone,
  leadStatusLabel,
  leadTelHref,
  sortLeads,
} from "@/lib/lead-utils";
import type { Lead } from "@/lib/types";

function leadMatchesPeriod(lead: Lead, period: PeriodKey): boolean {
  if (period === "all") return true;
  if (!lead.createdAt) return true;
  return isWithinPeriod(lead.createdAt, period);
}

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
  const [period, setPeriod] = useState<PeriodKey>(DEFAULT_PERIOD);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = sortLeads(leads).filter((lead) => {
      if (!leadMatchesPeriod(lead, period)) return false;
      if (!q) return true;
      return (
        lead.name.toLowerCase().includes(q) ||
        lead.business.toLowerCase().includes(q) ||
        (lead.phone ?? "").includes(q) ||
        (lead.notes ?? "").toLowerCase().includes(q)
      );
    });
    return list;
  }, [leads, search, period]);

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
      <SearchWithPeriodFilter
        search={search}
        onSearchChange={setSearch}
        period={period}
        onPeriodChange={setPeriod}
        placeholder="Search leads…"
        className="max-w-xl"
      />
      {filtered.length === 0 ? (
        <EmptyRow message="No leads match your search or date filter." />
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
