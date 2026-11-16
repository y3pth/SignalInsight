const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 64 * 1024;

type Explanation = {
  summary: string;
  observations: string[];
  limitations: string[];
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function clip(value: unknown, max = 500): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function validatePayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.unknown !== "boolean") return null;
  if (typeof payload.sampleCount !== "number" || payload.sampleCount < 64) return null;
  if (typeof payload.sampleRate !== "number" || payload.sampleRate <= 0) return null;
  if (!Array.isArray(payload.candidates) || payload.candidates.length > 6) return null;
  if (!payload.reliability || typeof payload.reliability !== "object") return null;
  return payload;
}

function buildPrompt(payload: Record<string, unknown>): string {
  return [
    "你是通信与信号处理实验的解释助手。",
    "所有数值均由确定性算法计算，你不得修改、补充或重新计算任何数值。",
    "只能基于给定证据解释参数意义、模型竞争和可信度限制。",
    "如果证据不足，要明确说明，不得猜测物理背景。",
    "用简体中文返回严格 JSON，不要 Markdown 代码块。",
    'JSON 结构：{"summary":"2-4句总结","observations":["3-6条证据解释"],"limitations":["2-4条限制"]}',
    `确定性分析结果：${JSON.stringify(payload)}`,
  ].join("\n");
}

function parseModelText(content: string): Explanation | null {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const observations = Array.isArray(record.observations)
    ? record.observations.map((item) => clip(item, 400)).filter(Boolean).slice(0, 6)
    : [];
  const limitations = Array.isArray(record.limitations)
    ? record.limitations.map((item) => clip(item, 400)).filter(Boolean).slice(0, 4)
    : [];
  const summary = clip(record.summary, 1200);
  if (!summary || observations.length === 0) return null;
  return { summary, observations, limitations };
}

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.endsWith("/health")) {
    if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
    return json({
      ok: true,
      configured: Boolean(Deno.env.get("DASHSCOPE_API_KEY")),
      provider: "dashscope-compatible",
    });
  }
  if (!url.pathname.endsWith("/explain")) return json({ ok: false, error: "not_found" }, 404);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return json({ ok: false, error: "payload_too_large" }, 413);
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return json({ ok: false, error: "invalid_body" }, 400);
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "payload_too_large" }, 413);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const payload = validatePayload(parsed);
  if (!payload) return json({ ok: false, error: "invalid_payload" }, 400);

  const apiKey = Deno.env.get("DASHSCOPE_API_KEY");
  if (!apiKey) return json({ ok: false, error: "service_not_configured" }, 503);
  const model = Deno.env.get("QWEN_MODEL") || "qwen-plus";
  const baseUrl =
    Deno.env.get("DASHSCOPE_BASE_URL") || "https://dashscope.aliyuncs.com/compatible-mode/v1";

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content:
              "You explain only deterministic evidence supplied by the application. Never invent or alter numerical results.",
          },
          { role: "user", content: buildPrompt(payload) },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return json({ ok: false, error: "upstream_unavailable" }, 503);
  }
  if (!upstream.ok) return json({ ok: false, error: "upstream_error" }, 502);

  let responseBody: unknown;
  try {
    responseBody = await upstream.json();
  } catch {
    return json({ ok: false, error: "invalid_upstream_response" }, 502);
  }
  const content = (responseBody as { choices?: Array<{ message?: { content?: string } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return json({ ok: false, error: "invalid_upstream_response" }, 502);
  }
  const explanation = parseModelText(content);
  if (!explanation) return json({ ok: false, error: "invalid_model_output" }, 502);
  return json({
    ok: true,
    explanation,
    provider: "dashscope-compatible",
    model,
    note: "Explanation only; numerical results were not modified.",
  });
}
