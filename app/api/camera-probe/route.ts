import { NextResponse } from "next/server";

// Dev-only diagnostic: the camera probe page POSTs its enumerateDevices()
// result here so the terminal can read what each browser actually sees.
export async function POST(request: Request) {
  // Diagnostic only — never expose this on the deployed app.
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const tag = typeof body.tag === "string" ? body.tag : "untagged";
  const cams = Array.isArray(body.cams) ? body.cams : [];

  const caps = body.caps && typeof body.caps === "object" ? body.caps : null;
  const extras = ["speech", "transcript", "audio"]
    .filter((k) => body[k] !== undefined)
    .map((k) => `\n  ${k}: ${body[k]}`)
    .join("");

  console.log(
    `\n=== CAMERA PROBE [${tag}] === ${cams.length} videoinput device(s)` +
      (body.error ? `\n  ERROR: ${body.error}` : "") +
      (caps
        ? Object.entries(caps)
            .map(([k, v]) => `\n  ${k.trim()}: ${v}`)
            .join("")
        : "") +
      extras +
      cams
        .map(
          (c: { label?: string; deviceId?: string; groupId?: string }, i: number) =>
            `\n  [${i}] ${c.label || "(no label)"}  id=${(c.deviceId || "").slice(0, 12)} group=${(c.groupId || "").slice(0, 8)}`,
        )
        .join("") +
      `\n  ua: ${body.ua || "?"}\n=== END PROBE ===\n`,
  );

  return NextResponse.json({ ok: true, seen: cams.length });
}
