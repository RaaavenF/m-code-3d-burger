# MCP 整合说明

本文说明麦麦汉堡实验室 3D DIY 汉堡点单系统**实际使用**的麦当劳 MCP Server、具体 Tool、调用流程、数据映射与业务价值。

---

## 1. 接入的 MCP Server

| 项 | 值 |
|---|---|
| Server 名称 | `mcd-mcp`（麦当劳中国 MCP Server） |
| Endpoint | `https://mcp.mcd.cn` |
| 传输协议 | `streamablehttp` |
| 鉴权方式 | HTTP Header `Authorization: Bearer <MCD_MCP_TOKEN>` |
| SDK | `@modelcontextprotocol/sdk`（官方 TypeScript SDK） |
| Token 申请 | https://open.mcd.cn/mcp |

### 1.1 实际调用的 Tool 清单

| # | Tool | 调用时机 | 在本系统中的职责 |
|---:|---|---|---|
| 1 | `query-nearby-stores` | 冷启动，一次 | 取 `storeCode`（得来速场景另取 `beCode`），建立门店上下文 |
| 2 | `query-meals` | 进入首页 / 切店 / 切取餐方式 | 拉门店实时菜单，筛汉堡类目，渲染「快速点单」与配方池 |
| 3 | `query-meal-detail` | 点击任一汉堡 / 载入 DIY 配方 | **最核心**：取默认组成 `choice` + 可特调配料 `modification`，映射成 3D 层序列 |
| 4 | `list-nutrition-foods` | 冷启动，一次（缓存） | 拉全量营养表，按产品名匹配，给成品堡打官方热量与宏量营养素 |
| 5 | `calculate-price` | 点「结算」/ 改特调 / 用券 | 按 `productCode` + `modification` 算真实价格（单位：分） |
| 6 | `create-order` | 确认下单 | 传 `takeWayCode` 创建订单，拿支付链接 |
| 7 | `query-store-coupons` | 结算前 | 查当前门店可用券，透传给 `calculate-price` |
| 8 | `now-time-info` | 冷启动 | 判断是否供餐时段，非供餐时段转预约 |

### 1.2 我们**没有**使用的 Tool，以及原因

如实说明，避免夸大：

- `query-party-*` / `query-meal-assistance`（企业团餐）：本系统是单人即时点单场景，不涉及团餐场次。
- `mall-*` / `draw-lottery` / `query-my-account`：积分商城与抽奖与「做汉堡」的核心体验无关，不做功能堆砌。
- `available-coupons` / `auto-bind-coupons`：领券动作不替用户做，只在结算时查询已有可用券，避免「帮用户下单前先替他领一堆券」的越权感。

### 1.3 连接约束（来自官方接入说明）

| 项 | 值 | 对本系统的影响 |
|---|---|---|
| MCP 协议版本 | 仅支持 `2025-06-18` 及之前 | SDK 版本不能盲目升到最新，需锁 `@modelcontextprotocol/sdk` 主版本 |
| 限流 | 600 次 / 分钟 / Token | 详情并发限制为 4，菜单与营养表各缓存 5 分钟 |
| 鉴权失败 | `401` | 前端展示「Token 未配置/已失效」，不重试 |
| 触发限流 | `429` | 路由层透传 429，前端据此退避后再试一次 |

---

## 2. 三个必须澄清的接口事实

这一节是本项目和其他参赛项目最容易拉开差距的地方 —— **不要照抄想象中的接口**。

### 2.1 没有 `get_menu` / `get_ingredients` / `calculate_nutrition`，但**有** `list-nutrition-foods`

真实的工具名是 `query-meals` / `query-meal-detail` / `list-nutrition-foods` / `calculate-price`。其中：

- **没有独立的「配料表」工具**。配料（麦香鸡酱、吉士、生菜、酸黄瓜、洋葱粒、番茄片、培根…）只能从 `query-meal-detail` 返回的 `modification`（可特调项）里解析出来。这也正是麦当劳 App 里那个「餐品定制（多选）」页面的数据来源。
- **营养是有的**，但接口叫 `list-nutrition-foods`，**无入参**，一次返回全量餐品（实测 160 条）：
  ```
  {productName, nutritionDescription, energyKj, energyKcal,
   protein, fat, carbohydrate, sodium, calcium}
  ```
  它返回的 `data` 是一段类表格字符串（`[160]{...}:\n 猪柳麦满分,null,1288,308,16,16,24,781,213\n ...`），需要自己解析。解析器在 `src/lib/nutrition.ts`。

