// 로그인 토큰 저장소 (Durable Object).
//
// 예전에는 토큰을 KV에 두고 요청마다 각자 갱신했어요. 그런데
//  1) 15분 크론, 대시보드 새로고침, 위젯이 동시에 갱신하면 같은 refresh token을 두 번 쓰게 되고,
//  2) KV는 지역마다 최대 60초 늦게 반영돼서, 다른 지역의 크론이 이미 쓴 옛 refresh token을 다시 쓸 수 있었어요.
// refresh token은 한 번 쓰면 바뀌기 때문에, 옛 토큰을 다시 쓰면 거부되고 로그인이 풀렸어요.
//
// Durable Object는 항상 한 곳에서만 실행되고 저장값이 즉시 반영돼요.
// 여기서 갱신을 한 번에 하나씩 처리해서 같은 토큰을 두 번 쓰지 않게 해요.
import { DurableObject } from "cloudflare:workers";
import { refreshTokens as refreshClaude } from "./claude.js";
import { refreshTokens as refreshCodex } from "./codex.js";
import { refreshTokens as refreshGrok, startDevice, pollDevice, publicDevice } from "./grok-protocol.js";
import { AuthExpiredError } from "./util.js";

const REFRESHERS = { claude: refreshClaude, codex: refreshCodex, grok: refreshGrok };
const LEGACY_KV_KEYS = { claude: "claude:tokens", codex: "codex:tokens" };
// 만료 10분 전부터 미리 갱신해요.
const REFRESH_MARGIN = 600;
const MAX_LOG = 30;
// 비밀번호 시도: IP마다 15분에 10번까지
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW = 900;

