// Transport security for the online server: it used to speak plain ws:// only, so passwords and session tokens
// crossed the network in the clear. It can now serve wss:// itself (certificate + key), bind to a chosen
// address (so a reverse proxy can be the only thing exposed), and it says so loudly when it is about to listen
// in plaintext on every interface.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import https from "node:https";
import net from "node:net";
import { createOnlineServer } from "../server/online-server.mjs";
import { listeningInfo, parseServerConfig } from "../server/online-transport.mjs";
import { connect, loginClient, tmpFile, waitFor } from "./helpers/onlineWire.js";

/** A throwaway self-signed certificate for localhost. Generated per run: no private key lives in the repo. */
function makeCert() {
  const dir = mkdtempSync(join(tmpdir(), "courtside-tls-"));
  const certFile = join(dir, "cert.pem");
  const keyFile = join(dir, "key.pem");
  try {
    execFileSync(
      "openssl",
      ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"],
      { stdio: "ignore" },
    );
  } catch {
    rmSync(dir, { recursive: true, force: true });
    return null;
  }
  return { dir, certFile, keyFile, ca: readFileSync(certFile), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const cert = makeCert();
const needsOpenssl = { skip: cert ? false : "openssl is not available to generate a test certificate" };

async function withTlsServer(fn, extra = {}) {
  const acctFile = tmpFile("acct");
  const ecoFile = tmpFile("eco");
  const server = createOnlineServer({
    port: 0,
    accountsFile: acctFile,
    economyFile: ecoFile,
    tls: { certFile: cert.certFile, keyFile: cert.keyFile },
    ...extra,
  });
  await new Promise((r) => server.wss.on("listening", r));
  const open = [];
  try {
    await fn({ server, port: server.port(), keep: (c) => { open.push(c); return c; } });
  } finally {
    for (const c of open) try { c.ws.close(); } catch { /* already closed */ }
    await server.close();
    rmSync(acctFile, { force: true });
    rmSync(ecoFile, { force: true });
  }
}

test("wss: a client that trusts the certificate connects, registers and logs in", needsOpenssl, async () => {
  await withTlsServer(async ({ server, port, keep }) => {
    assert.equal(server.secure, true);
    const c = keep(await connect(`wss://localhost:${port}`, { ca: cert.ca }));
    assert.equal((await waitFor(c.messages, (m) => m.type === "welcome")).type, "welcome");
    const user = keep(await loginClient(`wss://localhost:${port}`, "Alice", { options: { ca: cert.ca } }));
    assert.ok(user.token, "a full register + login round trip works over TLS");
  });
});

test("wss: the certificate is really checked: an untrusted self-signed one is refused", needsOpenssl, async () => {
  await withTlsServer(async ({ port }) => {
    // Explicit: some shells export NODE_TLS_REJECT_UNAUTHORIZED=0, which silently turns verification off for every Node process.
    await assert.rejects(connect(`wss://localhost:${port}`, { rejectUnauthorized: true }), /self[- ]signed|unable to verify|certificate/i);
  });
});

test("wss: a plaintext ws:// client cannot talk to the TLS port", needsOpenssl, async () => {
  await withTlsServer(async ({ port }) => {
    await assert.rejects(connect(`ws://localhost:${port}`));
  });
});

test("wss: an ordinary HTTPS request gets a clear 426, not a hang", needsOpenssl, async () => {
  await withTlsServer(async ({ port }) => {
    const res = await new Promise((resolve, reject) => {
      https
        .get({ host: "localhost", port, path: "/", ca: cert.ca }, (r) => {
          let body = "";
          r.on("data", (d) => (body += d));
          r.on("end", () => resolve({ status: r.statusCode, body }));
        })
        .on("error", reject);
    });
    assert.equal(res.status, 426);
    assert.match(res.body, /WebSocket/);
  });
});

test("wss: close() releases the port", needsOpenssl, async () => {
  const acctFile = tmpFile("acct");
  const ecoFile = tmpFile("eco");
  const server = createOnlineServer({ port: 0, accountsFile: acctFile, economyFile: ecoFile, tls: { certFile: cert.certFile, keyFile: cert.keyFile } });
  await new Promise((r) => server.wss.on("listening", r));
  const port = server.port();
  const idle = await connect(`wss://localhost:${port}`, { ca: cert.ca }); // an open connection must not stall close()
  await server.close();
  idle.ws.terminate();
  await new Promise((resolve, reject) => {
    const probe = net.connect({ port, host: "127.0.0.1" });
    probe.on("connect", () => { probe.destroy(); reject(new Error("the port is still accepting connections")); });
    probe.on("error", () => resolve());
  });
  rmSync(acctFile, { force: true });
  rmSync(ecoFile, { force: true });
});

/** Start options for a server that must fail on its TLS config (throwaway save files, in case it did not). */
const misconfigured = (tls) => ({ port: 0, accountsFile: tmpFile("acct"), economyFile: tmpFile("eco"), tls });

test("tls misconfiguration fails at startup with a message that names the problem", () => {
  assert.throws(() => createOnlineServer(misconfigured({ certFile: "/nonexistent/cert.pem", keyFile: "/nonexistent/key.pem" })), /无法读取 TLS 证书文件 \/nonexistent\/cert\.pem/);
  assert.throws(() => createOnlineServer(misconfigured({ certFile: "/x/cert.pem" })), /同时提供证书和私钥/);
  assert.throws(() => createOnlineServer(misconfigured({ keyFile: "/x/key.pem" })), /同时提供证书和私钥/);
});

test("tls: an unreadable PRIVATE KEY is reported as such, not as a certificate problem", needsOpenssl, () => {
  assert.throws(() => createOnlineServer(misconfigured({ certFile: cert.certFile, keyFile: "/nonexistent/key.pem" })), /无法读取 TLS 私钥文件/);
});

test("plain mode is unchanged and says it is not secure", async () => {
  const acctFile = tmpFile("acct");
  const ecoFile = tmpFile("eco");
  const server = createOnlineServer({ port: 0, accountsFile: acctFile, economyFile: ecoFile });
  await new Promise((r) => server.wss.on("listening", r));
  try {
    assert.equal(server.secure, false);
    const c = await connect(`ws://localhost:${server.port()}`);
    assert.equal((await waitFor(c.messages, (m) => m.type === "welcome")).type, "welcome");
    c.ws.close();
  } finally {
    await server.close();
    rmSync(acctFile, { force: true });
    rmSync(ecoFile, { force: true });
  }
});

test("host: the server can bind to one address only (so a reverse proxy can be the only way in)", async () => {
  const acctFile = tmpFile("acct");
  const ecoFile = tmpFile("eco");
  const server = createOnlineServer({ port: 0, host: "127.0.0.1", accountsFile: acctFile, economyFile: ecoFile });
  await new Promise((r) => server.wss.on("listening", r));
  try {
    assert.equal(server.wss.address().address, "127.0.0.1");
  } finally {
    await server.close();
    rmSync(acctFile, { force: true });
    rmSync(ecoFile, { force: true });
  }
});

// ---- the real command line ----

const SERVER_ENTRY = new URL("../server/online-server.mjs", import.meta.url).pathname;

/** Run the server as a user would. HOME points at a throwaway directory so it never touches real save files. */
function runServer(args, env = {}) {
  const home = mkdtempSync(join(tmpdir(), "courtside-home-"));
  const child = spawn(process.execPath, [SERVER_ENTRY, ...args], { env: { PATH: process.env.PATH, HOME: home, ...env } });
  const out = { stdout: "", stderr: "" };
  child.stdout.on("data", (d) => (out.stdout += d));
  child.stderr.on("data", (d) => (out.stderr += d));
  const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
  const until = async (pred, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (pred(out)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  };
  const stop = async () => {
    child.kill();
    await exited;
    rmSync(home, { recursive: true, force: true });
  };
  return { child, out, until, stop, exited };
}

test("cli: --tls-cert/--tls-key starts a wss server you can actually connect to", needsOpenssl, async () => {
  const run = runServer(["--port=0", "--host=127.0.0.1", `--tls-cert=${cert.certFile}`, `--tls-key=${cert.keyFile}`]);
  try {
    assert.ok(await run.until((o) => /listening on wss:\/\/localhost:\d+/.test(o.stdout)), `no startup line; stderr: ${run.out.stderr}`);
    assert.equal(run.out.stderr.includes("明文"), false, "no plaintext warning when TLS is on");
    const port = run.out.stdout.match(/wss:\/\/localhost:(\d+)/)[1];
    const c = await connect(`wss://127.0.0.1:${port}`, { ca: cert.ca });
    assert.equal((await waitFor(c.messages, (m) => m.type === "welcome")).type, "welcome");
    c.ws.close();
  } finally {
    await run.stop();
  }
});

test("cli: plain ws on every interface prints the plaintext warning", async () => {
  const run = runServer(["--port=0"]);
  try {
    assert.ok(await run.until((o) => /listening on ws:\/\//.test(o.stdout)), `no startup line; stderr: ${run.out.stderr}`);
    assert.ok(await run.until((o) => o.stderr.includes("明文")), "the warning is printed");
    assert.match(run.out.stderr, /wss|TLS|反向代理/);
  } finally {
    await run.stop();
  }
});

test("cli: plain ws on loopback is quiet (local development)", async () => {
  const run = runServer(["--port=0", "--host=127.0.0.1"]);
  try {
    assert.ok(await run.until((o) => /listening on ws:\/\//.test(o.stdout)));
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(run.out.stderr.includes("明文"), false);
  } finally {
    await run.stop();
  }
});

test("cli: a bad certificate path stops the server with exit code 1 and says why", async () => {
  const run = runServer(["--port=0", "--tls-cert=/nonexistent/c.pem", "--tls-key=/nonexistent/k.pem"]);
  const code = await run.exited;
  assert.equal(code, 1);
  assert.match(run.out.stderr, /启动失败.*无法读取 TLS 证书文件 \/nonexistent\/c\.pem/);
  assert.equal(run.out.stdout.includes("listening"), false);
  await run.stop();
});

// ---- the command line / environment ----

test("parseServerConfig: defaults are the old behaviour", () => {
  assert.deepEqual(parseServerConfig([], {}), { port: 3001, host: undefined, tls: undefined, trustProxy: false });
});

test("parseServerConfig: environment variables", () => {
  const cfg = parseServerConfig([], {
    ONLINE_PORT: "4443",
    ONLINE_HOST: "127.0.0.1",
    ONLINE_TLS_CERT: "/etc/c.pem",
    ONLINE_TLS_KEY: "/etc/k.pem",
    ONLINE_TRUST_PROXY: "1",
  });
  assert.deepEqual(cfg, { port: 4443, host: "127.0.0.1", tls: { certFile: "/etc/c.pem", keyFile: "/etc/k.pem" }, trustProxy: true });
});

test("parseServerConfig: command line flags win over the environment", () => {
  const cfg = parseServerConfig(["--port=5000", "--host=::1", "--tls-cert=/a.pem", "--tls-key=/b.pem"], { ONLINE_PORT: "4443", ONLINE_HOST: "0.0.0.0" });
  assert.equal(cfg.port, 5000);
  assert.equal(cfg.host, "::1");
  assert.deepEqual(cfg.tls, { certFile: "/a.pem", keyFile: "/b.pem" });
});

test("parseServerConfig: trusting the proxy header must be asked for explicitly", () => {
  assert.equal(parseServerConfig([], { ONLINE_TRUST_PROXY: "0" }).trustProxy, false);
  assert.equal(parseServerConfig([], { ONLINE_TRUST_PROXY: "true" }).trustProxy, false, "only the documented value turns it on");
  assert.equal(parseServerConfig(["--trust-proxy"], {}).trustProxy, true);
});

test("parseServerConfig: half a TLS setup is passed through so startup can refuse it", () => {
  assert.deepEqual(parseServerConfig(["--tls-cert=/a.pem"], {}).tls, { certFile: "/a.pem", keyFile: undefined });
});

test("listeningInfo: wss url and no warning when TLS is on", () => {
  const info = listeningInfo({ secure: true, host: undefined, port: 4443 });
  assert.equal(info.url, "wss://localhost:4443");
  assert.equal(info.warning, null);
});

test("listeningInfo: plaintext on every interface is called out", () => {
  const info = listeningInfo({ secure: false, host: undefined, port: 3001 });
  assert.equal(info.url, "ws://localhost:3001");
  assert.match(info.warning, /明文/);
  assert.match(info.warning, /wss|TLS|反向代理/);
});

test("listeningInfo: plaintext on loopback only is fine (local development, or behind a proxy)", () => {
  for (const host of ["127.0.0.1", "localhost", "::1"]) {
    assert.equal(listeningInfo({ secure: false, host, port: 3001 }).warning, null, host);
  }
  assert.match(listeningInfo({ secure: false, host: "0.0.0.0", port: 3001 }).warning, /明文/);
  assert.match(listeningInfo({ secure: false, host: "192.168.1.20", port: 3001 }).warning, /明文/);
});

test.after(() => cert?.cleanup());
