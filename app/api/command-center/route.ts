import { getDashboard } from "../../../db/command-center";

export const runtime = "edge";

export async function GET() {
  try {
    return Response.json(await getDashboard());
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอ่านข้อมูล";
    return Response.json({ error: message }, { status: 500 });
  }
}
