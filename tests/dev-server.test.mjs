/* eslint-env node */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer, loadConfigFromFile } from "vite";

test("the development listener uses IPv4 and ignores generated validation files", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const directory = mkdtempSync(path.join(tmpdir(), "nbf-dev-origin-"));
  const source = path.join(directory, "source.js");
  writeFileSync(source, "export const ready = false;");
  let server;
  try {
    const loaded = await loadConfigFromFile(
      { command: "serve", mode: "test" },
      path.join(root, "vite.config.ts"),
    );
    server = await createServer({
      root: directory,
      configFile: false,
      appType: "custom",
      server: { ...loaded.config.server, port: 0, hmr: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    const events = [];
    server.watcher.on("all", (_event, file) => events.push(file));
    await server.listen();
    const address = server.httpServer.address();
    assert.equal(address.address, "127.0.0.1");
    const url = `http://127.0.0.1:${address.port}/@vite/client`;
    assert.equal((await fetch(url)).status, 200);
    // Vite can listen before Chokidar finishes its initial scan on Windows.
    // Wait for this file to be discovered before changing it.
    const sourceIsWatched = () =>
      Object.values(server.watcher.getWatched()).some((files) =>
        files.includes("source.js"),
      );
    for (let attempt = 0; attempt < 100 && !sourceIsWatched(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.ok(sourceIsWatched(), "the initial watcher scan must finish");
    const output = path.join(directory, "artifacts", "billing-502");
    mkdirSync(output, { recursive: true });
    for (let index = 0; index < 10; index++) {
      writeFileSync(
        path.join(output, "validation.json"),
        JSON.stringify({ index }),
      );
      writeFileSync(path.join(output, "test.log"), `result ${index}`);
    }
    writeFileSync(source, "export const ready = true;");
    for (
      let attempt = 0;
      attempt < 100 && !events.includes(source);
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    assert.ok(events.includes(source), "source files must remain watched");
    assert.equal(
      events.some((file) => file.startsWith(path.join(directory, "artifacts"))),
      false,
    );
    assert.equal((await fetch(url)).status, 200);
  } finally {
    await server?.close();
    if (
      path.dirname(path.resolve(directory)) === path.resolve(tmpdir()) &&
      path.basename(directory).startsWith("nbf-dev-origin-")
    ) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});
