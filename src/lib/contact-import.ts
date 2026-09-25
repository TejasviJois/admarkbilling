import type { Contact } from "@/lib/types";
import {
  inferSalesSector,
  normalizeSalesSector,
  UNCATEGORIZED_SECTOR,
} from "@/lib/sales-sectors";

type XlsxModule = typeof import("xlsx");

export type ContactImportRow = {
  personName: string;
  companyName?: string;
  phone?: string;
  contactVia?: string;
  sector?: string;
  email?: string;
  designation?: string;
};

export type ContactImportResult = {
  rows: ContactImportRow[];
  sheetName: string;
  rowCount: number;
};

const HEADER_ALIASES: Record<string, keyof ContactImportRow> = {
  name: "personName",
  "person name": "personName",
  person: "personName",
  contact: "personName",
  "contact name": "personName",
  company: "companyName",
  "company name": "companyName",
  organisation: "companyName",
  organization: "companyName",
  phone: "phone",
  mobile: "phone",
  "phone number": "phone",
  "contact phone": "phone",
  via: "contactVia",
  "contact via": "contactVia",
  "contact through": "contactVia",
  through: "contactVia",
  sector: "sector",
  industry: "sector",
  genre: "sector",
  category: "sector",
  email: "email",
  "e-mail": "email",
  "mail id": "email",
  "mail": "email",
  designation: "designation",
  role: "designation",
  title: "designation",
  "job title": "designation",
  "job role": "designation",
};

function cleanCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value).replace(/\u0000/g, "").trim();
}

function normalizeHeader(value: unknown): string {
  return cleanCell(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function newContactId(): string {
  return `ct_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function parseMatrix(matrix: unknown[][], sheetName: string): ContactImportResult {
  if (matrix.length < 2) {
    throw new Error("The sheet has a header but no data rows.");
  }
  const headers = (matrix[0] ?? []).map(normalizeHeader);
  const fieldIndex = new Map<keyof ContactImportRow, number>();
  headers.forEach((header, index) => {
    const field = HEADER_ALIASES[header];
    if (field) fieldIndex.set(field, index);
  });
  if (!fieldIndex.has("personName") && !fieldIndex.has("companyName")) {
    throw new Error('Missing required column "Name" or "Company".');
  }

  const rows: ContactImportRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i] ?? [];
    const read = (field: keyof ContactImportRow) => {
      const index = fieldIndex.get(field);
      if (index == null) return "";
      return cleanCell(row[index]);
    };
    const personName = read("personName") || read("companyName");
    const companyName = read("companyName") || undefined;
    const phone = read("phone") || undefined;
    const contactVia = read("contactVia") || undefined;
    const email = read("email") || undefined;
    const designation = read("designation") || undefined;
    if (!personName && !companyName && !phone) continue;
    const sectorRaw = read("sector");
    const sector = sectorRaw
      ? normalizeSalesSector(sectorRaw)
      : inferSalesSector(companyName, personName);
    rows.push({
      personName: personName || companyName || `Contact ${i}`,
      companyName: companyName || undefined,
      phone,
      contactVia,
      email,
      designation,
      sector: sector === UNCATEGORIZED_SECTOR ? undefined : sector,
    });
  }

  if (rows.length === 0) {
    throw new Error("No contact rows found in the spreadsheet.");
  }
  return { rows, sheetName, rowCount: rows.length };
}

/** Parse a Directory contact workbook or CSV (first sheet). */
export async function parseContactWorkbook(file: File): Promise<ContactImportResult> {
  const XLSX: XlsxModule = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("Could not read the first sheet.");
  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  return parseMatrix(matrix, sheetName);
}

function contactDedupKey(contact: Pick<Contact, "personName" | "companyName" | "phone">): string {
  const person = (contact.personName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const company = (contact.companyName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const phone = (contact.phone ?? "").replace(/\D/g, "");
  return `${person}|${company}|${phone}`;
}

/** Merge imported contacts into the directory — same person+company+phone updates in place. */
export function mergeDirectoryContacts(
  existing: Contact[],
  incoming: ContactImportRow[],
): { contacts: Contact[]; added: number; updated: number } {
  const byKey = new Map(existing.map((c) => [contactDedupKey(c), c]));
  let added = 0;
  let updated = 0;
  const importedAt = new Date().toISOString();

  for (const row of incoming) {
    const next: Contact = {
      id: newContactId(),
      personName: row.personName,
      companyName: row.companyName,
      phone: row.phone,
      email: row.email,
      designation: row.designation,
      contactVia: row.contactVia,
      sector: row.sector,
      createdAt: importedAt,
    };
    const key = contactDedupKey(next);
    const prior = byKey.get(key);
    if (prior) {
      byKey.set(key, {
        ...prior,
        companyName: next.companyName ?? prior.companyName,
        phone: next.phone ?? prior.phone,
        email: next.email ?? prior.email,
        designation: next.designation ?? prior.designation,
        contactVia: next.contactVia ?? prior.contactVia,
        sector: next.sector ?? prior.sector,
      });
      updated += 1;
    } else {
      byKey.set(key, next);
      added += 1;
    }
  }

  return { contacts: [...byKey.values()], added, updated };
}
