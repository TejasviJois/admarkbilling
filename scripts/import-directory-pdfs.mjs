/* Parse Admark Contacts.pdf + DB - Rexu - DB.pdf into Directory contacts.
   Skips duplicates by person+company (case-insensitive). Infers Tourism sector for Rexu list.

   Usage:
     node scripts/import-directory-pdfs.mjs --allow-egress
*/
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import ws from "ws";
import { requireEgressAck } from "./lib/egress-guard.mjs";

requireEgressAck("import-directory-pdfs.mjs");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(resolve(root, ".env"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

const PDF_PATHS = [
  {
    path: "C:\\Users\\Tejasvi Jois\\Downloads\\DB - Rexu - DB.pdf",
    source: "Rexu",
    defaultSector: "Tourism & Travel",
  },
  {
    path: "C:\\Users\\Tejasvi Jois\\Downloads\\Admark Contacts.pdf",
    source: "Admark Contacts",
    defaultSector: null,
  },
];

const SECTOR_ALIASES = [
  ["farm stay", "Hospitality & Stay"],
  ["real estate", "Real Estate & Construction"],
  ["travels", "Tourism & Travel"],
  ["travel", "Tourism & Travel"],
  ["tours", "Tourism & Travel"],
  ["tour", "Tourism & Travel"],
  ["holiday", "Tourism & Travel"],
  ["hotel", "Hospitality & Stay"],
  ["resort", "Hospitality & Stay"],
  ["builder", "Real Estate & Construction"],
  ["builders", "Real Estate & Construction"],
  ["construction", "Real Estate & Construction"],
  ["architect", "Real Estate & Construction"],
  ["dental", "Healthcare"],
  ["doctor", "Healthcare"],
  ["hospital", "Healthcare"],
  ["medical", "Healthcare"],
  ["clothing", "Retail & Fashion"],
  ["fashion", "Retail & Fashion"],
  ["canteen", "Food & Beverage"],
  ["hotel business", "Food & Beverage"],
  ["motors", "Automotive"],
  ["tyre", "Automotive"],
  ["investor", "Finance & Lending"],
  ["bank", "Finance & Lending"],
  ["finance", "Finance & Lending"],
  ["insurance", "Finance & Lending"],
  ["events", "Events & Media"],
  ["ads", "Events & Media"],
  ["marketing", "Events & Media"],
  ["agency", "Professional Services"],
  ["advocate", "Professional Services"],
  ["auditor", "Professional Services"],
  ["granite", "Manufacturing & Trade"],
  ["mining", "Manufacturing & Trade"],
  ["hardware", "Manufacturing & Trade"],
  ["dealer", "Manufacturing & Trade"],
  ["solar", "Manufacturing & Trade"],
];

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function dedupeKey(personName, companyName) {
  return `${normalize(personName)}|${normalize(companyName)}`;
}

function inferSector(...parts) {
  const hay = parts.filter(Boolean).join(" ").toLowerCase();
  for (const [alias, sector] of [...SECTOR_ALIASES].sort((a, b) => b[0].length - a[0].length)) {
    if (hay.includes(alias)) return sector;
  }
  return null;
}

function encodeNotes(contactVia, sector) {
  const via = String(contactVia ?? "").trim();
  const sec = String(sector ?? "").trim();
  if (!sec) return via || null;
  return via ? `[sector:${sec}] ${via}` : `[sector:${sec}]`;
}

function firstPhone(text) {
  const cleaned = String(text ?? "").replace(/\s+/g, " ");
  const matches = cleaned.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [];
  for (const raw of matches) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      return digits.length > 10 && digits.startsWith("91") ? digits.slice(-10) : digits.slice(-10);
    }
  }
  return "";
}

function firstEmail(text) {
  const match = String(text ?? "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] ?? "";
}

async function extractPdfText(filePath) {
  const data = new Uint8Array(readFileSync(filePath));
  const doc = await getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lineMap = new Map();
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const row = lineMap.get(y) ?? [];
      row.push({ x, str: item.str });
      lineMap.set(y, row);
    }
    const lines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) =>
        parts
          .sort((a, b) => a.x - b.x)
          .map((p) => p.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}

