/**
 * 双层缓存
 *
 * ① 内存：TTL 5 分钟。菜单在一天内基本稳定，缓存能砍掉 90% 的 MCP 调用。
 * ② 磁盘：.cache/mcd-<key>.json。MCP 挂掉时读上次成功的响应，
 *    让用户至少还能看到「12 分钟前的菜单」而不是一片空白。
 *
 * 只缓 query 类工具，不缓 calculate-price / create-order —— 价格与订单
 * 必须实时，缓存价格会让用户看到的金额和实际支付不一致。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const TTL_MS = 5 * 60 * 1000;
const CACHE_DIR = path.join(process.cwd(), '.cache');

interface Entry {
  at: number;
  data: unknown;
}

const memory = new Map<string, Entry>();

export function cacheGet<T = unknown>(key: string): T | undefined {
  const hit = memory.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    memory.delete(key);
    return undefined;
  }
  return hit.data as T;
}

export function cacheSet(key: string, data: unknown): void {
  memory.set(key, { at: Date.now(), data });
}

function safeName(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function diskSet(key: string, data: unknown): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(
      path.join(CACHE_DIR, `mcd-${safeName(key)}.json`),
      JSON.stringify({ at: Date.now(), data }),
      'utf8',
    );
  } catch {
    // 磁盘不可写（只读文件系统 / Serverless）时静默失败，内存缓存仍然有效
  }
}

export async function diskGet<T = unknown>(
  key: string,
): Promise<{ data: T; ageMs: number } | undefined> {
  try {
    const raw = await fs.readFile(
      path.join(CACHE_DIR, `mcd-${safeName(key)}.json`),
      'utf8',
    );
    const parsed = JSON.parse(raw) as Entry;
    if (!parsed || typeof parsed.at !== 'number') return undefined;
    return { data: parsed.data as T, ageMs: Date.now() - parsed.at };
  } catch {
    return undefined;
  }
}

/** 只对这些工具做缓存 */
export const CACHEABLE = new Set([
  'query-nearby-stores',
  'query-meals',
  'query-meal-detail',
  'list-nutrition-foods',
  'query-store-coupons',
  'now-time-info',
]);

/**
 * 缓存键：工具名 + 全部入参的稳定序列化。
 *
 * ⚠️ 上一版只取了 `storeCode / beCode / orderType / beType / code / reservationDate`
 * 六个字段，漏掉了 `city` 和 `keyword` —— 于是「北京 + 国贸」和「北京 + 麦当劳」
 * 共用同一个缓存槽：第一次查失败写进缓存，之后所有门店搜索都读到那条失败结果，
 * 整站在 5 分钟内彻底查不到门店。**缓存键必须覆盖全部入参，不能挑着取。**
 */
export function cacheKey(tool: string, args: Record<string, unknown>): string {
  const stable = Object.keys(args)
    .sort()
    .map(k => {
      const v = args[k];
      const s =
        v === null || v === undefined
          ? ''
          : typeof v === 'object'
            ? JSON.stringify(v)
            : String(v);
      return `${k}=${s}`;
    })
    .join('&');
  return `${tool}?${stable}`;
}