> 这一条值得单独强调：本项目的第一版曾按「接口名推测」断言 MCP 不提供营养数据，改用本地估算表；读到官方接入说明后才发现是真的有。**凡是没读官方文档就下的结论，都要回来改。**

补充一个同样容易搞错的结构事实：**单品和套餐的返回结构不一样。**

| SKU 类型 | `rounds` | 特调在哪 |
|---|---|---|
| 单品（麦辣鸡腿汉堡 `1440`） | `[]` 空数组 | **顶层** `modification.items[].values[]` |
| 套餐（麦辣鸡腿汉堡三件套 `9900005456`） | 有值 | `rounds[].choices[].modification` |

按套餐的结构去解析单品，`modification` 永远是空的 —— 你会得到「面包 + 肉排 + 面包」这种
三层「汉堡」，酱和生菜全丢，而**接口不会报任何错**。


### 2.2 所有查询都是门店维度的

`query-meals` / `query-meal-detail` / `calculate-price` / `create-order` / `query-store-coupons` 全部强依赖 `storeCode`，并且要根据取餐方式联动 `orderType` 与 `beCode`：

| 取餐方式 | `beType` | `orderType` | `beCode` |
|---|---:|---:|---|
| 到店自取 | 1 | 1 | **不传**（传了会报错） |
| 得来速 DT | 5 | 1 | 必传，来自 `query-nearby-stores` |
| 麦乐送 | 2 | 2 | 必传，来自 `delivery-query-stores` |
| 企业团餐 | 6 | 2 | 必传 |

所以「先要门店，才有菜单」——这是整个调用链的第一块多米诺骨牌，冷启动顺序不能反。

### 2.3 `query-nearby-stores` 不是无参调用

它的真实签名是 `{ beType, searchType, city?, keyword? }`，**两个必填**：

| 参数 | 取值 | 说明 |
|---|---|---|
| `beType` | `1` 到店自提 / `5` 得来速 | 必填 |
| `searchType` | `1` 查收藏餐厅 / `2` 按位置搜索 | 必填 |
| `city` / `keyword` | 城市名 / 关键词 | 仅 `searchType=2` 时必填 |

所以冷启动要两级兜底：先试 `searchType=1`（用户收藏过的店，不用城市），无结果再用 `searchType=2` + `NEXT_PUBLIC_MCD_CITY` / `NEXT_PUBLIC_MCD_KEYWORD`。实现见 `MCPProvider.tsx` 的 `resolveStores()`。

---

## 3. 调用流程

### 3.1 冷启动：建立门店上下文

```text
浏览器
  │ 1. 门店：先试收藏餐厅，失败再按城市搜索
  ▼
/api/mcp  ──tool: query-nearby-stores { beType:1, searchType:1 }──▶  mcp.mcd.cn
  ◀── 收藏门店列表
  │    （空 → 重试 searchType:2 + city + keyword）
  ◀── storeCode / storeName / beCode（得来速）
  │ 2. 并发：query-meals + list-nutrition-foods
  ▼
/api/mcp  ──tool: query-meals { storeCode, orderType:1, beType:1 }──▶  mcp.mcd.cn
  ◀── 菜单树（含 productCode、名称、价格、类目）
/api/mcp  ──tool: list-nutrition-foods {}──▶  mcp.mcd.cn
  ◀── 160 条营养表格字符串 → 解析成 NutritionFacts[]
  │ 3. 前端筛出汉堡类目 → 渲染「快速点单」横滑条
  │ 4. 逐个 query-meal-detail（并发 4）→ 映射成 BurgerRecipe
  ▼
本地层序列（bun_bottom … bun_top）+ 官方热量
```

`query-meals` 的返回体在服务端被规整成 `MealLite[]`（只保留 `productCode / name / price / imageUrl / categoryName`），避免把整棵菜单树塞进前端 state。

### 3.2 核心：从餐品详情解析出「可堆叠的配方」

