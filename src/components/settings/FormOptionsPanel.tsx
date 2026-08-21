import { ChevronDown, ChevronUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  FORM_OPTION_LISTS,
  normalizeFormOptions,
  type FormOptionListKey,
} from "@/lib/form-options";
import { MEMBER_TYPE_SECTIONS, TEAM_GROUP_OPTIONS } from "@/lib/team-payroll";
import type { CompanySettings, FormOptionCatalogs } from "@/lib/types";
import { cn } from "@/lib/utils";

type CatalogId = FormOptionListKey | "teamTypes" | "teamGroups";

const CATALOGS: {
  id: CatalogId;
  label: string;
  hint: string;
  usedOn: string;
}[] = [
  {
    id: "expenseCategories",
    label: "Expense categories",
    hint: "Hosting, Travel, Rent…",
    usedOn: "Expense form",
  },
  {
    id: "incomeCategories",
    label: "Income categories",
    hint: "Client Income, Refund…",
    usedOn: "Income form",
  },
  {
    id: "paymentMethods",
    label: "Payment methods",
    hint: "UPI, Bank Transfer, Cash…",
    usedOn: "All money forms",
  },
  {
    id: "teamTypes",
    label: "Team member types",
    hint: "Advisor, Freelancer…",
    usedOn: "Team directory",
  },
  {
    id: "teamGroups",
    label: "Team groups",
    hint: "Design, Sales…",
    usedOn: "Team directory",
  },
];

function defaultsFor(id: FormOptionListKey): string[] {
  if (id === "expenseCategories") return [...DEFAULT_EXPENSE_CATEGORIES];
  if (id === "incomeCategories") return [...DEFAULT_INCOME_CATEGORIES];
  return [...DEFAULT_PAYMENT_METHODS];
}

function OptionRows({
  values,
  onChange,
  lockedLabels = [],
  addPlaceholder,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  lockedLabels?: string[];
  addPlaceholder: string;
}) {
  const [draft, setDraft] = useState("");
  const addId = useId();

  const renameAt = (index: number, next: string) => {
    const copy = [...values];
    copy[index] = next;
    onChange(copy);
  };

  const removeAt = (index: number) => {
    onChange(values.filter((_, i) => i !== index));
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= values.length) return;
    const copy = [...values];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    onChange(copy);
  };

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    const all = [...lockedLabels, ...values];
    if (all.some((item) => item.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {lockedLabels.length > 0 && (
        <div className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Always included
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {lockedLabels.map((label) => (
              <span
                key={label}
                className="rounded-md border border-border/80 bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {values.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm font-medium text-foreground">No custom options yet</p>
            <p className="text-xs text-muted-foreground">Add the first one below.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {values.map((value, index) => (
              <li
                key={`${index}-${value}`}
                className="group flex items-center gap-1 px-2 py-1.5 sm:px-3"
              >
                <div className="flex shrink-0 flex-col opacity-40 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-20"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    aria-label="Move up"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-20"
                    disabled={index === values.length - 1}
                    onClick={() => move(index, index + 1)}
                    aria-label="Move down"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="w-6 shrink-0 text-center text-[10px] tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <Input
                  value={value}
                  onChange={(e) => renameAt(index, e.target.value)}
                  className="h-9 flex-1 border-transparent bg-transparent shadow-none focus-visible:border-border focus-visible:bg-background"
                  aria-label={`Option ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground opacity-70 hover:text-destructive group-hover:opacity-100"
                  onClick={() => removeAt(index)}
                  aria-label={`Remove ${value}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-muted/20 px-3 py-3 sm:px-4">
        <label htmlFor={addId} className="sr-only">
          Add option
        </label>
        <div className="flex gap-2">
          <Input
            id={addId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={addPlaceholder}
            className="h-10 bg-background text-sm"
          />
          <Button type="button" className="h-10 shrink-0 gap-1.5 px-4" onClick={add}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Press Enter to add · order here is the order in the dropdown
        </p>
      </div>
    </div>
  );
}

export function FormOptionsPanel({
  company,
  onChange,
}: {
  company: CompanySettings;
  onChange: <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => void;
}) {
  const [activeId, setActiveId] = useState<CatalogId>("expenseCategories");
  const catalogs = normalizeFormOptions(company.formOptions);
  const active = CATALOGS.find((item) => item.id === activeId) ?? CATALOGS[0];

  const countFor = (id: CatalogId): number => {
    if (id === "teamTypes") return (company.customMemberTypes ?? []).length;
    if (id === "teamGroups") return (company.customTeamGroups ?? []).length;
    return catalogs[id].length;
  };

  const setCatalog = (key: FormOptionListKey, values: string[]) => {
    const next: FormOptionCatalogs = { ...catalogs, [key]: values };
    onChange("formOptions", normalizeFormOptions(next));
  };

  const resetActive = () => {
    if (activeId === "teamTypes") {
      onChange("customMemberTypes", []);
      return;
    }
    if (activeId === "teamGroups") {
      onChange("customTeamGroups", []);
      return;
    }
    setCatalog(activeId, defaultsFor(activeId));
  };

  const meta = FORM_OPTION_LISTS.find((list) => list.key === activeId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col border-t border-border md:flex-row">
        {/* Catalog picker */}
        <aside className="shrink-0 border-b border-border md:w-56 md:border-b-0 md:border-r lg:w-64">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-bold text-foreground">What to edit</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Pick a list, then add or rename options.
            </p>
          </div>
          <nav className="flex gap-1 overflow-x-auto p-2 md:block md:space-y-0.5 md:overflow-visible">
            {CATALOGS.map((item) => {
              const count = countFor(item.id);
              const selected = activeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveId(item.id)}
                  className={cn(
                    "flex min-w-[9.5rem] flex-col rounded-lg px-3 py-2.5 text-left transition-colors md:min-w-0 md:w-full",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{item.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                        selected ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {count}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 hidden text-[10px] md:block",
                      selected ? "text-primary-foreground/75" : "text-muted-foreground",
                    )}
                  >
                    {item.usedOn}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Editor */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-card/40">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground sm:text-base">{active.label}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {meta?.description ??
                  (activeId === "teamTypes"
                    ? "Extra roles beyond Founder, Employee, Intern, Contractor."
                    : "Extra groups beyond Development and Marketing.")}{" "}
                Used on {active.usedOn.toLowerCase()}. Past ledger rows keep their old labels.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5 text-xs"
              onClick={resetActive}
              title={
                activeId === "teamTypes" || activeId === "teamGroups"
                  ? "Clear custom options"
                  : "Restore default list"
              }
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {activeId === "teamTypes" || activeId === "teamGroups" ? "Clear" : "Reset"}
            </Button>
          </div>

          {activeId === "teamTypes" ? (
            <OptionRows
              values={company.customMemberTypes ?? []}
              onChange={(next) => onChange("customMemberTypes", next)}
              lockedLabels={MEMBER_TYPE_SECTIONS.map((s) => s.formLabel)}
              addPlaceholder="e.g. Advisor"
            />
          ) : activeId === "teamGroups" ? (
            <OptionRows
              values={company.customTeamGroups ?? []}
              onChange={(next) => onChange("customTeamGroups", next)}
              lockedLabels={TEAM_GROUP_OPTIONS.map((o) => o.label)}
              addPlaceholder="e.g. Design"
            />
          ) : (
            <OptionRows
              values={catalogs[activeId]}
              onChange={(next) => setCatalog(activeId, next)}
              addPlaceholder={`Add ${active.hint.split(",")[0]?.toLowerCase() ?? "option"}…`}
            />
          )}
        </section>
      </div>
    </div>
  );
}
