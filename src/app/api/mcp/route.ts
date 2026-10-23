/**
 * MCP 代理
 *
 * 前端唯一的网络出口。只做四件事：
 *   1. 工具白名单校验
 *   2. 命中缓存直接返回
 *   3. 注入 Token 调用 MCP
 *   4. 失败时回落磁盘快照，并标记 stale
 *
 * Token 永远不会出现在响应体里。
 */
import { NextResponse } from 'next/server';
import { callTool, unwrapToolResult } from '@/lib/mcp/client';
import { CACHEABLE, cacheGet, cacheKey, cacheSet, diskGet, diskSet } from '@/lib/mcp/cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 只允许这些工具。不加白名单 = 把 Token 借给全网。 */
const ALLOWED = new Set([
  'query-nearby-stores',
  'query-meals',
  'query-meal-detail',
  'list-nutrition-foods',
  'calculate-price',
  'create-order',
  'query-order',
  'query-store-coupons',
  'now-time-info',
]);

export async function POST(req: Request) {
  let body: { tool?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 });
  }

  const tool = String(body.tool ?? '');
  const args = body.args && typeof body.args === 'object' ? body.args : {};

  if (!ALLOWED.has(tool)) {
    return NextResponse.json({ error: `tool not allowed: ${tool}` }, { status: 403 });
  }

  // 强制离线（无网调试用）
  if (process.env.MCD_OFFLINE === '1' && CACHEABLE.has(tool)) {
    const snap = await diskGet(cacheKey(tool, args));
    if (snap) {
      return NextResponse.json({
        data: snap.data,
        stale: true,
        ageMs: snap.ageMs,
        offline: true,
      });
    }
    return NextResponse.json({ error: 'offline mode and no snapshot' }, { status: 503 });
  }

  const key = cacheKey(tool, args);

  if (CACHEABLE.has(tool)) {
    const hit = cacheGet(key);
    if (hit !== undefined) {
      return NextResponse.json({ data: hit, cached: true });
    }
  }

  try {
    const raw = await callTool(tool, args);
    const data = unwrapToolResult(raw);

    // ⚠️ 只缓存业务成功的结果。
    // MCP 的业务失败不走 HTTP 状态码，而是 200 + `{ success:false, code:600050 }`。
    // 上一版无条件写缓存，于是「收藏餐厅为空」这条失败结果被缓存 5 分钟，
    // 期间所有门店搜索都返回它，前端只能一路降级到内置快照。
    const bizOk = !(data && typeof data === 'object' && (data as { success?: boolean }).success === false);

    if (CACHEABLE.has(tool) && bizOk) {
      cacheSet(key, data);
      // 不 await：磁盘写入不该阻塞响应
      void diskSet(key, data);
    }

    return NextResponse.json({ data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'mcp call failed';

    // 降级：读上次成功的磁盘快照
    if (CACHEABLE.has(tool)) {
      const snap = await diskGet(cacheKey(tool, args));
      if (snap) {
        return NextResponse.json({
          data: snap.data,
          stale: true,
          ageMs: snap.ageMs,
          warning: message,
        });
      }
    }

    // 交易类工具绝不降级
    // 429 = 触发限流（600 次/分钟）。透传状态码，前端可据此退避重试。
    const status = /429|rate limit/i.test(message) ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