function parseRexuText(text) {
  const contacts = [];
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(l))
    .filter((l) => !/^Company Name\s+Contact Name/i.test(l));

  for (const line of lines) {
    const email = firstEmail(line);
    const phone = firstPhone(line);
    if (!email && !phone) continue;

    // Split around email/phone zone: company + contact usually before email.
    let before = line;
    if (email) before = before.slice(0, before.toLowerCase().indexOf(email.toLowerCase())).trim();
    else {
      const phoneIdx = before.search(/(?:\+?\d[\d\s()./-]{7,}\d)/);
      if (phoneIdx > 0) before = before.slice(0, phoneIdx).trim();
    }
    before = before.replace(/\s+/g, " ").replace(/\s*\/\s*$/, "").trim();
    if (!before || before.length < 3) continue;

    // Prefer "Company ContactName" — last parenthetical/title chunk often contact.
    let company = before;
    let person = before;
    const roleMatch = before.match(
      /^(.+?)\s+([A-Z][\w.'&/-]*(?:\s+[A-Z][\w.'&/-]*){0,5})\s*\(([^)]+)\)\s*$/,
    );
    if (roleMatch) {
      company = roleMatch[1].trim();
      person = `${roleMatch[2].trim()} (${roleMatch[3].trim()})`;
    } else {
      // Fallback: last 2–4 tokens as person if company-like prefix exists.
      const tokens = before.split(/\s+/);
      if (tokens.length >= 3) {
        const splitAt = Math.max(1, tokens.length - 3);
        company = tokens.slice(0, splitAt).join(" ");
        person = tokens.slice(splitAt).join(" ");
      }
    }

    if (!person || person.length < 2) person = company;
    contacts.push({
      personName: person.slice(0, 120),
      companyName: company.slice(0, 160) || undefined,
      phone: phone || undefined,
      contactVia: email || undefined,
      sector: "Tourism & Travel",
    });
  }
  return contacts;
}

