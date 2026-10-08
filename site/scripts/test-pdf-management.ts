import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

async function main() {
const directory = await mkdtemp(join(tmpdir(), "cv-pdf-test-"));
const databasePath = join(directory, `${randomUUID()}.db`);
process.env.DATABASE_URL = `file:${databasePath.replaceAll("\\", "/")}`;
process.env.CV_UPLOAD_DIR = directory;

try {
  const database = new DatabaseSync(databasePath);
  try {
    const migrations = (await readdir(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    for (const migration of migrations) {
      database.exec(await readFile(join(process.cwd(), "prisma", "migrations", migration, "migration.sql"), "utf8"));
    }
  } finally {
    database.close();
  }

  const [{ prisma }, pdf, { getPublicCvPdfUrl }, { GET }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/pdf-resumes"),
    import("@/lib/public-assets"),
    import("@/app/api/cv/route"),
  ]);
  try {
    const first = new File(["%PDF-1.4\n1 0 obj\n%%EOF\n"], "premier.pdf", { type: "application/pdf" });
    const second = new File(["%PDF-1.4\n2 0 obj\n%%EOF\n"], "second.pdf", { type: "application/pdf" });
    await pdf.storePdfResume(first);
    await pdf.storePdfResume(second);
    const resumes = await prisma.pdfResume.findMany({ orderBy: { createdAt: "asc" } });
    assert.equal(resumes.length, 2);
    assert.equal(await getPublicCvPdfUrl(), "/api/cv");
    assert.match(await (await GET()).text(), /1 0 obj/);
    await pdf.selectPdfResume(resumes[1].id);
    assert.match(await (await GET()).text(), /2 0 obj/);
    await pdf.deletePdfResume(resumes[1].id);
    assert.equal(await getPublicCvPdfUrl(), null);
    await pdf.selectPdfResume(resumes[0].id);
    assert.match(await (await GET()).text(), /1 0 obj/);
    await assert.rejects(pdf.storePdfResume(new File(["not a PDF"], "fake.pdf")));
    assert.equal(await prisma.pdfResume.count(), 1);
    console.log("PDF upload, selection, download, removal and rejection: OK");
  } finally {
    await prisma.$disconnect();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
  await rm(databasePath, { force: true });
  await rm(`${databasePath}-journal`, { force: true });
}
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
