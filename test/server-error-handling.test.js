const assert = require("node:assert/strict");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { test } = require("node:test");

test("provider network errors return 502 without stopping the backend", async (t) => {
  const port = await reservePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      GEOAPIFY_API_KEY: "test-key",
      GEOAPIFY_BASE_URL: "http://127.0.0.1:1",
      GEOAPIFY_TIMEOUT_MS: "100",
      GEOAPIFY_SEARCH_TIMEOUT_MS: "100",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  t.after(() => child.kill());
  await waitForServer(child, port);

  const query = new URL(`http://127.0.0.1:${port}/api/places`);
  query.searchParams.set("city", "悉尼");
  query.searchParams.set("keywords", "悉尼大学");
  query.searchParams.set("limit", "10");
  query.searchParams.set("region", "overseas");
  query.searchParams.set("coordinateSystem", "WGS84");
  query.searchParams.set("countryCode", "au");
  query.searchParams.set("cityId", "sydney");

  const failedResponse = await fetch(query);
  assert.equal(failedResponse.status, 502);
  assert.deepEqual(await failedResponse.json(), { error: "第三方地点服务暂时不可用，请稍后重试" });

  const healthResponse = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.deepEqual(await healthResponse.json(), { ok: true });
});

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function waitForServer(child, port) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("backend start timed out")), 5000);
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (output.includes(`http://localhost:${port}`)) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`backend exited before startup: ${code}`));
    });
  });
}
