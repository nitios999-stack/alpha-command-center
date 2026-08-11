import { getDashboard } from "../../../db/command-center";
import { apiAuthRequiredResponse, getChatGPTUser } from "../../chatgpt-auth";

export const runtime = "edge";

export async function GET() {
  if (!(await getChatGPTUser())) return apiAuthRequiredResponse();
  try {
    return Response.json(await getDashboard(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการอ่านข้อมูล";
    return Response.json({ error: message }, { status: 500 });
  }
}
