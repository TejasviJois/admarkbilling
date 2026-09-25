import type { LeadListEntry } from "@/lib/types";

export type WhatsAppLeadImportResult = {
  entries: LeadListEntry[];
  sourceLabel: string;
  rowCount: number;
};

function newLeadListId(): string {
  return `ll_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function cleanText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\u200e|\u200f|\ufeff/g, "")
    .trim();
}

function stripMarkdownNoise(value: string): string {
  return cleanText(value)
    .replace(/^\*+|\*+$/g, "")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[Forwarded\]\s*/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const text = value.trim();
  if (text.length <= max) return text || undefined;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function externalIdFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `WA-${slug || "lead"}`;
}

function firstEmail(text: string): string | undefined {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]?.toLowerCase();
}

function firstPhone(text: string): string | undefined {
  const matches = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [];
  for (const raw of matches) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10) continue;
    if (digits.length > 10 && digits.startsWith("91")) return `+${digits}`;
    if (digits.length === 10) return digits;
    if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  }
  return undefined;
}

/** Grab content under a labelled WhatsApp section (*… Label*). */
function extractSection(body: string, label: RegExp): string | undefined {
  const re = new RegExp(
    `\\*[^\\n*]{0,40}${label.source}[^\\n*]{0,40}\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*[^\\n*]{0,60}\\*|$)`,
    "i",
  );
  const match = body.match(re);
  if (!match?.[1]) return undefined;
  return stripMarkdownNoise(match[1]) || undefined;
}

function breakdownField(body: string, key: string): string | undefined {
  const re = new RegExp(`\\*?\\s*${key}\\s*:\\*?\\s*([^\\n*]+)`, "i");
  const match = body.match(re);
  if (!match?.[1]) return undefined;
  return stripMarkdownNoise(match[1]) || undefined;
}

function parseScore(body: string): number | undefined {
  const match = body.match(/Lead\s*Score\s*:\s*([\d.]+)\s*(?:\/\s*10)?/i);
  if (!match?.[1]) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : undefined;
}

function parseTitle(block: string): string | undefined {
  const match = block.match(/Lead\s*Intelligence\s*:\s*([^\n]+)/i);
  if (!match?.[1]) return undefined;
  return stripMarkdownNoise(match[1].replace(/\*+$/, "")) || undefined;
}

function parseMessageTimestamp(prefix: string): string | undefined {
  const match = prefix.match(/\[(\d{1,2}\/\d{1,2}\/\d{2,4},\s*[^\]]+)\]/);
  return match?.[1]?.trim();
}

type LeadBlock = {
  prefix: string;
  body: string;
};

function splitLeadBlocks(chat: string): LeadBlock[] {
  const text = cleanText(chat);
  const marker = /Lead\s*Intelligence\s*:/gi;
  const starts: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = marker.exec(text)) != null) {
    starts.push(m.index);
  }
  if (starts.length === 0) return [];

  const blocks: LeadBlock[] = [];
  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const end = i + 1 < starts.length ? starts[i + 1]! : text.length;
    const body = text.slice(start, end);
    const prefixStart = Math.max(0, start - 600);
    const prefix = text.slice(prefixStart, start);
    blocks.push({ prefix, body });
  }
  return blocks;
}

function immediatePrefix(prefix: string): string {
  const matches = [...prefix.matchAll(/\[\d{1,2}\/\d{1,2}\/\d{2,4},[^\]]+\]/g)];
  if (matches.length === 0) return prefix.slice(-240);
  const last = matches[matches.length - 1]!;
  return prefix.slice(last.index ?? Math.max(0, prefix.length - 240));
}

/**
 * Required Lead List fields only — table + outreach + track classification.
 * Skips long fit lists, raw chat dump, and application boilerplate.
 */
function parseLeadBlock(block: LeadBlock, sourceFileName: string, importedAt: string): LeadListEntry | null {
  const title = parseTitle(block.body);
  if (!title) return null;

  const nearby = immediatePrefix(block.prefix);
  const email = firstEmail(block.body) ?? firstEmail(nearby);
  const phone = firstPhone(block.body) ?? firstPhone(nearby);
  const oneLiner = truncate(extractSection(block.body, /One-?Liner/i), 500);
  const xFactor = truncate(extractSection(block.body, /Real\s*X-?Factor/i), 600);
  const whatTheyWant = truncate(extractSection(block.body, /What\s+They\s+Actually\s+Want/i), 900);
  const howToWin = truncate(extractSection(block.body, /How\s+to\s+Win/i), 700);
  const angle = truncate(extractSection(block.body, /Angle/i), 400);
  const redFlags = truncate(extractSection(block.body, /Red\s*Flags/i), 600);
  const whyScore = truncate(extractSection(block.body, /Why\s+This\s+Scores/i), 500);

  return {
    id: newLeadListId(),
    externalId: externalIdFromTitle(title),
    dateTime: parseMessageTimestamp(block.prefix),
    phone,
    email,
    title,
    oneLiner,
    xFactor,
    whatTheyWant,
    intent: breakdownField(block.body, "Intent"),
    urgency: breakdownField(block.body, "Urgency"),
    closeWindow: breakdownField(block.body, "Close Window"),
    competition: breakdownField(block.body, "Competition"),
    projectType: breakdownField(block.body, "Project Type"),
    complexity: breakdownField(block.body, "Complexity"),
    leadScore: parseScore(block.body),
    redFlags,
    howToWin,
    angle,
    whyScore,
    importedAt,
    sourceFileName,
  };
}

async function readChatTextFromZip(file: File): Promise<{ text: string; label: string }> {
  const { unzip } = await import("fflate");
  const buffer = new Uint8Array(await file.arrayBuffer());
  const files = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(buffer, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });

  const preferred =
    Object.keys(files).find((name) => /(^|\/)chat\.txt$/i.test(name)) ??
    Object.keys(files).find((name) => /(^|\/)chat\.md$/i.test(name)) ??
    Object.keys(files).find((name) => /\.(txt|md)$/i.test(name));

  if (!preferred || !files[preferred]) {
    throw new Error("No chat.txt (or .md) found inside the WhatsApp export zip.");
  }

  const decoder = new TextDecoder("utf-8");
  return { text: decoder.decode(files[preferred]), label: `${file.name} → ${preferred}` };
}

async function readChatText(file: File): Promise<{ text: string; label: string }> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".zip")) return readChatTextFromZip(file);
  if (name.endsWith(".txt") || name.endsWith(".md")) {
    return { text: await file.text(), label: file.name };
  }
  throw new Error("Upload a WhatsApp chat export (.zip) or chat.txt / chat.md.");
}

/** Parse an Inner Circle–style WhatsApp chat export into Lead List rows. */
export async function parseWhatsAppLeadExport(file: File): Promise<WhatsAppLeadImportResult> {
  const { text, label } = await readChatText(file);
  const importedAt = new Date().toISOString();
  const blocks = splitLeadBlocks(text);
  const entries: LeadListEntry[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const entry = parseLeadBlock(block, file.name, importedAt);
    if (!entry) continue;
    const key = entry.externalId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  if (entries.length === 0) {
    throw new Error('No "Lead Intelligence" cards found in this chat export.');
  }

  return { entries, sourceLabel: label, rowCount: entries.length };
}

export function isWhatsAppLeadExportFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".zip") || name.endsWith(".txt") || name.endsWith(".md");
}
