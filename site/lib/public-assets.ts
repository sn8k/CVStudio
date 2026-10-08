import { prisma } from "@/lib/prisma";

export async function getPublicCvPdfUrl() {
  const settings = await prisma.systemSettings.findUnique({ where: { id: "main" }, select: { activePdfResumeId: true } });
  if (settings?.activePdfResumeId) {
    const selected = await prisma.pdfResume.findUnique({ where: { id: settings.activePdfResumeId }, select: { id: true } });
    if (selected) return "/api/cv";
  }
  return null;
}
