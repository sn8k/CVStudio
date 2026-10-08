import { getAdminSession } from "@/lib/admin-session";
import { getAdminBackup } from "@/lib/admin-backup";

export async function GET() {
  const session = await getAdminSession();
  if (!session) return new Response("Non autorisé", { status: 401 });
  const data = await getAdminBackup();
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="cvstudio-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
