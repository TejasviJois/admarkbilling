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
    <section id={id} className={cn("glass-panel scroll-mt-24 rounded-3xl border border-white/10 p-6 shadow-2xl space-y-5", className)}>
      <div className="border-b border-white/10 pb-3">
        <h2 className="text-base font-bold tracking-tight text-white">{title}</h2>
        {description && <p className="mt-1 text-xs text-white/50">{description}</p>}
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
      <span className="mb-1.5 block text-xs font-semibold text-white/60">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-all focus:border-orange-500/50 focus:bg-white/[0.08]"
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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start pt-2">
      <div className="flex shrink-0 flex-col items-center gap-3 sm:flex-row lg:flex-col">
        <div className="grid h-24 w-48 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-inner p-2">
          {logoPreview ? (
            <img
              src={logoPreview}
              alt="Company logo"
              className="h-full w-full object-contain drop-shadow-[0_2px_8px_rgba(255,107,43,0.3)]"
            />
          ) : (
            <span className="text-xs text-white/40">No logo</span>
          )}
        </div>
        <div className="flex gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition-colors">
            <Upload className="h-3.5 w-3.5 text-[#ff6b2b]" />
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={onLogoUpload} />
          </label>
          {company.logoDataUrl && (
            <button
              type="button"
              onClick={onLogoClear}
              className="rounded-xl px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
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
    <div className="divide-y divide-white/10 border-y border-white/10">
      {links.map((link) => (
        <Link
          key={link.to + (link.hash ?? "")}
          to={link.to}
          hash={link.hash}
          className="block py-3.5 transition-colors hover:bg-white/[0.04]"
        >
          <p className="text-sm font-bold text-white">{link.label}</p>
          <p className="mt-0.5 text-xs text-white/50">{link.description}</p>
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
      <span className="mb-2 block text-xs font-semibold text-white/60">{label}</span>
      <div className="flex items-center gap-4 border-t border-white/10 py-4">
        <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {previewSrc ? (
            <img src={previewSrc} alt={label} className="h-full w-full object-contain p-1.5" />
          ) : (
            <span className="text-xs text-white/40">No image</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/10 transition-colors">
            <Upload className="h-3.5 w-3.5 text-[#ff6b2b]" />
            Upload
            <input type="file" accept="image/*" className="hidden" onChange={onChange} />
          </label>
          {value && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-semibold text-rose-400 hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