这是本系统最关键的一段。用户点击「麦辣鸡腿汉堡」时：

```text
点击麦辣鸡腿汉堡 (productCode = XXXX)
  │
  ▼
/api/mcp ──tool: query-meal-detail { storeCode, orderType:1, beType:1, code: XXXX }──▶
  ◀── {
        "code": "1440",
        "name": "麦辣鸡腿汉堡",
        "rounds": [],                       // ← 单品恒为空数组
        "supportModify": true,
        "modification": {                   // ← 特调在**顶层**，且是「组 → 值」两层
          "items": [{
            "maxValues": 2, "minValues": 0,
            "values": [
              { "code":"100136", "name":"麦香鸡酱", "price":0,
                "selectedQuantity":1, "selectedKey":"0-1", "unselectedKey":"0-0" },
              { "code":"120512", "name":"切块生菜", "price":0,
                "selectedQuantity":1, "selectedKey":"0-1", "unselectedKey":"0-0" }
            ]
          }]
        }
      }
  │
  ▼
mappers.ts: toBurgerRecipe(detail)
  │  ① 面包层：无条件补 bun_bottom + bun_top
  │  ② 肉排层：按产品名关键词匹配（麦辣鸡腿→patty_spicy / 板烧→patty_grilled / 双层→×2 …）
  │  ③ 配料层：modification.items[].values[].name 查同义词表 → 食材 ID，
  │             selectedQuantity > 0 视为「默认勾上」，按 cat 排序（肉→芝士→蔬菜→酱）
  ▼
BurgerRecipe { id, name, productCode, layers: string[], modification: [...] }
```

**为什么必须走 `query-meal-detail` 而不是 `query-meals`**：`query-meals` 只给「汉堡」这个整体，不给组成；只有 `query-meal-detail` 才带 `choice` / `modification`，也就是 App 里那排圆形配料图标背后的数据。

### 3.3 DIY 完成 → 匹配 → 结算

```text
用户点「完成」
  │
  ▼
match.ts: 用户层序列 vs 全部 BurgerRecipe.layers
  │
  ├─ 全等 ──────▶ 「恭喜你发明了麦辣鸡腿堡！」 → 直接锁定 productCode
  ├─ 多重集相等 ─▶ 「配料齐了，摆盘不同」 → 仍锁定该 productCode
  ├─ 编辑距离 ≤ 2 ▶ 「你的专属汉堡，只差一样：缺 酸黄瓜」
  └─ 都不匹配 ──▶ 「你的专属汉堡」→ 用户命名 → 标记为「菜单外」
  │
  ▼
如果是官方 SKU → 组装 calculate-price 入参：
   {
     storeCode, orderType: 1, beType: 1,
     items: [{
       productCode,
       quantity: 1,
       modification: { values: [
         // 选中的项：key = selectedKey
         { code: "芝士code",  key: <selectedKey>,  quantity: 0 },  // 用户没要 → 减掉
         { code: "酸黄瓜code", key: <selectedKey>, quantity: 1 }   // 用户加了
         // 未选中的项且 unselectedKey 非空：key = unselectedKey，也必须传
       ]}
     }]
   }
  │
  ▼
calculate-price 返回 totalPrice（分）+ takeWayList[]
  │  前端 ÷100 展示；用户选 takeWayCode
  ▼
create-order { ...同上, takeWayCode, items } → 返回支付链接
```

> ⚠️ `modification.values[].key` 的传参规则是这块最容易踩的坑：**选中项用 `selectedKey`，未选中项用 `unselectedKey` 且必须传**。少传会让价格算错或下单失败。

### 3.4 结算时序图

```text
用户  ──「结算」──▶ 前端
前端  ──calculate-price──▶ /api/mcp ──▶ MCP
      ◀── totalPrice(分) / takeWayList ──
用户  ──选「到店自取」──▶ 前端
前端  ──create-order { takeWayCode, items }──▶ /api/mcp ──▶ MCP
      ◀── payUrl / orderId ──
前端  ──跳转支付链接──▶ 麦当劳支付页
```

---

## 4. 配料名 → 食材 ID 映射表

