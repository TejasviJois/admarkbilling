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
    <section id={id} className={cn("scroll-mt-24 space-y-3", className)}>
      <div>
        <h2 className="text-sm font-medium tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
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
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
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
    <div className="flex flex-col gap-6 border-y border-border/80 py-5 lg:flex-row lg:items-start">
      <div className="flex shrink-0 flex-col items-center gap-3 sm:flex-row lg:flex-col">
        <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-xl border border-border/80 bg-muted/20">
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
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/50">
            <Upload className="h-3.5 w-3.5" />
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={onLogoUpload} />
          </label>
          {company.logoDataUrl && (
            <button
              type="button"
              onClick={onLogoClear}
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
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
  );
}

export function SettingsQuickLinks({
  links,
}: {
  links: { label: string; description: string; to: string; hash?: string }[];
}) {
  return (
    <div className="divide-y divide-border/80 border-y border-border/80">
      {links.map((link) => (
        <Link
          key={link.to + (link.hash ?? "")}
          to={link.to}
          hash={link.hash}
          className="block py-3 transition-colors hover:bg-muted/20"
        >
          <p className="text-sm font-medium text-foreground">{link.label}</p>
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
      <div className="flex items-center gap-4 border-y border-border/80 py-4">
        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-lg bg-muted/30">
          {previewSrc ? (
            <img src={previewSrc} alt={label} className="h-full w-full object-contain" />
          ) : (
            <span className="text-xs text-muted-foreground">No image</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted/50">
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
