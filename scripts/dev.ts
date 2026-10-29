import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
mkdirSync("work", { recursive: true });
// Test keys are public Cloudflare fixtures and are supplied only to the local dev process.
const env = {
  ...process.env,
  VITE_TURNSTILE_SITE_KEY:
    process.env.VITE_TURNSTILE_SITE_KEY || "1x00000000000000000000AA",
  XDG_CONFIG_HOME: resolve("work/wrangler-config"),
  WRANGLER_LOG_PATH: resolve("work/wrangler.log"),
  WRANGLER_SEND_METRICS: "false",
  CHOKIDAR_USEPOLLING: "true",
};
const build = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build"],
  { stdio: "inherit", env },
);
build.on("exit", (code) => {
  if (code) {
    process.exitCode = code;
    return;
  }
  const dev = spawn(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "pages",
      "dev",
      "dist",
      "--port",
      "8788",
      "--binding",
      "TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA",
    ],
    { stdio: "inherit", env },
  );
  dev.on("exit", (c) => {
    process.exitCode = c || 0;
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => dev.kill(signal));
});
