import { Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import type { CompanySettings } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-24 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6",
        className,
      )}
    >
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function SettingsField({
  label,
  value,
  onChange,
  className,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

export function SettingsProfileHero({
  company,
  logoPreview,
  onLogoUpload,
  onLogoClear,
  onFieldChange,
}: {
  company: CompanySettings;
  logoPreview?: string;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLogoClear: () => void;
  onFieldChange: <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-card via-card to-muted/20 p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex shrink-0 flex-col items-center gap-3 sm:flex-row lg:flex-col">
          <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
            {logoPreview ? (
              <img
                src={logoPreview}
                alt="Company logo"
                className="h-full w-full object-contain p-2"
              />
            ) : (
              <span className="text-xs text-muted-foreground">No logo</span>
            )}
          </div>
          <div className="flex gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />
              Upload
              <input type="file" accept="image/*" className="hidden" onChange={onLogoUpload} />
            </label>
            {company.logoDataUrl && (
              <button
                type="button"
                onClick={onLogoClear}
                className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 grid gap-4 sm:grid-cols-2">
          <SettingsField
            label="Company name"
            value={company.name}
            onChange={(v) => onFieldChange("name", v)}
            className="sm:col-span-2"
          />
          <SettingsField
            label="Tagline"
            value={company.tagline || ""}
            onChange={(v) => onFieldChange("tagline", v)}
            placeholder="Short description on invoices"
            className="sm:col-span-2"
          />
          <SettingsField
            label="Primary email"
            type="email"
            value={company.email}
            onChange={(v) => onFieldChange("email", v)}
          />
          <SettingsField
            label="Primary phone"
            value={company.phone || ""}
            onChange={(v) => onFieldChange("phone", v)}
          />
          <SettingsField
            label="Website"
            value={company.website || ""}
            onChange={(v) => onFieldChange("website", v)}
            placeholder="https://…"
            className="sm:col-span-2"
          />
          <SettingsField
            label="Authorized signatory"
            value={company.authorizedName || ""}
            onChange={(v) => onFieldChange("authorizedName", v)}
            className="sm:col-span-2"
          />
        </div>
      </div>
    </div>
  );
}

export function SettingsQuickLinks({
  links,
}: {
  links: { label: string; description: string; to: string; hash?: string }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {links.map((link) => (
        <Link
          key={link.to + (link.hash ?? "")}
          to={link.to}
          hash={link.hash}
          className="rounded-lg border border-border bg-muted/10 px-4 py-3 transition-colors hover:border-primary/30 hover:bg-muted/20"
        >
          <p className="font-medium text-foreground">{link.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{link.description}</p>
        </Link>
      ))}
    </div>
  );
}

export function SettingsImageField({
  label,
  value,
  emptyPreviewSrc,
  onChange,
  onClear,
}: {
  label: string;
  value?: string;
  emptyPreviewSrc?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}) {
  const previewSrc = value || emptyPreviewSrc;
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-4 rounded-lg border border-dashed border-border bg-background p-4">
        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-lg bg-muted/40">
          {previewSrc ? (
            <img src={previewSrc} alt={label} className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">No image</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted">
            <Upload className="h-3.5 w-3.5" />
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={onChange} />
          </label>
          {value && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-muted-foreground hover:text-destructive"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
