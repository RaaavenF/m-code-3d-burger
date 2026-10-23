'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { pickBurgers, flattenMeals, toBurgerRecipe, type MealLite } from '@/lib/mcp/mappers';
import { SEED_RECIPES } from '@/lib/mcp/seed';
import {
  NUTRITION_SNAPSHOT,
  parseNutritionPayload,
  type NutritionFacts,
} from '@/lib/nutrition';
import type { BurgerRecipe } from '@/types/burger';

type Phase = 'cold' | 'loading' | 'ready' | 'offline';

interface MCPState {
  phase: Phase;
  storeCode: string | null;
  storeName: string | null;
  recipes: BurgerRecipe[];
  /** 营养表：来自 list-nutrition-foods，失败时回落本地快照 */
  nutrition: NutritionFacts[];
  nutritionSource: 'mcp' | 'snapshot';
  /** 是否有过降级（MCP 调用失败） */
  degraded: boolean;
  offline: boolean;
  /**
   * 门店已打烊时，菜单是以「预约时段」的形态拉下来的。
   * 这里保留那个时间串，界面要如实标出来 —— 夜间看到的其实是明天的菜单。
   */
  reservationDate: string | null;
  error: string | null;
  reload: () => void;
  callTool: <T>(tool: string, args: Record<string, unknown>) => Promise<T>;
}

const Ctx = createContext<MCPState | null>(null);

/** 唯一网络出口：只传工具名和参数，Token 在服务端注入 */
async function proxyCall<T>(tool: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args }),
  });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error || `MCP ${tool} 调用失败（HTTP ${res.status}）`);
  }

  // ⚠️ MCP 的业务失败是 **HTTP 200 + { success:false, code, message }**，
  // 不走 HTTP 状态码。上一版直接返回 json.data，于是：
  //   · 「收藏餐厅为空」（600050）被当成门店列表里的一个门店；
  //   · 「门店可能已关闭」（600057）被当成菜单，解析出 0 个餐品后一路降级。
  // 统一在这一层抛错，所有调用点（含打烊重试、结算报错）才能拿到真实原因。
  const d = json.data;
  if (d && typeof d === 'object' && (d as { success?: boolean }).success === false) {
    const code = (d as { code?: unknown }).code;
    const msg = (d as { message?: string }).message || '未知错误';
    throw new Error(`MCP ${tool} 业务失败（${code}）：${msg}`);
  }

  return d as T;
}

/** 限制并发：MCP 侧限流 600 次/分钟，一次开 12 个连接既无必要也容易被判异常 */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('cold');
  const [store, setStore] = useState<{ code: string; name: string } | null>(null);
  const [recipes, setRecipes] = useState<BurgerRecipe[]>([]);
  const [nutrition, setNutrition] = useState<NutritionFacts[]>(NUTRITION_SNAPSHOT);
  const [nutritionSource, setNutritionSource] = useState<'mcp' | 'snapshot'>('snapshot');
  const [degraded, setDegraded] = useState(false);
  const [offline, setOffline] = useState(false);
  const [reservationDate, setReservationDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let dead = false;

    (async () => {
      setPhase('loading');
      setError(null);
      setDegraded(false);
      setReservationDate(null);

      try {
        /* ① 门店上下文 —— 所有查询的前置，且必须带 beType / searchType */
        const stores = await resolveStores();
        const s = stores[0];
        if (!s) throw new Error('没有查到可用门店（可设 NEXT_PUBLIC_MCD_CITY 指定城市）');

        if (dead) return;
        setStore({ code: s.storeCode, name: s.storeName });

        /* ② 营养表并发拉取（失败不阻断主流程）；菜单要单独走，因为它可能需要重试 */
        const nutritionTask = proxyCall<any>('list-nutrition-foods', {}).catch(() => null);

        /* ③ 菜单。注意：门店打烊后 query-meals 直接返回
              600057「门店可能已关闭或不在营业时间」（实测 23:55 查一家 07:00–22:00 的店）。
              这时必须带 reservationDate 查「下一个营业时段」才拿得到菜单 ——
              否则整个站点在夜间会静默退化成演示数据。 */
        const menuArgs: Record<string, unknown> = {
          storeCode: s.storeCode,
          orderType: 1,
          beType: 1,
        };
        let reservationDate: string | undefined;
        let menuRaw: any;
        try {
          menuRaw = await proxyCall<any>('query-meals', menuArgs);
        } catch {
          reservationDate = nextServingSlot(s.businessStartTime);
          menuRaw = await proxyCall<any>('query-meals', { ...menuArgs, reservationDate });
          if (!dead) setReservationDate(reservationDate);
        }

        const nutritionRaw = await nutritionTask;

        if (dead) return;

        const table = parseNutritionPayload(nutritionRaw);
        if (table.length > 0) {
          setNutrition(table);
          setNutritionSource('mcp');
        } else {
          setNutrition(NUTRITION_SNAPSHOT);
          setNutritionSource('snapshot');
          setDegraded(true);
        }

        const burgers: MealLite[] = pickBurgers(flattenMeals(menuRaw), 12);
        if (burgers.length === 0) throw new Error('菜单里没有找到汉堡');

        /* ④ 并发拉详情（限 4 并发） */
        const details = await mapLimit(burgers, 4, async b => {
          try {
            return await proxyCall<any>('query-meal-detail', {
              storeCode: s.storeCode,
              orderType: 1,
              beType: 1,
              code: b.productCode,
              // 菜单是预约查来的，详情必须沿用同一个预约时间，否则同样落到 600057
              ...(reservationDate ? { reservationDate } : {}),
            });
          } catch {
            return null;
          }
        });

        if (dead) return;

        const mapped = details
          .map((d, i) =>
            toBurgerRecipe(
              d,
              burgers[i]?.productCode ?? '',
              'mcp',
              table.length ? table : NUTRITION_SNAPSHOT,
              burgers[i]?.price,
            ),
          )
          .filter((r): r is BurgerRecipe => Boolean(r && r.layers.length > 2));

        if (mapped.length === 0) throw new Error('餐品详情里没有解析出任何配方');

        setRecipes(mapped);
        setOffline(false);
        setPhase('ready');
      } catch (e) {
        if (dead) return;
        const msg = e instanceof Error ? e.message : '未知错误';
        console.warn('[MCP] 降级到内置快照：', msg);

        setError(msg);
        setRecipes(SEED_RECIPES);
        setNutrition(NUTRITION_SNAPSHOT);
        setNutritionSource('snapshot');
        setDegraded(true);
        setOffline(true);
        setPhase('offline');
      }
    })();

    return () => {
      dead = true;
    };
  }, [nonce]);

  const callTool = useCallback(
    <T,>(tool: string, args: Record<string, unknown>) => proxyCall<T>(tool, args),
    [],
  );

  const value = useMemo<MCPState>(
    () => ({
      phase,
      storeCode: store?.code ?? null,
      storeName: store?.name ?? null,
      recipes,
      nutrition,
      nutritionSource,
      degraded,
      offline,
      reservationDate,
      error,
      reload: () => setNonce(n => n + 1),
      callTool,
    }),
    [phase, store, recipes, nutrition, nutritionSource, degraded, offline, reservationDate, error, callTool],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMCP(): MCPState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMCP 必须在 <MCPProvider> 内使用');
  return v;
}