export class TokenStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.queue = {};
  }

  async read(name) {
    let tokens = await this.ctx.storage.get(name);
    if (tokens === undefined) {
      // 처음 한 번만: 예전에 KV에 저장된 토큰을 옮겨 와요. 다시 연결할 필요가 없어요.
      const raw = LEGACY_KV_KEYS[name] ? await this.env.KV.get(LEGACY_KV_KEYS[name]) : null;
      tokens = raw ? JSON.parse(raw) : null;
      await this.ctx.storage.put(name, tokens);
      if (raw) {
        await this.env.KV.delete(LEGACY_KV_KEYS[name]);
        await this.note(name, "KV에서 토큰을 옮겨 옴");
      }
    }
    return tokens;
  }

  async write(name, tokens) {
    await this.ctx.storage.put(name, tokens);
    await this.note(name, tokens ? "새로 로그인함" : "연결 해제함");
  }

  /**
   * 쓸 수 있는 토큰을 돌려줘요. 만료가 가까우면 갱신해요.
   * force: 서버가 토큰을 거부했을 때 갱신을 요청해요. failedAccess가 지금 토큰과 다르면
   *        그 사이 다른 요청이 이미 갱신한 것이라 다시 갱신하지 않아요.
   * 결과는 { tokens } 또는 { error, expired } 예요. (오류 객체는 RPC로 넘어가면 종류가 사라져서)
   */
  async fresh(name, opts = {}) {
    // 앞선 갱신이 끝날 때까지 기다렸다가, 저장된 최신 토큰을 보고 다시 판단해요.
    while (this.queue[name]) await this.queue[name];
    const job = this.refreshIfNeeded(name, opts);
    this.queue[name] = job;
    try {
      return await job;
    } finally {
      if (this.queue[name] === job) delete this.queue[name];
    }
  }

  async refreshIfNeeded(name, { force = false, failedAccess = null } = {}) {
    const tokens = await this.read(name);
    if (!tokens) return { tokens: null };
    // 이미 거부된 refresh token은 다시 보내지 않아요. 다시 연결하면 새 토큰으로 바뀌어요.
    if (tokens.rejected) return { error: tokens.rejected, expired: true };
    const expiring = tokens.expires_at - REFRESH_MARGIN < Date.now() / 1000;
    const rejected = force && (!failedAccess || tokens.access_token === failedAccess);
    if (!expiring && !rejected) return { tokens };
    try {
      const next = await REFRESHERS[name](tokens);
      await this.ctx.storage.put(name, next);
      await this.note(name, rejected ? "토큰 갱신 (서버가 거부해서)" : "토큰 갱신 (만료 임박)");
      return { tokens: next };
    } catch (err) {
      const expired = err instanceof AuthExpiredError;
      if (expired) await this.ctx.storage.put(name, { ...tokens, rejected: err.message });
      await this.note(name, (expired ? "갱신 거부: " : "갱신 실패: ") + err.message);
      return { error: err.message, expired };
    }
  }

  async note(name, message) {
    const log = (await this.ctx.storage.get("log")) || [];
    log.push({ at: new Date().toISOString(), provider: name, message: message.slice(0, 300) });
    await this.ctx.storage.put("log", log.slice(-MAX_LOG));
  }

  async history() {
    return (await this.ctx.storage.get("log")) || [];
  }

  // Device login and token refresh share one queue, including overlapping phone tabs.
  async grokLogin(action) {
    while (this.queue.grok) await this.queue.grok;
    const job = this.grokLoginOnce(action).catch((err) => ({ error: err.message }));
    this.queue.grok = job;
    try { return await job; }
    finally { if (this.queue.grok === job) delete this.queue.grok; }
  }

  async grokLoginOnce(action) {
    const key = "grok:device";
    if (action === "disconnect") {
      await this.ctx.storage.delete(key);
      await this.write("grok", null);
      await this.setState("usage:grok", null);
      return { ok: true };
    }
    let pending = await this.ctx.storage.get(key);
    const now = Math.floor(Date.now() / 1000);
    if (action === "start") {
      if (!pending || pending.expires_at <= now) {
        pending = await startDevice();
        await this.ctx.storage.put(key, pending);
      }
      return publicDevice(pending);
    }
    if (action !== "poll") return { error: "잘못된 요청" };
    if (!pending) return (await this.read("grok")) ? { ok: true } : { error: "Grok 연결을 먼저 시작해 주세요.", terminal: true };
    if (pending.next_poll <= now) await this.ctx.storage.put(key, { ...pending, next_poll: now + pending.interval });
    const result = await pollDevice(pending);
    if (result.tokens) {
      await this.write("grok", result.tokens);
      await this.setState("usage:grok", null);
      await this.ctx.storage.delete(key);
      return { ok: true };
    }
    if (result.terminal) await this.ctx.storage.delete(key);
    if (result.pending) {
      await this.ctx.storage.put(key, result.pending);
      return publicDevice(result.pending);
    }
    return result;
  }

  // ---- 자주 바뀌는 값 (사용량, 중계 요청 시각, 로그인 링크 토큰) ----
  // KV는 무료 쓰기 한도가 하루 1,000회라 이런 값은 여기에 둬요. (Durable Object는 하루 10만 행)
  // 예전에 KV에 저장된 값은 처음 읽을 때 한 번만 옮겨 와요.

  async getState(keys) {
    const out = {};
    for (const key of keys) {
      let value = await this.ctx.storage.get("state:" + key);
      if (value === undefined) {
        const raw = await this.env.KV.get(key);
        value = raw ? JSON.parse(raw) : null;
        await this.ctx.storage.put("state:" + key, value);
        if (raw) await this.env.KV.delete(key);
      }
      out[key] = value;
    }
    return out;
  }

  async setState(key, value) {
    await this.ctx.storage.put("state:" + key, value ?? null);
  }

  // ---- 비밀번호 시도 횟수 ----
  // 예전에는 KV에 셌는데, KV는 동시에 보낸 요청끼리 횟수를 못 맞추고, 틀린 비밀번호가 쌓이면
  // 하루 1,000회인 무료 쓰기 한도를 다 써서 내 로그인(세션 저장)까지 막힐 수 있었어요.
  // 여기서는 요청이 하나씩 처리돼서 횟수가 정확해요.

  /** 비밀번호를 확인하기 전에 시도 1회를 미리 세요. 15분 안에 10번을 넘으면 false. */
  async loginAttempt(ip, now = Math.floor(Date.now() / 1000)) {
    await this.pruneLoginAttempts(now);
    const key = "loginfail:" + ip;
    const rec = await this.ctx.storage.get(key);
    const live = rec && rec.until > now ? rec : { count: 0, until: now + LOGIN_WINDOW };
    if (live.count >= LOGIN_LIMIT) return false;
    await this.ctx.storage.put(key, { count: live.count + 1, until: live.until });
    return true;
  }

  /** 로그인에 성공하면 그 IP의 기록을 바로 지워요. */
  async loginSucceeded(ip) {
    await this.ctx.storage.delete("loginfail:" + ip);
  }

  // 만료된 IP 기록을 지워서 저장소가 계속 커지지 않게 해요.
  // 시도마다 조금씩(20개)만 봐서, 누가 계속 시도해도 읽기 한도를 많이 쓰지 않아요.
  async pruneLoginAttempts(now) {
    const old = [];
    for (const [key, rec] of await this.ctx.storage.list({ prefix: "loginfail:", limit: 20 })) {
      if (!rec || rec.until <= now) old.push(key);
    }
    if (old.length) await this.ctx.storage.delete(old);
  }

  /** 연결 여부(토큰이 있는지)와 저장된 값을 한 번에 돌려줘요. 대시보드·위젯이 여러 번 묻지 않게 해요. */
  async overview(keys) {
    const connected = {};
    for (const name of Object.keys(REFRESHERS)) connected[name] = !!(await this.read(name));
    return { connected, state: await this.getState(keys) };
  }
}

/** Worker 쪽에서 쓰는 간단한 접근 도구 */
export function tokenStore(env) {
  const stub = env.TOKENS.get(env.TOKENS.idFromName("main"));
  return {
    put: (name, tokens) => stub.write(name, tokens),
    remove: (name) => stub.write(name, null),
    history: () => stub.history(),
    getOne: async (key) => (await stub.getState([key]))[key],
    overview: (keys) => stub.overview(keys),
    setState: (key, value) => stub.setState(key, value),
    grokLogin: (action) => stub.grokLogin(action),
    loginAttempt: (ip) => stub.loginAttempt(ip),
    loginSucceeded: (ip) => stub.loginSucceeded(ip),
    async fresh(name, opts) {
      const r = await stub.fresh(name, opts);
      if (r.error) throw r.expired ? new AuthExpiredError(r.error) : new Error(r.error);
      return r.tokens;
    },
  };
}

