import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRIES = [
  "index.html",
  "operations/index.html",
  "pages/index.html",
];

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port ?? "3000");
const host = args.host ?? "127.0.0.1";
const upstreamPort = Number(args["upstream-port"] ?? await findAvailablePort(port + 1));

const upstream = Bun.spawn({
  cmd: ["bun", "--hot", "--port", String(upstreamPort), ...ENTRIES],
  cwd: ROOT,
  stdout: "pipe",
  stderr: "pipe",
  env: process.env,
});

pipeProcessOutput(upstream.stdout, "");
pipeProcessOutput(upstream.stderr, "");

const aliases = new Map([
  ["/index.html", "/"],
  ["/operations/", "/operations"],
  ["/operations/index.html", "/operations"],
  ["/pages/", "/pages"],
  ["/pages/index.html", "/pages"],
]);

const server = Bun.serve({
  hostname: host,
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const alias = aliases.get(url.pathname);
    if (alias) {
      url.pathname = alias;
      return Response.redirect(url.toString(), 302);
    }

    const target = new URL(request.url);
    target.protocol = "http:";
    target.hostname = "127.0.0.1";
    target.port = String(upstreamPort);

    const headers = new Headers(request.headers);
    headers.set("host", `127.0.0.1:${upstreamPort}`);
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
      init.duplex = "half";
    }

    try {
      return await fetch(target, init);
    } catch (error) {
      return new Response(`Dev upstream unavailable: ${(error as Error).message}`, { status: 502 });
    }
  },
});

console.log(`Viewer dev server: http://${host}:${server.port}/`);
console.log(`Bun HTML upstream: http://127.0.0.1:${upstreamPort}/`);
console.log("Aliases: /index.html, /operations/index.html, /pages/index.html");

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    upstream.kill(signal);
    server.stop(true);
    process.exit(0);
  });
}

await upstream.exited;
server.stop(true);
process.exit(upstream.exitCode ?? 0);

function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") {
      out.port = argv[++i];
    } else if (arg === "--host") {
      out.host = argv[++i];
    } else if (arg === "--upstream-port") {
      out["upstream-port"] = argv[++i];
    } else if (arg.startsWith("--port=")) {
      out.port = arg.slice("--port=".length);
    } else if (arg.startsWith("--host=")) {
      out.host = arg.slice("--host=".length);
    } else if (arg.startsWith("--upstream-port=")) {
      out["upstream-port"] = arg.slice("--upstream-port=".length);
    } else {
      out[arg.replace(/^--/, "")] = true;
    }
  }
  return out;
}

async function findAvailablePort(start: number) {
  for (let candidate = start; candidate < start + 100; candidate += 1) {
    if (await canListen(candidate)) return candidate;
  }
  throw new Error(`No available upstream port found starting at ${start}`);
}

function canListen(candidate: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port: candidate }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function pipeProcessOutput(stream: ReadableStream<Uint8Array> | null, prefix: string) {
  if (!stream) return;
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    const text = decoder.decode(chunk);
    process.stdout.write(prefix ? `${prefix}${text}` : text);
  }
}
