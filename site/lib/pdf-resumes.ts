import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

function pdfDirectory() {
  return process.env.CV_UPLOAD_DIR || join(process.cwd(), "data", "cv-files");
}

function pdfPath(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Identifiant de CV invalide.");
  return join(pdfDirectory(), `${id}.pdf`);
}

export async function storePdfResume(file: File) {
  if (file.size === 0 || file.size > MAX_PDF_BYTES) throw new Error("Le PDF doit faire entre 1 octet et 10 Mo.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-" || !bytes.subarray(Math.max(0, bytes.length - 1024)).includes(Buffer.from("%%EOF"))) {
    throw new Error("Le fichier doit être un PDF valide.");
  }
  const id = randomUUID();
  const originalName = file.name.replace(/[\\/\r\n\x00-\x1f]/g, " ").trim().slice(0, 150) || "CV.pdf";
  await mkdir(pdfDirectory(), { recursive: true });
  await writeFile(pdfPath(id), bytes, { flag: "wx", mode: 0o600 });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.pdfResume.create({ data: { id, originalName, byteSize: bytes.length } });
      const settings = await tx.systemSettings.findUnique({ where: { id: "main" }, select: { activePdfResumeId: true } });
      if (!settings?.activePdfResumeId) {
        await tx.systemSettings.upsert({ where: { id: "main" }, create: { id: "main", activePdfResumeId: id }, update: { activePdfResumeId: id } });
      }
    });
  } catch (error) {
    await unlink(pdfPath(id)).catch(() => undefined);
    throw error;
  }
}

export async function readActivePdfResume() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: "main" }, select: { activePdfResumeId: true } });
  if (!settings?.activePdfResumeId) return null;
  const resume = await prisma.pdfResume.findUnique({ where: { id: settings.activePdfResumeId } });
  if (!resume) return null;
  return { resume, bytes: await readFile(pdfPath(resume.id)) };
}

export async function selectPdfResume(id: string | null) {
  if (id && !(await prisma.pdfResume.findUnique({ where: { id }, select: { id: true } }))) throw new Error("CV introuvable.");
  await prisma.systemSettings.upsert({ where: { id: "main" }, create: { id: "main", activePdfResumeId: id }, update: { activePdfResumeId: id } });
}

export async function deletePdfResume(id: string) {
  const resume = await prisma.pdfResume.findUnique({ where: { id }, select: { id: true } });
  if (!resume) throw new Error("CV introuvable.");
  await prisma.$transaction(async (tx) => {
    await tx.systemSettings.updateMany({ where: { id: "main", activePdfResumeId: id }, data: { activePdfResumeId: null } });
    await tx.pdfResume.delete({ where: { id } });
  });
  await unlink(pdfPath(id)).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; });
}
