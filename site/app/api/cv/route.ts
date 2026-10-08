import { readActivePdfResume } from "@/lib/pdf-resumes";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const selected = await readActivePdfResume();
    if (!selected) return new Response("CV indisponible.", { status: 404 });
    return new Response(new Uint8Array(selected.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=\"cv.pdf\"",
        "Content-Length": String(selected.bytes.length),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("CV indisponible.", { status: 503 });
  }
}