function parseAdmarkContactsText(text) {
  const contacts = [];
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(l))
    .filter((l) => !/^(Name of the|Member|Type of|Business\/Profession|Company Name|Mobile|Number)$/i.test(l));

  // Reconstruct rows: each row ends with a 10-digit mobile.
  const blob = lines.join(" ");
  const rowRegex =
    /([A-Za-z][A-Za-z0-9.'()\/,&+\-\s]{1,80}?)\s+([A-Za-z0-9][A-Za-z0-9.'()\/,&+\-\s]{0,100}?)\s+([A-Za-z0-9][A-Za-z0-9.'()\/,&+\-\s]{0,100}?)\s+(\d{10})\b/g;

  // Simpler approach: walk lines; accumulate until we see a trailing 10-digit phone.
  let buf = "";
  for (const line of lines) {
    buf = `${buf} ${line}`.replace(/\s+/g, " ").trim();
    const phoneMatch = buf.match(/(\d{10})\s*$/);
    if (!phoneMatch) continue;
    const phone = phoneMatch[1];
    const body = buf.slice(0, buf.lastIndexOf(phone)).trim();
    buf = "";
    if (body.length < 3) continue;

    // body ≈ "Name Profession Company" — name is usually first 1–4 tokens with dots/initials.
    const tokens = body.split(/\s+/);
    let nameEnd = 1;
    for (let i = 1; i < Math.min(tokens.length, 5); i++) {
      const t = tokens[i];
      if (/^[A-Z]?[a-z]*\.?[A-Za-z]*\.?$/.test(t) && t.length <= 18) nameEnd = i + 1;
      else break;
    }
    // Also absorb parenthetical continuations into name.
    while (nameEnd < tokens.length && /^\(/.test(tokens[nameEnd])) {
      nameEnd += 1;
      while (nameEnd < tokens.length && !/\)/.test(tokens[nameEnd - 1])) nameEnd += 1;
    }

    const personName = tokens.slice(0, nameEnd).join(" ").trim();
    const rest = tokens.slice(nameEnd).join(" ").trim();
    // Split rest into profession + company: company often last capitalized chunk; use last 1–5 tokens as company if rest long.
    let profession = rest;
    let companyName = "";
    if (rest) {
      const restTokens = rest.split(/\s+/);
      if (restTokens.length >= 2) {
        const companyLen = Math.min(5, Math.max(1, Math.floor(restTokens.length / 2)));
        companyName = restTokens.slice(-companyLen).join(" ");
        profession = restTokens.slice(0, -companyLen).join(" ");
      } else {
        companyName = rest;
        profession = "";
      }
      if (/^n\.?a\.?$/i.test(companyName)) companyName = "";
    }

    const sector =
      inferSector(companyName, profession, personName) ??
      (profession ? inferSector(profession) : null);

    contacts.push({
      personName: personName || companyName || "Unknown",
      companyName: companyName || undefined,
      phone,
      contactVia: profession || undefined,
      sector: sector || undefined,
    });
  }

  // Suppress unused regex warning style — keep fallback empty if walk produced nothing.
  void rowRegex;
  return contacts;
}

async function main() {
  const all = [];
  for (const pdf of PDF_PATHS) {
    console.log(`Reading ${pdf.path}…`);
    const text = await extractPdfText(pdf.path);
    const parsed =
      pdf.source === "Rexu" ? parseRexuText(text) : parseAdmarkContactsText(text);
    console.log(`  Parsed ${parsed.length} rows from ${pdf.source}`);
    for (const row of parsed) {
      if (pdf.defaultSector && !row.sector) row.sector = pdf.defaultSector;
      all.push({ ...row, _source: pdf.source });
    }
  }

  // Dedupe within batch.
  const batchKeys = new Set();
  const unique = [];
  for (const row of all) {
    const key = dedupeKey(row.personName, row.companyName ?? "");
    if (batchKeys.has(key)) continue;
    batchKeys.add(key);
    unique.push(row);
  }
  console.log(`Unique in PDFs: ${unique.length} (from ${all.length} raw)`);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase credentials missing");

  const sb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
  const db = sb.schema("admark");

  const { data: orgs, error: orgError } = await db.from("organizations").select("id, legacy_id").limit(5);
  if (orgError) throw orgError;
  const org = (orgs ?? []).find((o) => o.legacy_id === "org_default") ?? (orgs ?? [])[0];
  if (!org?.id) throw new Error("No organization");

  const { data: existingRows, error: existingError } = await db
    .from("leads")
    .select("id, company_name, contact_person, phone")
    .eq("organization_id", org.id)
    .eq("source", "Directory")
    .is("deleted_at", null);
  if (existingError) throw existingError;

  const existingKeys = new Set();
  const existingPhones = new Set();
  for (const row of existingRows ?? []) {
    const person = row.contact_person || row.company_name || "";
    const company =
      row.company_name && row.company_name !== person ? row.company_name : row.company_name || "";
    existingKeys.add(dedupeKey(person, company));
    existingKeys.add(dedupeKey(person, row.company_name ?? ""));
    const digits = String(row.phone ?? "").replace(/\D/g, "");
    if (digits.length >= 10) existingPhones.add(digits.slice(-10));
  }

  const now = new Date().toISOString();
  const toInsert = [];
  const skipped = [];

  for (const row of unique) {
    const key = dedupeKey(row.personName, row.companyName ?? "");
    const phoneDigits = String(row.phone ?? "").replace(/\D/g, "").slice(-10);
    if (existingKeys.has(key) || (phoneDigits.length === 10 && existingPhones.has(phoneDigits))) {
      skipped.push(`${row.personName} / ${row.companyName || "—"}`);
      continue;
    }
    existingKeys.add(key);
    if (phoneDigits.length === 10) existingPhones.add(phoneDigits);

    const company = row.companyName || row.personName;
    toInsert.push({
      id: randomUUID(),
      organization_id: org.id,
      legacy_id: `contact-${randomUUID().slice(0, 8)}`,
      company_name: company,
      contact_person: row.personName,
      email: firstEmail(row.contactVia) || null,
      phone: row.phone || null,
      status: "new_lead",
      source: "Directory",
      expected_revenue: null,
      probability: null,
      expected_closing_date: null,
      notes: encodeNotes(row.contactVia, row.sector),
      created_at: now,
      deleted_at: null,
    });
  }

  const chunkSize = 100;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { error: insertError } = await db.from("leads").insert(chunk);
    if (insertError) throw insertError;
  }

  await sb
    .from("operations_data")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", "default");

  console.log(`Imported: ${toInsert.length}`);
  console.log(`Skipped duplicates: ${skipped.length}`);
  console.log(`Directory total after: ${(existingRows?.length ?? 0) + toInsert.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
