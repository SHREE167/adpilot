import { runAgent } from "@/lib/agent";
import { savePlan } from "@/lib/storage";
import type { PlanStreamEvent } from "@/lib/types";
import { parsePlanInput } from "@/lib/validate";

/** Same work as the createPlan action, streamed so the form can show real progress. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ type: "error", message: "The brief was not valid JSON." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: PlanStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // client went away; the plan still finishes and saves
        }
      };
      try {
        const input = parsePlanInput(raw);
        const plan = await runAgent(input, { onEvent: (e) => send({ type: "step", ...e }) });
        await savePlan(plan);
        send({ type: "done", plan });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Failed to build plan" });
      } finally {
        if (open) controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
