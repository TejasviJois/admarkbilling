import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERIOD_OPTIONS, type PeriodKey } from "@/lib/date-range-filter";
import { cn } from "@/lib/utils";

export function SearchWithPeriodFilter({
  id,
  search,
  onSearchChange,
  period,
  onPeriodChange,
  placeholder = "Search…",
  className,
  inputClassName,
  periodOptions = PERIOD_OPTIONS,
}: {
  id?: string;
  search: string;
  onSearchChange: (value: string) => void;
  period: PeriodKey;
  onPeriodChange: (value: PeriodKey) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  periodOptions?: { value: PeriodKey; label: string }[];
}) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-center", className)}>
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className={cn("pl-9", inputClassName)}
          aria-label={placeholder}
        />
      </div>
      <Select value={period} onValueChange={(v) => onPeriodChange(v as PeriodKey)}>
        <SelectTrigger className="h-9 w-full shrink-0 sm:w-[9.5rem]" aria-label="Time period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periodOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
