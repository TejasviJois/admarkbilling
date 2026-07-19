import type { CompanySettings, OperationsData, Invoice } from "./types";
import {
  decrypt as coreDecrypt,
  encrypt as coreEncrypt,
  resolveEncryptionSecret,
} from "../../shared/encryption-core.mjs";

export {
  ALGORITHM,
  DEV_FALLBACK_SECRET,
  MIN_SECRET_LENGTH,
  deriveEncryptionKey,
  resolveEncryptionSecret,
} from "../../shared/encryption-core.mjs";

export function encrypt(text: string): string {
  return coreEncrypt(text);
}

export function decrypt(encryptedText: string): string {
  return coreDecrypt(encryptedText);
}

// Company Settings transforms
export function encryptCompanySettings(c: CompanySettings): CompanySettings {
  return {
    ...c,
    address: encrypt(c.address),
    pan: c.pan ? encrypt(c.pan) : undefined,
    gstin: c.gstin ? encrypt(c.gstin) : undefined,
    bankName: c.bankName ? encrypt(c.bankName) : undefined,
    accountName: c.accountName ? encrypt(c.accountName) : undefined,
    accountNumber: c.accountNumber ? encrypt(c.accountNumber) : undefined,
    ifsc: c.ifsc ? encrypt(c.ifsc) : undefined,
    branch: c.branch ? encrypt(c.branch) : undefined,
    upi: c.upi ? encrypt(c.upi) : undefined,
  };
}

export function decryptCompanySettings(c: CompanySettings): CompanySettings {
  return {
    ...c,
    address: decrypt(c.address),
    pan: c.pan ? decrypt(c.pan) : undefined,
    gstin: c.gstin ? decrypt(c.gstin) : undefined,
    bankName: c.bankName ? decrypt(c.bankName) : undefined,
    accountName: c.accountName ? decrypt(c.accountName) : undefined,
    accountNumber: c.accountNumber ? decrypt(c.accountNumber) : undefined,
    ifsc: c.ifsc ? decrypt(c.ifsc) : undefined,
    branch: c.branch ? decrypt(c.branch) : undefined,
    upi: c.upi ? decrypt(c.upi) : undefined,
  };
}

// Operations Data transforms (Sensitive client columns)
export function encryptOperationsData(ops: OperationsData): OperationsData {
  const clients = ops.clients?.map((cl) => ({
    ...cl,
    phone: encrypt(cl.phone),
    email: encrypt(cl.email),
    gstNumber: cl.gstNumber ? encrypt(cl.gstNumber) : undefined,
    pan: cl.pan ? encrypt(cl.pan) : undefined,
    billingAddress: encrypt(cl.billingAddress),
    shippingAddress: cl.shippingAddress ? encrypt(cl.shippingAddress) : undefined,
  }));
  const contacts = ops.contacts?.map((contact) => ({
    ...contact,
    phone: contact.phone ? encrypt(contact.phone) : undefined,
  }));
  return { ...ops, clients, contacts };
}

export function decryptOperationsData(ops: OperationsData): OperationsData {
  const clients = ops.clients?.map((cl) => ({
    ...cl,
    phone: decrypt(cl.phone),
    email: decrypt(cl.email),
    gstNumber: cl.gstNumber ? decrypt(cl.gstNumber) : undefined,
    pan: cl.pan ? decrypt(cl.pan) : undefined,
    billingAddress: decrypt(cl.billingAddress),
    shippingAddress: cl.shippingAddress ? decrypt(cl.shippingAddress) : undefined,
  }));
  const contacts = ops.contacts?.map((contact) => ({
    ...contact,
    phone: contact.phone ? decrypt(contact.phone) : undefined,
  }));
  return { ...ops, clients, contacts };
}

// Invoice transforms
export function encryptInvoice(inv: Invoice): Invoice {
  return {
    ...inv,
    clientAddress: inv.clientAddress ? encrypt(inv.clientAddress) : undefined,
    clientPhone: inv.clientPhone ? encrypt(inv.clientPhone) : undefined,
    clientEmail: inv.clientEmail ? encrypt(inv.clientEmail) : undefined,
    clientGstin: inv.clientGstin ? encrypt(inv.clientGstin) : undefined,
  };
}

export function decryptInvoice(inv: Invoice): Invoice {
  return {
    ...inv,
    clientAddress: inv.clientAddress ? decrypt(inv.clientAddress) : undefined,
    clientPhone: inv.clientPhone ? decrypt(inv.clientPhone) : undefined,
    clientEmail: inv.clientEmail ? decrypt(inv.clientEmail) : undefined,
    clientGstin: inv.clientGstin ? decrypt(inv.clientGstin) : undefined,
  };
}
