import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agreement, CompanySettings, DocumentsData, OperationsData } from "@/lib/types";
import { externalizeDataUrl } from "./file-storage";

export async function externalizeCompanySettings(
  sb: SupabaseClient,
  settings: CompanySettings,
): Promise<CompanySettings> {
  const [logoDataUrl, signatureDataUrl, udyamCertificateDataUrl, complianceDocuments] =
    await Promise.all([
      externalizeDataUrl(sb, settings.logoDataUrl, "company/logo", "logo"),
      externalizeDataUrl(sb, settings.signatureDataUrl, "company/signature", "signature"),
      externalizeDataUrl(sb, settings.udyamCertificateDataUrl, "company/udyam", "udyam.pdf"),
      Promise.all(
        (settings.complianceDocuments ?? []).map(async (doc) => {
          if (!doc.fileDataUrl) return doc;
          return {
            ...doc,
            fileDataUrl: await externalizeDataUrl(
              sb,
              doc.fileDataUrl,
              `company/compliance/${doc.id}`,
              doc.fileName,
            ),
          };
        }),
      ),
    ]);

  return {
    ...settings,
    logoDataUrl,
    signatureDataUrl,
    udyamCertificateDataUrl,
    complianceDocuments,
  };
}

export async function externalizeOperationsData(
  sb: SupabaseClient,
  ops: OperationsData,
): Promise<OperationsData> {
  const projects = await Promise.all(
    ops.projects.map(async (project) => {
      const payments = await Promise.all(
        (project.payments ?? []).map(async (payment) => {
          if (!payment.proof?.imageDataUrl) return payment;
          return {
            ...payment,
            proof: {
              ...payment.proof,
              imageDataUrl: (await externalizeDataUrl(
                sb,
                payment.proof.imageDataUrl,
                `proofs/projects/${project.id}/payments/${payment.id}`,
                payment.proof.fileName,
              ))!,
            },
          };
        }),
      );

      const paymentProofs = await Promise.all(
        (project.paymentProofs ?? []).map(async (proof) => ({
          ...proof,
          imageDataUrl: (await externalizeDataUrl(
            sb,
            proof.imageDataUrl,
            `proofs/projects/${project.id}/legacy/${proof.id}`,
            proof.fileName,
          ))!,
        })),
      );

      return {
        ...project,
        payments,
        paymentProofs: paymentProofs.length ? paymentProofs : project.paymentProofs,
      };
    }),
  );

  const expenses = await Promise.all(
    ops.expenses.map(async (expense) => {
      if (!expense.proof?.imageDataUrl) return expense;
      return {
        ...expense,
        proof: {
          ...expense.proof,
          imageDataUrl: (await externalizeDataUrl(
            sb,
            expense.proof.imageDataUrl,
            `proofs/expenses/${expense.id}`,
            expense.proof.fileName,
          ))!,
        },
      };
    }),
  );

  return { ...ops, projects, expenses };
}

export async function externalizeDocumentsData(
  sb: SupabaseClient,
  docs: DocumentsData,
): Promise<DocumentsData> {
  const agreements = await Promise.all(
    docs.agreements.map(async (agreement) => externalizeAgreement(sb, agreement)),
  );
  return { agreements };
}

async function externalizeAgreement(sb: SupabaseClient, agreement: Agreement): Promise<Agreement> {
  if (!agreement.fileDataUrl) return agreement;
  return {
    ...agreement,
    fileDataUrl: await externalizeDataUrl(
      sb,
      agreement.fileDataUrl,
      `documents/agreements/${agreement.id}`,
      agreement.fileName,
    ),
  };
}
