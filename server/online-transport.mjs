/**
 * How the online server listens: plain ws://, or wss:// with its own certificate; which address it binds to;
 * and how the command line / environment are turned into those options.
 *
 * Two supported deployments (see docs/ONLINE_DEPLOY.md):
 *   1. This process terminates TLS itself:   --tls-cert=... --tls-key=...
 *   2. A reverse proxy terminates TLS and talks plain ws to this process on loopback only:
 *        --host=127.0.0.1 --trust-proxy
 * Plain ws:// on a public interface is the one setup that must never be left running, so it is warned about.
 */

import https from "node:https";
import { readFileSync } from "node:fs";
import { WebSocketServer } from "ws";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * Read the certificate and key. Called first thing at startup so a wrong path fails immediately, with the
 * file named, instead of after the slow parts of startup.
 * @param {{ certFile?: string, keyFile?: string } | undefined} tls
 * @returns {{ cert: Buffer, key: Buffer } | null} null means plain ws://
 */
export function loadTlsCredentials(tls) {
  if (!tls) return null;
  if (!tls.certFile || !tls.keyFile) throw new Error("TLS 需要同时提供证书和私钥文件（certFile 和 keyFile）");
  const read = (label, file) => {
    try {
      return readFileSync(file);
    } catch (err) {
      throw new Error(`无法读取 TLS ${label}文件 ${file}：${err.code || err.message}`);
    }
  };
  return { cert: read("证书", tls.certFile), key: read("私钥", tls.keyFile) };
}

const upgradeRequired = (req, res) => {
  res.writeHead(426, { "content-type": "text/plain; charset=utf-8", upgrade: "websocket" });
  res.end("这里只接受 WebSocket (wss://) 连接\n");
};

/**
 * @param {{ port: number, host?: string, credentials: { cert: Buffer, key: Buffer } | null, maxPayload: number }} options
 * @returns {{ wss: import("ws").WebSocketServer, secure: boolean, closeServer: (done: () => void) => void }}
 */
export function createTransport({ port, host, credentials, maxPayload }) {
  if (!credentials) {
    return { wss: new WebSocketServer({ port, host, maxPayload }), secure: false, closeServer: (done) => done() };
  }
  const httpsServer = https.createServer(credentials, upgradeRequired);
  // With an external server, ws does not close it; closeServer() does.
  const wss = new WebSocketServer({ server: httpsServer, maxPayload });
  httpsServer.listen(port, host);
  return {
    wss,
    secure: true,
    closeServer: (done) => {
      httpsServer.close(() => done());
      httpsServer.closeAllConnections?.(); // an idle keep-alive connection would otherwise stall close()
    },
  };
}

/** The URL to print at startup, and a warning when it is about to listen in plaintext where others can reach it. */
export function listeningInfo({ secure, host, port }) {
  const url = `${secure ? "wss" : "ws"}://localhost:${port}`;
  const exposed = !secure && !LOOPBACK.has(host);
  const warning = exposed
    ? `⚠ 正在以明文 ws:// 监听${host ? ` ${host}` : "所有网卡"}：密码和登录令牌会在网络上明文传输。公网部署请用 --tls-cert/--tls-key 开 wss，或放在反向代理后面并加 --host=127.0.0.1（见 docs/ONLINE_DEPLOY.md）。`
    : null;
  return { url, warning };
}

/**
 * Command line flags win over environment variables.
 * Only the exact value "1" turns on ONLINE_TRUST_PROXY: believing X-Forwarded-For when nothing trustworthy
 * sets it lets any client forge its address.
 */
export function parseServerConfig(argv, env) {
  const flag = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const certFile = flag("tls-cert") ?? env.ONLINE_TLS_CERT;
  const keyFile = flag("tls-key") ?? env.ONLINE_TLS_KEY;
  return {
    port: Number(flag("port") ?? env.ONLINE_PORT ?? 3001),
    host: flag("host") ?? env.ONLINE_HOST,
    tls: certFile || keyFile ? { certFile, keyFile } : undefined,
    trustProxy: argv.includes("--trust-proxy") || env.ONLINE_TRUST_PROXY === "1",
  };
}