/* ───────────────────────────────────────────────────────────
 * 门店解析
 *
 * query-nearby-stores 的真实签名是 { beType, searchType, city?, keyword? }：
 *   searchType=1 → 查「收藏餐厅」（不需要城市/关键词）
 *   searchType=2 → 按位置搜索，city + keyword 必填
 *
 * 所以先试收藏，失败再按城市搜。城市/关键词走 NEXT_PUBLIC_ 环境变量，
 * 服务端 MCD_DEFAULT_STORE_CODE 走不通（客户端拿不到）。
 * ─────────────────────────────────────────────────────────── */

async function resolveStores(): Promise<
  { storeCode: string; storeName: string; businessStartTime?: string }[]
> {
  const attempts: Record<string, unknown>[] = [
    { beType: 1, searchType: 1 },
    {
      beType: 1,
      searchType: 2,
      city: process.env.NEXT_PUBLIC_MCD_CITY || '北京',
      keyword: process.env.NEXT_PUBLIC_MCD_KEYWORD || '麦当劳',
    },
  ];

  for (const args of attempts) {
    try {
      const raw = await proxyCall<any>('query-nearby-stores', args);
      // MCP 的业务失败不会抛错，而是 HTTP 200 + `{ success:false, code:600050 }`：
      // 「收藏餐厅列表为空，请您提供城市+关键词进行搜索」就是这条路。
      // 不判这一层，就会把错误码当门店编号继续往下走。
      if (raw && typeof raw === 'object' && (raw as any).success === false) continue;
      const list = extractStores(raw);
      if (list.length > 0) return list;
    } catch {
      // 试下一个策略
    }
  }
  return [];
}

/**
 * 构造「下一个可预约时段」的时间串（`yyyy-MM-dd HH:mm`）。
 *
 * 打烊后 `query-meals` / `query-meal-detail` 都只认 `reservationDate`：
 * 实测 23:55 查一家 07:00–22:00 的店，不带这个参数一律返回
 * `600057 门店可能已关闭或不在营业时间`。
 *
 * 但不能直接拿 `businessStartTime`（07:00）当预约时间 —— 门店的预约起点
 * 通常晚于开门时刻（建外 SOHO 店 07:00 开门，早餐预约 07:14 才开始），
 * 传 07:00 依旧被拒。所以往后推一小时、且不早于 11:00（正餐时段）：
 * 这个兜底只用来拉菜单，不参与真实下单，宁可落在稳定的正餐档。
 */
function nextServingSlot(startTime?: string): string {
  const [hh, mm] = String(startTime || '07:00').split(':').map(n => Number(n));
  const d = new Date();
  d.setSeconds(0, 0);
  d.setHours(Number.isFinite(hh) ? hh : 7, Number.isFinite(mm) ? mm : 0);
  d.setHours(Math.max(d.getHours() + 1, 11));
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 返回结构在不同版本下嵌套不一，做一次宽松抽取 */
function extractStores(
  raw: any,
): { storeCode: string; storeName: string; businessStartTime?: string }[] {
  const out: { storeCode: string; storeName: string; businessStartTime?: string }[] = [];
  const seen = new Set<string>();

  const walk = (node: any, depth: number) => {
    if (!node || depth > 5) return;
    if (Array.isArray(node)) {
      node.forEach(n => walk(n, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;

    // ⚠️ 不能用 `storeCode ?? code`：外层壳对象里也有一个 `code`（成功是 200，
    // 失败是 600050 / 600057 这类**同样 6 位**的业务码），会被当成门店编号。
    // 上一版就是这样把 "200" 当门店去查菜单，必然失败，整站静默退化成内置快照。
    // 真实门店对象一定同时有 storeName，用这一点做二次校验。
    const code =
      node.storeCode ??
      (node.storeName && /^\d{6,}$/.test(String(node.code ?? '')) ? node.code : undefined);
    if (code && !seen.has(String(code))) {
      seen.add(String(code));
      out.push({
        storeCode: String(code),
        storeName: String(node.storeName ?? node.name ?? '麦当劳门店'),
        businessStartTime:
          typeof node.businessStartTime === 'string' ? node.businessStartTime : undefined,
      });
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };

  walk(raw, 0);
  return out;
}