`query-meal-detail` 的配料是中文名字符串，必须落到本系统的食材 ID 上才能建 3D 模型。映射表在 `src/lib/mcp/mappers.ts`，支持同义词与模糊包含匹配（`切块生菜` ⊃ `生菜`）。

| MCP 返回的配料名 | 食材 ID | 分类 | 层厚 | 单价(元) | 热量(kcal, 估算) | 可重复 |
|---|---|---|---:|---:|---:|:---:|
| 麦香鸡酱 / 麦香鱼酱 | `sauce_mayo` | 酱料 | 0.10 | 1.0 | 45 | ✓ |
| 辣椒黄油风味酱 | `sauce_spicy` | 酱料 | 0.10 | 1.0 | 50 | ✓ |
| 烤味酱 | `sauce_bbq` | 酱料 | 0.10 | 1.0 | 55 | ✓ |
| 番茄酱 | `sauce_ketchup` | 酱料 | 0.10 | 0.8 | 30 | ✓ |
| 芥末酱 | `sauce_mustard` | 酱料 | 0.10 | 0.8 | 35 | ✓ |
| 芥末沙拉酱 | `sauce_mustard_salad` | 酱料 | 0.10 | 1.0 | 52 | ✓ |
| 巨无霸酱 | `sauce_big` | 酱料 | 0.10 | 1.0 | 50 | ✓ |
| 吉士 / 芝士 | `cheese` | 芝士 | 0.10 | 2.5 | 60 | ✓ |
| 生菜 / 切块生菜 | `lettuce` | 蔬菜 | 0.15 | 1.0 | 7 | ✓ |
| 番茄片 | `tomato` | 蔬菜 | 0.13 | 1.5 | 10 | ✓ |
| 洋葱粒 | `onion` | 蔬菜 | 0.10 | 1.0 | 12 | ✓ |
| 酸黄瓜 | `pickle` | 蔬菜 | 0.09 | 1.0 | 8 | ✓ |
| 培根 | `bacon` | 配菜 | 0.16 | 4.0 | 90 | ✓ |
| 薯饼 | `hashbrown` | 配菜 | 0.21 | 3.0 | 140 | ✓ |

肉排不来自 `modification`，来自**产品名关键词**：

| 产品名关键词 | 食材 ID | 层厚 | 热量(估算) |
|---|---|---:|---:|
| 麦辣鸡腿 / 麦辣鸡 | `patty_spicy` | 0.32 | 230 |
| 板烧 | `patty_grilled` | 0.21 | 180 |
| 脆鸡 | `patty_crispy` | 0.30 | 210 |
| 鳕鱼 | `patty_fish` | 0.22 | 150 |
| 巨无霸 / 牛 / 双层牛 | `patty_beef` | 0.22 | 190 |
| 双层 / 三层（前缀） | 对应肉排 ×2 / ×3 | — | ×2 / ×3 |

> 映射表是**可扩展配置**，不是硬编码逻辑。新增食材只需在 `INGREDIENTS` 加一条、在 `ALIASES` 加一行同义词。

---

## 5. 热量从哪来

热量来自 `list-nutrition-foods`，是**官方值**，不是估算。三层取值：

| 优先级 | 来源 | UI 标注 |
|---:|---|---|
| 1 | `query-meal-detail` 返回体若自带营养字段，直接采用 | 官方值 |
| 2 | `list-nutrition-foods` 全量表按产品名匹配（主路径） | 官方值 |
| 3 | 匹配不到（菜单外自创堡 / 表里没有的新品）→ 各层热量加总 | **估算** + 浮层说明 |

实际抓到的官方值（`list-nutrition-foods`，2026-10，单位 kcal）：

| 产品 | kcal | 蛋白 | 脂肪 | 碳水 | 钠(mg) |
|---|---:|---:|---:|---:|---:|
| 麦辣鸡腿汉堡 | 485 | 24 | 24 | 42 | 1208 |
| 板烧鸡腿堡 | 391 | 23 | 17 | 35 | 1041 |
| 巨无霸 | 513 | 27 | 26 | 42 | 961 |
| 培根蔬萃双层牛堡 | 442 | 24 | 23 | 34 | 728 |
| 不素之霸双层牛堡 | 493 | 28 | 27 | 34 | 1012 |
| 双层深海鳕鱼堡 | 485 | 28 | 21 | 46 | 917 |
| 麦香鸡 | 369 | 15 | 17 | 39 | 731 |
| 吉士汉堡包 | 294 | 16 | 12 | 30 | 673 |

