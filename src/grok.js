import { tokenStore } from "./tokens.js";
import { AuthExpiredError } from "./util.js";
import { requestUsage, normalize } from "./grok-protocol.js";

export const startLogin = (env) => tokenStore(env).grokLogin("start");
export const pollLogin = (env) => tokenStore(env).grokLogin("poll");
export const disconnect = (env) => tokenStore(env).grokLogin("disconnect");

export async function fetchUsage(env) {
  const store = tokenStore(env);
  let tokens = await store.fresh("grok");
  if (!tokens) return null;
  let response = await requestUsage(tokens);
  if (response.status === 401) {
    tokens = await store.fresh("grok", { force: true, failedAccess: tokens.access_token });
    if (!tokens) return null;
    response = await requestUsage(tokens);
  }
  if (response.status === 401) throw new AuthExpiredError("Grok 로그인이 만료됐어요. 다시 연결해 주세요.");
  if (!response.ok) throw new Error(`Grok 사용량 조회 실패 (HTTP ${response.status}). 잠시 후 다시 조회해 주세요.`);
  return normalize(await response.json().catch(() => null));
}
