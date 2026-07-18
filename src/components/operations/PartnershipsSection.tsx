import { useMemo, useState } from "react";
import { Handshake, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OperationsData, Partnership, PartnershipStatus } from "@/lib/types";
import type { PersistOperations } from "@/lib/operations-mutations";
import { partnershipStatusBadgeClass, partnershipStatusLabel } from "@/lib/partnership-status";
import {
  DataSection,
  DataTable,
  EmptyRow,
  Field,
  RowDelete,
  RowEdit,
  ContactLinks,
} from "./operations-ui";

const PARTNERSHIP_STATUSES: PartnershipStatus[] = ["active", "prospect", "inactive"];

function PartnershipStatusBadge({ status }: { status: PartnershipStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${partnershipStatusBadgeClass(status)}`}
    >
      {partnershipStatusLabel(status)}
    </span>
  );
}

export function PartnershipsPipelineSummary({ partnerships }: { partnerships: Partnership[] }) {
  const counts = {
    active: partnerships.filter((p) => p.status === "active").length,
    prospect: partnerships.filter((p) => p.status === "prospect").length,
    inactive: partnerships.filter((p) => p.status === "inactive").length,
  };

  const items = [
    { label: "Confirmed", count: counts.active, className: "text-emerald-300" },
    { label: "Warm", count: counts.prospect, className: "text-amber-300" },
    { label: "Not interested", count: counts.inactive, className: "text-rose-300" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border bg-card px-4 py-3 text-center shadow-sm"
        >
          <p className={`text-2xl font-semibold tabular-nums ${item.className}`}>{item.count}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export function PartnershipsSection({
  ops,
  persist,
  onEdit,
}: {
  ops: OperationsData;
  persist: PersistOperations;
  onEdit: (partnership: Partnership) => void;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PartnershipStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ops.partnerships.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      const haystack = [
        p.name,
        p.type,
        p.opportunityType,
        p.phone,
        p.email,
        p.contact,
        partnershipStatusLabel(p.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [ops.partnerships, search, statusFilter]);

  const removePartnership = (id: string) => {
    persist(
      { ...ops, partnerships: ops.partnerships.filter((p) => p.id !== id) },
      { deleteIds: { partnerships: [id] } },
    );
  };

  return (
    <DataSection
      title="All partnerships"
      description="Partner agencies and collaborators — type, status, and opportunity model."
      icon={<Handshake className="h-5 w-5 text-primary" strokeWidth={2} />}
    >
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto] lg:items-end">
        <Field label="Search" id="part-search">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="part-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Partner, type, opportunity…"
              className="pl-9"
            />
          </div>
        </Field>
        <Field label="Status" id="part-filter-status">
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as PartnershipStatus | "all")}
          >
            <SelectTrigger id="part-filter-status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {PARTNERSHIP_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {partnershipStatusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {ops.partnerships.length === 0 ? (
        <EmptyRow message="No partnerships logged yet." />
      ) : filtered.length === 0 ? (
        <EmptyRow message="No partnerships match your search." />
      ) : (
        <DataTable
          headers={["Partner", "Type", "Status", "Opportunity type", "Contact", ""]}
          rows={filtered.map((p) => [
            p.name,
            p.type || "—",
            <PartnershipStatusBadge key={`st-${p.id}`} status={p.status} />,
            p.opportunityType || "—",
            <ContactLinks
              key={`contact-${p.id}`}
              phone={p.phone}
              email={p.email}
              legacyContact={p.contact}
            />,
            <div key={`actions-${p.id}`} className="flex items-center justify-end gap-1">
              <RowEdit onClick={() => onEdit(p)} />
              <RowDelete onClick={() => removePartnership(p.id)} />
            </div>,
          ])}
        />
      )}
    </DataSection>
  );
}