名称匹配用的是「精确 → 互相包含 → 取长度差最小」三级策略（`src/lib/nutrition.ts` 的 `lookupNutrition`）。为什么不能简单 `includes`：菜单叫「吉士汉堡」，表里是「吉士汉堡包」，而「双层吉士汉堡」也包含「吉士汉堡」这个子串 —— 只做包含匹配会把单层堡错配到双层堡，热量差 135 kcal。

第 3 级（估算）在 UI 上有明确的 `估算` 标签，配合 README 的免责声明，兜住活动规则里「不得输出营养专业建议」的要求。

---

## 6. 降级策略

MCP 是外部依赖，必须假设它会挂。`src/lib/mcp/cache.ts` 实现三层：

```text
请求 ──▶ ① 内存缓存（TTL 5min，命中直接返回）
      └─▶ ② MCP 调用（超时 8s，失败重试 1 次，指数退避）
            └─▶ ③ 磁盘快照 .cache/mcd-<storeCode>.json
                  └─▶ ④ 内置冷启动快照 src/lib/mcp/seed.ts（最小可玩集）
```

| 场景 | 系统行为 | 用户看到 |
|---|---|---|
| 网络抖动 | 重试 1 次 | 无感 |
| MCP 持续 5xx | 切磁盘快照（上次成功响应） | 顶部黄条「离线数据 · 12 分钟前」 |
| 从未成功过 | 切内置快照（8 款经典堡 + 14 种食材） | 顶部黄条「演示数据」 |
| 结算时不可用 | **不放行下单**，引导稍后重试 | 明确告知，不伪造成功 |

> 关键原则：**展示可以降级，交易不能降级**。菜单和价格缺失时宁可只当玩具玩，也不能让用户以为下单成功了。

---

## 7. 安全

1. **Token 只在服务端**。前端只能 `POST /api/mcp { tool, args }`，Route Handler 注入 Header。客户端 bundle 内不存在 Token 字符串。
2. **工具白名单**。`/api/mcp` 只接受 6 个白名单工具名，其余一律 403，防止被当成通用 MCP 代理刷接口。
3. **凭证不落库、不进 Git**。`.env.local` 在 `.gitignore` 中；`mcp-config.example.json` 仅含 `${MCD_MCP_TOKEN}` 占位符。
4. **不代持用户资产**。不读取、不存储用户手机号、地址、券；所有涉及账户的操作都由麦当劳官方链路完成。

---

## 8. 业务价值

### 8.1 对用户

| 痛点 | 本系统的解法 |
|---|---|
| 定制页是勾选框，看不到成品 | 3D 实时堆叠，所见即所得 |
| 不知道加一片芝士多多少钱、多多少热量 | 每层增量即时显示，超阈值可视化告警 |
| 想「发明」一个堡，但没有渠道表达 | DIY + 命名 + 一键生成分享卡片 |
| 不知道自己的 DIY 其实早就是官方款 | 配方匹配，命中即揭示「你发明了巨无霸」 |

### 8.2 对麦当劳

1. **提高定制转化**。定制是客单价提升的主要抓手，但勾选式的转化天花板很低 —— 用户不敢随便加，因为不知道加出来长什么样。看得见的堆叠能显著降低决策成本。
2. **把「配料」变成可售单元**。用户第一次直观感知到「加芝士 2.5 元」这个交易，而不是一个抽象复选框。
3. **产生 UGC 素材**。「我的专属汉堡」命名 + 分享卡片，是低成本的自传播。
4. **探索 MCP 的图形化边界**。MCP 通常被用来做对话式查询，本项目证明它同样能驱动一个 3D 前端 —— 对平台方是有价值的用例参考。
5. **程序员节人群触达**。1024 的语境让「技术感」本身成为购买理由。

---

## 9. 实测记录

> 下表是 **2026-10-23 23:55 — 2026-10-24 00:20** 用真实 Token 跑出来的结果，
> 不是照文档推测。门店 `1950564`（麦当劳北京建外SOHO A座餐厅，07:00–22:00）与
> 前门西街餐厅，传输 `streamablehttp`，SDK `@modelcontextprotocol/sdk@1.20`。

