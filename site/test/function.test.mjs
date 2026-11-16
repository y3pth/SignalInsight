import assert from "node:assert/strict";

const env = new Map();
globalThis.Deno = {
  env: { get: (name) => env.get(name) },
};
const { handler } = await import("../functions/handler.ts");

const validPayload = {
  unknown: false,
  recommendedModel: "单频模型",
  sampleCount: 1024,
  sampleRate: 1024,
  duration: 1,
  candidates: [{ model: "单频模型", r2: 0.999, rmse: 0.01, bic: -100, parameters: [] }],
  reliability: { level: "reliable", evidence: [], limitations: [] },
};

let response = await handler(new Request("https://site.test/functions/v1/app/health"));
assert.equal(response.status, 200);
assert.equal((await response.json()).configured, false);

response = await handler(
  new Request("https://site.test/functions/v1/app/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  }),
);
assert.equal(response.status, 503);
assert.equal((await response.json()).error, "service_not_configured");

env.set("DASHSCOPE_API_KEY", "test-key");
env.set("QWEN_MODEL", "test-model");
globalThis.fetch = async (url, init) => {
  assert.ok(String(url).endsWith("/chat/completions"));
  const body = JSON.parse(init.body);
  assert.equal(body.model, "test-model");
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            summary: "测试解释",
            observations: ["R² 较高", "残差通过检查"],
            limitations: ["仅限候选模型库"],
          }),
        },
      },
    ],
  });
};

response = await handler(
  new Request("https://site.test/functions/v1/app/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validPayload),
  }),
);
assert.equal(response.status, 200);
const result = await response.json();
assert.equal(result.ok, true);
assert.equal(result.explanation.summary, "测试解释");

response = await handler(
  new Request("https://site.test/functions/v1/app/explain", {
    method: "POST",
    body: "{invalid",
  }),
);
assert.equal(response.status, 400);

console.log("Function tests passed");
