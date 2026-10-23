/**
 * MCP Client —— 只在服务端运行
 *
 * 三条铁律：
 *  1. Token 只从环境变量读，永不出现在任何返回体或日志里；
 *  2. Client 进程内单例复用，避免每个请求新建一条 streamablehttp 连接；
 *  3. 每个调用都有超时，绝不让用户对着白屏等 60 秒。
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const CONNECT_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 12_000;

let clientPromise: Promise<Client> | null = null;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`${name} 未配置。请复制 .env.example 为 .env.local 并填写。`);
  }
  return v.trim();
}

/** 建立连接（进程内只做一次） */
export async function getMcpClient(): Promise<Client> {
  if (clientPromise) return clientPromise;

  const url = process.env.MCD_MCP_URL?.trim() || 'https://mcp.mcd.cn';
  const token = requireEnv('MCD_MCP_TOKEN');

  clientPromise = (async () => {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: {
        headers: {
          // 官方要求：HTTP Header 鉴权
          Authorization: `Bearer ${token}`,
        },
      },
    });

    const client = new Client(
      { name: 'm-code-3d-burger', version: '1.0.0' },
      { capabilities: {} },
    );

    await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, 'MCP connect');
    return client;
  })();

  // 连接失败时清掉单例，下次请求重试
  clientPromise.catch(() => {
    clientPromise = null;
  });

  return clientPromise;
}

export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    p.then(
      v => {
        clearTimeout(timer);
        resolve(v);
      },
      e => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** 调用一个 Tool，并统一超时 */
export async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const client = await getMcpClient();
  const raw = await withTimeout(
    client.callTool({ name, arguments: args }),
    CALL_TIMEOUT_MS,
    `MCP ${name}`,
  );
  return raw;
}

/* ═══════════════ 从「说明文字 + JSON」里把 JSON 抠出来 ═══════════════ */

/** 从 start（必须是 { 或 [）开始找配对的结束位置，跳过字符串内的括号与转义 */
function matchBracket(text: string, start: number): number {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** 解析结果的顶层得「像一个 API 响应」，避免把内层的单个门店对象当成整体 */
function looksLikeEnvelope(v: unknown): boolean {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return 'success' in o || 'code' in o || 'data' in o;
}

/**
 * 把一段 tool 返回的 text 解析成对象。
 *
 * ⚠️ 这是本项目最隐蔽的一个坑，也是「界面永远显示演示数据」的根因。
 * MCP Server 会把**给人看的说明**和 JSON 拼在同一段 text 里一起返回：
 *
 * ```text
 * 每个门店的基本信息按单行展示：
 * - **门店名称**: data[].storeName
 * ...
 * {"success":true,"code":200,"message":"请求成功","data":[...]}
 * ```
 * 有的工具还会在 JSON **后面**再补一段 `## 展示结果时，storeCode 必须完整展示，`。
 *
 * 所以 `JSON.parse(text)` 必然抛错。上一版 catch 之后直接 `return text`，
 * 于是 `unwrapEnvelope` / `flattenMeals` / `toBurgerRecipe` 全部收到一个 string，
 * 每个字段访问都静默返回 undefined —— 站点一路降级到内置快照，
 * 而控制台连一条 warning 都没有。
 */
function parseToolText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // ① 纯 JSON
  try {
    return JSON.parse(trimmed);
  } catch {
    /* 继续 */
  }

  // ② 锚定 `{"success"` —— MCP 所有工具的标准外壳，实测最可靠
  const anchor = trimmed.lastIndexOf('{"success"');
  if (anchor >= 0) {
    const end = matchBracket(trimmed, anchor);
    if (end > anchor) {
      try {
        return JSON.parse(trimmed.slice(anchor, end + 1));
      } catch {
        /* 继续 */
      }
    }
  }

  // ③ 兜底：从后往前试括号，最多 50 次（第 ② 步已覆盖绝大多数情况，
  //    不设上限会在几万字符的菜单文本上退化成 O(n²)）
  let tries = 0;
  for (let i = trimmed.length - 1; i >= 0 && tries < 50; i--) {
    const ch = trimmed[i];
    if (ch !== '{' && ch !== '[') continue;
    tries++;
    const end = matchBracket(trimmed, i);
    if (end < 0) continue;
    try {
      const v = JSON.parse(trimmed.slice(i, end + 1));
      if (Array.isArray(v) ? v.length > 0 : looksLikeEnvelope(v)) return v;
    } catch {
      /* 继续往前 */
    }
  }

  // ④ 真的没有 JSON（纯文本工具）
  return trimmed;
}

/**
 * MCP Tool 的返回是 `{ content: [{ type: 'text', text }] }`。
 * 逐个 text part 解析，取第一个能解析出对象的；
 * 都没有则把各段拼起来再试（说明与 JSON 被拆成两个 part 的情况）。
 */
export function unwrapToolResult(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'structuredContent' in raw) {
    const sc = (raw as { structuredContent?: unknown }).structuredContent;
    if (sc && typeof sc === 'object') return sc;
  }

  if (raw && typeof raw === 'object' && 'content' in raw) {
    const content = (raw as { content?: Array<{ type?: string; text?: string }> }).content;
    if (Array.isArray(content)) {
      const texts = content
        .filter(c => c?.type === 'text' && typeof c.text === 'string')
        .map(c => c.text as string);

      for (const t of texts) {
        const v = parseToolText(t);
        if (typeof v !== 'string') return v;
      }

      if (texts.length > 1) {
        const v = parseToolText(texts.join('\n'));
        if (typeof v !== 'string') return v;
      }

      // 纯文本工具：把最后一段（通常是真正的回答）返回给前端
      if (texts.length > 0) return texts[texts.length - 1];

      // 有些工具直接返回结构化 content
      const first = content[0];
      if (first && typeof first === 'object') return first;
    }
  }
  return raw;
}