| 项 | 结果 |
|---|---|
| `list-nutrition-foods` 连通性 | ✅ 一次返回 **160 条**餐品营养数据 |
| 字段完整性 | ✅ `productName / nutritionDescription / energyKj / energyKcal / protein / fat / carbohydrate / sodium / calcium` |
| 数据形态 | ⚠️ `data` 是**类表格字符串**（`[160]{productName,...}:\n 猪柳麦满分,null,1288,308,...`），不是 JSON 数组，必须自己解析 |
| 热量匹配准确度 | ✅ 麦辣鸡腿汉堡 485 / 巨无霸 513 / 麦香鸡 369 / 板烧鸡腿堡 391 / 双层深海鳕鱼堡 485 / 吉士汉堡包 294，与接口逐字段一致 |
| `query-nearby-stores` | ✅ `searchType=1` 返回 `600050 收藏餐厅列表为空`；`searchType=2` + 城市关键词返回 5 家门店，含 `storeCode / businessStatus / businessStartTime / businessEndTime / reservationTimeOptions` |
| `query-meals` 规模 | ✅ 13 个类目、91 个 SKU；剔除套餐后 **12 款**汉堡单品可做 3D 堆叠 |
| `query-meals` 打烊行为 | ⚠️ **门店打烊时直接返回 `600057 门店可能已关闭或不在营业时间`**，必须带 `reservationDate` 才拿得到菜单 |
| `query-meal-detail` 是否带 `modification` | ✅ 带，但在**顶层** `modification.items[].values[]`：麦辣鸡腿汉堡 = 麦香鸡酱 + 切块生菜（2 项），`rounds` 为空 |
| `calculate-price` 金额一致性 | ✅ 麦辣鸡腿汉堡 2250 分（¥22.50），与 `query-meals` 的 `currentPrice: "22.5"` 一致；圆筒冰淇淋 500 分（¥5.00） |
| `calculate-price` 取餐方式 | ✅ 返回 `takeWayList` = `eat-in`（堂食）/ `take-in-store`（外带） |
| `create-order` 到支付链接 | ⏸ **未执行** —— 会真实产生订单，开发期不做 |
| 429 并发阈值 | ⏸ 未压测（官方口径 600 次/分钟；本项目详情并发限制为 4） |
| 端到端 | ✅ 载入「麦辣鸡腿汉堡」→ 5 层（面包/麦香鸡酱/生菜/麦辣鸡腿排/面包）→ 封顶 → 命中 exact，热量显示官方 485 kcal、钠 1208 mg、¥26 门店价 |

### 9.1 实测推翻的四个假设

这四条都不会报错，只会让「界面一直显示演示数据」。全部已修，记在这里避免复现。

| # | 假设 | 实际 | 后果 |
|---|---|---|---|
| 1 | `content[0].text` 就是 JSON | 是**说明文字 + JSON** 拼在一起（有时 JSON 后面还有一段） | `JSON.parse` 抛错 → catch 里 `return text` → 全链路拿到 string，字段访问全 undefined |
| 2 | 菜单是 `[{code, name, price}]` 扁平数组 | `categories[]` 只给 `code`，`meals{}` 字典才给 `name` / `currentPrice`，**两者不在一处** | 递归找不到「同时有 code 和 name」的节点 → 返回 `[]` → 降级 |
| 3 | `storeCode ?? code` 能兼容两种字段名 | 外壳对象里也有 `code`（成功 200，失败 600050/600057，**同样 6 位**） | 把错误码当门店编号，后续查询全失败 |
| 4 | 业务失败会走 HTTP 4xx/5xx | 一律 **HTTP 200 + `{success:false, code, message}`** | 失败响应被当成数据，还被写进缓存 5 分钟 |

另外还有两个自己写的 bug，一并记下：
`cacheKey` 只挑了 6 个参数、漏掉 `city` / `keyword`（不同关键词命中同一缓存槽）；
`toYuan` 用「≥1000 视为分」猜单位（圆筒冰淇淋 500 分被当成 500 元）。
**单位必须由来源决定，缓存键必须覆盖全部入参。**

