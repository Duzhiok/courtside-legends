# 联机服务端部署说明

联机服务端（`server/online-server.mjs`）默认只适合本机开发：明文 `ws://`、监听所有网卡。
**要让别人从公网连进来，请先读完这一页。**

## 为什么必须上 TLS

登录时密码和会话令牌都在 WebSocket 消息里。明文 `ws://` 下，同一网络里的任何人都能直接读到。
并且，从 `https://` 页面打开联机页时，浏览器会**禁止**连 `ws://`（混合内容），只能连 `wss://`。

服务端启动时如果发现自己在明文监听非本机地址，会在控制台打印 `⚠ 正在以明文 ws:// 监听…`。看到它就说明还没配好。

## 两种部署方式，选一种

### 方式 A：服务端自己带证书

```bash
node server/online-server.mjs \
  --port=3443 \
  --tls-cert=/etc/letsencrypt/live/你的域名/fullchain.pem \
  --tls-key=/etc/letsencrypt/live/你的域名/privkey.pem
```

- 客户端联机页的"服务器"一栏填 `wss://你的域名:3443`。
- 证书和私钥**只在启动时读取一次**。证书续期后要重启服务端才生效。
- 路径错了会立刻退出（退出码 1），并指出是证书还是私钥读不到，不会带着错误配置悄悄跑起来。
- 对这个端口发普通 HTTPS 请求会得到 `426`，说明它只接受 WebSocket。

### 方式 B：反向代理做 TLS，服务端只听本机

服务端：

```bash
node server/online-server.mjs --port=3001 --host=127.0.0.1 --trust-proxy
```

Caddy（自动签证书，WebSocket 无需额外配置）：

```
你的域名 {
    reverse_proxy 127.0.0.1:3001
}
```

nginx：

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 1h;
}
```

客户端填 `wss://你的域名`。

> **`--trust-proxy` 只在服务端只能经由代理访问时才安全。** 它让服务端相信 `X-Forwarded-For`
> 来判断客户端地址（用于注册限流）。如果服务端的端口还能被外界直接连上（没加 `--host=127.0.0.1`、
> 防火墙也没拦），任何人都可以自己填这个头来伪造地址，限流就形同虚设。
> 服务端取的是这个头**最右边**的一项（也就是你自己的代理追加的那一项），左边的内容当作客户端伪造的，不采信。

## 配置项

命令行参数优先于环境变量。

| 命令行 | 环境变量 | 默认 | 作用 |
|---|---|---|---|
| `--port=N` | `ONLINE_PORT` | `3001` | 监听端口（`0` = 随机空闲端口） |
| `--host=ADDR` | `ONLINE_HOST` | 所有网卡 | 只绑定这个地址；用代理时填 `127.0.0.1` |
| `--tls-cert=FILE` | `ONLINE_TLS_CERT` | 无 | 证书（须和私钥一起给） |
| `--tls-key=FILE` | `ONLINE_TLS_KEY` | 无 | 私钥 |
| `--trust-proxy` | `ONLINE_TRUST_PROXY=1` | 关 | 采信 `X-Forwarded-For` 最右一项；只有 `1` 这个值有效 |

## 已有的防刷限制

| 限制 | 默认 | 在哪改 |
|---|---|---|
| 每个客户端地址每小时最多新注册 | 5 个 | `server/online-ratelimit.mjs` 的 `REGISTER_PER_IP_LIMIT` |
| 全服每小时最多新注册 | 100 个 | `REGISTER_GLOBAL_LIMIT` |
| 对决奖金 | 只有赢家拿 200，输家没有 | `server/online-prizes.mjs` 的 `WIN_PRIZE` |
| 同两个账号之间每天付奖次数 | 3 次（不分谁赢） | `PAIR_DAILY_PRIZE_LIMIT` |
| 单账号每天奖金上限 | 1000 | `DAILY_PRIZE_CAP` |

- 注册限流在做密码哈希**之前**检查，只在账号真正创建成功后才记一次：打错名字、名字重复、密码太短都不占额度。
- 奖金上限按 UTC 自然日重置，存进经济存档，重启服务端不会清零。
- 被限制时，赢家会在聊天栏看到原因（"今天和这位对手的奖金次数已用完"/"今日奖金已封顶"），不会无声地少拿钱。
- 认输（对手掉线）仍然给赢家奖金，但和正常对局共用同样的上限。

## 还没做的（别当作已经安全）

- **没有 Origin 校验**：任何网页都能让访客的浏览器去连你的服务端。注册限流是按服务端看到的地址算的，所以这类滥用会算到访客头上，而不是攻击者。
- **登录只有"按账号"的锁定**（连错 5 次锁 60 秒），没有按地址的登录限流。
- **会话令牌只放内存、没有过期时间**：服务端不重启就一直有效。
- **只支持单进程**：账号和经济存档是单个 JSON 文件，没有跨进程锁。
- **奖金仍然是凭空产生的**：上限只是控制了产出速度，经济里还没有金币回收的出口（市场税、赛季重置等）。
- 如果你的 shell 里设了 `NODE_TLS_REJECT_UNAUTHORIZED=0`，这台机器上的**所有** Node 程序都不校验证书。
  本地测 wss 时可能因此"自签证书也能连上"，别被它误导。
