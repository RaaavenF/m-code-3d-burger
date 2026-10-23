# 麦麦汉堡实验室 设计方案

> 面向实现的完整设计文档。README 讲「是什么」，这份讲「怎么建」。

---

## 0. 设计基调

| Token | 值 | 用途 |
|---|---|---|
| `--color-cream` | `#FFFAF3` | 页面底色（叠三层渐变后的中间调） |
| `--color-cream-2` | `#FFF4E8` | 卡片内的浅底、Tab 未选中态 |
| `--color-paper` | `#FFFFFF` | 面板白卡 |
| `--color-ink` | `#251C15` | 文字主色 |
| `--color-ink-2` | `#7C6A59` | 次级文字、说明 |
| `--color-ink-3` | `#A89684` | 三级文字、占位 |
| `--color-line` | `#F0E0CB` | 分割线、卡片描边 |
| `--color-yellow` | `#FFC72C` | 品牌金。徽章、购物车、选中态（对齐麦当劳规范） |
| `--color-yellow-deep` | `#EAA800` | 金色文字的加深档（白底上够可读） |
| `--color-red` | `#DA291C` | 品牌红。顶栏、主 CTA、价格牌、命中卡（对齐麦当劳规范） |
| `--color-green` | `#3FA96A` | 门店在线、正向状态 |
| `--shadow-card` / `--shadow-lift` | 见 `globals.css` | 白卡静态 / 抬起两档投影 |
| `--radius-card` | `24px` | 面板级圆角 |

**为什么是「暖奶油底 + 白卡」，而不是纯白或深色**
食物的颜色本身极饱和（番茄红、生菜绿、芝士橙），背景只要也带颜色就会打架。
深色能衬托 3D，但会让整个页面变成「商品详情页」，和「实验室」的轻松感反了。
所以底色用暖奶油（`#FFFAF3` 起，叠两层径向光晕 + 一层 168° 线性渐变到 `#FFF1DE`），
内容全部装进白色半透明卡片（`rgba(255,255,255,.9)` + `backdrop-blur(10px)`），
让「白」只出现在需要读的地方，而不是整屏铺开。

**品牌色为什么必须换成官方值**
第一版用的是自调的「芝士黄 `#FFC12F` + 番茄红 `#E23B26`」——
两个都偏橙，放进暖奶油底里互相污染，整页读起来像烘焙店，不像快餐品牌。
第二版把黄红都换成麦当劳规范的 `#FFC72C` / `#DA291C`，并且**把红提到结构层**：

| 用法 | 位置 | 理由 |
|---|---|---|
| 红底顶栏 | Header 整条 | 品牌的第一眼锚点，60px 的色块就够定调 |
| 红实心主 CTA | 「完成并封顶」「加入购物车」 | 对齐官方 App 的「立即下单」，不再用黄渐变当主按钮 |
| 红底价格牌 | 配方面板右上 | 价格是决策点，用品牌红比黑色更有归属感 |
| 红底命中卡 | 「恭喜你发明了…」 | 全场唯一的高光时刻，右下压一枚 45% 的金拱门做水印 |
| 黄底徽章 | `1024`、购物车 | 红黄对撞是麦当劳最典型的双色关系，黄只做小面积的点 |

**金拱门怎么画（第二版：直接用官方轮廓）**

第一版是手搓的：`stroke` 描一条粗 M 会在中心尖处翻车（两条曲线折返夹角十几度，
miter 伸出几百像素后被 `miter-limit` 截成斜切）；于是改用两个 subpath +
`fill-rule="evenodd"` 求差。形状能认出是 M，但三处比例全错：

| 位置 | 手搓版 | 官方 |
|---|---|---|
| 腿宽 / 总宽 | 17% | 约 25%（更粗、更有分量） |
| 中心谷底 | 落在 63% 高度，且是尖的 | 34% 高度，是一段**圆底**的谷 |
| 内轮廓在中心 | 与 arc 相交，evenodd 求差时留下一道发白的缝 | 单条闭合路径，无缝隙 |

所以第二版直接用 simple-icons 收录的官方商标几何（CC0，`viewBox 0 0 24 24`，
字形实际占 x 0–24 / y 1.5–22.5）。一条闭合路径就够了，不需要 evenodd。
`src/app/icon.svg` 用同一份路径做 favicon：红底圆角方块 + 拱占宽 72%
（左右各留 14%，与官方 App Icon 的留白一致）。

- **字体**：中文用系统栈 `-apple-system, "PingFang SC", "Microsoft YaHei"`，数字与代码用 `ui-monospace, "JetBrains Mono", Menlo`。不引入 Web Font —— 首屏 3D 已经够重了。
- **间距**：8px 基线。`4 / 8 / 12 / 16 / 24 / 32 / 48`。
- **圆角**：面板 24，按钮 14，食材缩略图 16，食材图标正圆。
- **对比度**：正文 `#251C15` on `#FFF7EC` ≈ 14.4:1。金黄底上的文字一律用 `#251C15` 而非白色（白字 on `#FFC12F` 只有 1.9:1，不合格）。
- **动效**：只动 `transform` 与 `opacity`。UI 微交互 200–300ms，3D 落定 420–620ms。
- **曝光**：3D 场景 `toneMappingExposure = 1.0`、主光 1.95。之前给到 1.12，面包那种大面积浅色会直接过曝成白纸 —— 曝光要和「最亮的那块食材」对齐，不是和背景对齐。

---

## 1. 页面信息架构与交互说明

### 1.1 桌面端（≥1200px）：三栏

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ [M] 麦麦汉堡实验室  i’m lovin’ it   [门店 ▾]  [1024 ✦]  [🛒 2]       │ 60px
├──────────────┬───────────────────────────────────────┬───────────────────┤
│  食材库       │            3D 舞台                     │   配方面板          │
│  320px       │            flex:1                      │   360px            │
│              │                                        │                    │
│ ┌──────────┐ │        ╭─────────╮                     │  当前配方           │
│ │面包 🍞  │ │       ╱  上层面包  ╲                    │  ┌──────────────┐  │
│ └──────────┘ │      │  生菜        │                   │  │ 下层面包片  2元│  │
│ ┌────┬────┐ │      │  麦辣鸡腿排  │                   │  │ 麦辣鸡腿排 7.5│  │
│ │肉排│蔬菜│ │      │  下层面包    │                   │  │ 生菜       1 │  │
│ └────┴────┘ │       ╲___________╱                    │  │ 麦香鸡酱   1 │  │
│              │                                        │  │ 上层面包   2 │  │
│ ┌────┐┌────┐│      ⟲ 拖拽旋转  ⊕ 滚轮缩放            │  └──────────────┘  │
│ │芝士│酱料││                                        │  4 层 · ¥11.5      │
│ └────┘└────┘│    ┌──────────────────────────┐        │  🔥 485 kcal 官方值│
│              │    │ + 麦香鸡酱   + 生菜  …   │        │                    │
│ ┌────┐      │    └──────────────────────────┘        │  ┌──────────────┐  │
│ │配菜│      │      (底部快捷条：最近用过的 4 种)        │  │  ↶ 撤销  ⌫ 清空│  │
│ └────┘      │                                        │  ├──────────────┤  │
│              │                                        │  │   ✓ 完成并命名 │  │
│              │                                        │  └──────────────┘  │
└──────────────┴───────────────────────────────────────┴───────────────────┘
```

三栏职责必须清晰，不能混：

- **左栏 = 输入**。只做「加什么」。分类 Tab + 食材卡片网格（`repeat(auto-fill, minmax(92px,1fr))`）。卡片含：3D 缩略图（同款几何体、正交相机、40px）、中文名、价格增量、右上角 `+`。
- **中栏 = 画布**。只做「长什么样」。除了 OrbitControls 的提示文字和一条最近用料快捷条，不放任何业务按钮。
- **右栏 = 状态与决策**。只做「现在多少钱 / 多少卡 / 下一步做什么」。

> **设计取舍**：没有把「完成」按钮放在舞台正中浮层。用户在 3D 舞台上的手是「拖拽相机」的手，中途打断会让操作心智混乱。决策按钮固定在右栏底部，位置恒定。

### 1.2 移动端（<768px）：单栏 + 底部抽屉

```text
┌─────────────────────┐
│ M 麦麦汉堡实验室  🛒 │
├─────────────────────┤
│                     │
│      3D 舞台        │  ← 占视口 52vh，25°–36° 仰角
│    （单指旋转）      │
│                     │
├─────────────────────┤
│ 4层 ¥11.5  352kcal  │  ← 吸顶横条（滚动时固定在舞台下沿）
│ [撤销][清空]   [完成]│
├─────────────────────┤
│ 面包 肉排 蔬菜 芝士… │  ← 分类 Tab 横滑
│ ○  ○  ○  ○  ○  ○   │  ← 食材横滑卡片
└─────────────────────┘
     ↑ 点「完成」→ 底部 Sheet 上滑：结果 / 命名 / 加购
```

移动端关键约束：

1. **单指旋转、双指缩放**。不能只做双指旋转 —— 那样 90% 的用户第一次碰屏幕会发现转不动。
2. **触控目标 ≥ 44×44**。食材卡片的 `+` 实际可点区域是整个卡片。
3. **`100dvh` 而非 `100vh`**，避免 iOS Safari 地址栏导致的跳动。
4. 舞台的俯仰锁在 **25°–36°** 仰角（`[0.95, 1.13]` 自天顶算），只允许 11° 的微调。抬得更高，镜头几乎在往面包顶上俯视，圆顶占掉画面一半、夹层被压成一条缝；压得更低，最底层会被前面的料挡住。

### 1.3 交互状态机

```text
                    ┌──────────────────────────────────┐
                    │                                  │
  [idle] ──+食材──▶ [stacking] ──完成──▶ [matching]  │
    ▲                 │  │                  │         │
    │              撤销│  │清空              ├─命中──▶ [win] ──加购──▶ [cart]
    └─────────────────┘  └──────[idle]◀────┘         │
                                 ├─未命中─▶ [custom] ──命名──▶ [cart]
                                 └─差一点─▶ [near]  ──补料──▶ [stacking]
```

- `idle`：只有下层面包。右栏显示空态 `No layers yet. 先放一片面包，就像先写一个 main()`。
- `stacking`：每加一层播放落体动画；上层面包**不出现**，在 `stacking` 状态下它是「幽灵面包」（30% 透明度虚线轮廓），暗示「还没封顶」。
- `matching`：满 3 层后「完成」按钮才可用；点击后舞台快速环绕 90°（`800ms`），给匹配一个仪式感。
- `win`：全屏金光 → 成就卡从下弹入，含官方堡名、价格、热量、「加入购物车」。
- `near`：不弹窗，右栏出黄条「只差一样：缺 酸黄瓜 · [补上]」。
- `custom`：命名输入框，默认值 `0x` + `Date.now().toString(16).slice(-4)`。

### 1.3.1 顶栏数据源状态：四档，不是两档

「数据是真的还是假的」是这类 MCP 项目最容易糊弄过去的地方，所以顶栏状态做成四档：

| 状态 | 触发条件 | 点色 | 为什么必须单独一档 |
|---|---|---|---|
| 连接中 | 冷启动 | 品牌金 | 要跑门店 + 菜单 + 营养 + N 个详情，2–4 秒，不能白屏 |
| 实时数据 | 一切正常 | 绿 | 基线 |
| **预约菜单** | 门店已打烊，用 `reservationDate` 取到菜单 | 浅金 | **数据是真的，但视角是下一个营业时段** —— 不标出来等于谎报「实时」 |
| 部分降级 / 演示数据 | 营养表或菜单回落本地快照 | 品牌金 | 让用户知道哪些数字是估算 |

第三档是真实接口逼出来的：MCP 在非营业时段对 `query-meals` / `query-meal-detail` 一律返回
`600057 门店可能已关闭或不在营业时间`，只有带 `reservationDate` 才能取菜单。
既然拿到了真实菜单，就不该退回「演示数据」；但也不能写成「实时」。
设计上的解法是**新增一档状态**，而不是在两者之间二选一 —— 状态机的表达能力要跟上数据的真实复杂度。

### 1.4 快速点单入口

首页顶部一条横向热销榜（`query-meals` 前 8 条汉堡），点击 → 平滑过渡：

1. 当前场景（若有）淡出 `300ms`
2. 相机推到 `dist = 9` 的远景
3. 8 层食材以 `stagger 60ms` 依次从上方落下（复刻「自动组装」）
4. 上层面包最后扣下 → 相机回到 `dist = 5`

这条动画是「快速点单」的全部意义 —— 用户不是在看一张图，是在看自己的汉堡被"造"出来。

---

## 2. MCP 接入方案设计

> 完整版见 [MCP_INTEGRATION.md](./MCP_INTEGRATION.md)。此处只讲工程结构。

### 2.1 为什么必须有服务端

Token 是`Bearer`形式，任何写进前端代码的 Token 都是公开的。Next.js 的 Route Handler 只做三件事：注入 Header、白名单校验、把 `tool + args` 转发出去。

```text
.env.local
  MCD_MCP_URL=https://mcp.mcd.cn
  MCD_MCP_TOKEN=xxxxx
```

`.env.example` 会进 Git，`.env.local` 不会。

### 2.2 为什么不直接用 `useEffect` 在客户端连 MCP

MCP SDK 的 `StreamableHTTPClientTransport` 在浏览器里能跑，但：

1. Token 会暴露；
2. 每个打开的 tab 都会新建一条 SSE 长连接，服务器侧连接数爆炸；
3. 无法做服务端缓存（菜单 5 分钟内基本不变，缓存能砍掉 90% 的调用）。

所以：**客户端一个 POST，服务端复用单例 Client**。

### 2.3 工具白名单

```ts
const ALLOWED = new Set([
  'query-nearby-stores', 'query-meals', 'query-meal-detail',
  'list-nutrition-foods', 'calculate-price', 'create-order',
  'query-store-coupons', 'now-time-info',
]);
```

不在白名单 → `403`。避免这个 endpoint 变成「任何人拿我的 Token 调任意麦当劳接口」的后门。

### 2.4 降级

见 MCP_INTEGRATION §6。核心一句话：**展示可以降级，交易不能降级**。

---

## 3. 食材与配方数据结构 (TypeScript)

设计原则：**食材表是静态的（几何、厚度、热量是物理属性），配方是动态的（来自 MCP）**。两者分离，改配方不用碰 3D 代码。

```ts
// src/types/burger.ts

/** 食材分类 —— 决定左侧 Tab 顺序与堆叠排序优先级 */
export type IngredientCategory =
  | 'bread' | 'patty' | 'veg' | 'cheese' | 'sauce' | 'side';

/** 程序化几何形态。若提供 modelPath 则优先加载 GLB */
export type GeometryKind =
  | 'bunBottom' | 'bunTop' | 'pattyBeef' | 'pattyCrispy' | 'pattySpicy'
  | 'pattyGrilled' | 'pattyFish' | 'lettuce' | 'tomato' | 'onion'
  | 'pickle' | 'cheese' | 'sauce' | 'bacon' | 'hashbrown';

export interface Ingredient {
  /** 稳定 ID，同时是 3D 层的 key 前缀 */
  id: string;
  name: string;
  category: IngredientCategory;
  /** 该层净厚度（世界单位，下层面包半径 = 1） */
  thickness: number;
  /** 与下一层的咬合下沉量，避免出现硬缝隙 */
  sink: number;
  /** 单层价格（元），用于本地预估；结算以 MCP 为准 */
  price: number;
  /** 单层热量（kcal，估算） */
  kcal: number;
  /** 是否允许重复叠加（芝士、酱料、酸黄瓜为 true；面包为 false） */
  repeat: boolean;
  /** 主色（用于缩略图、配方列表色块） */
  color: string;
  /** 是否需要 3D 模型（false = 纯 2D 列表项，如配菜） */
  renderable: boolean;
  /** 程序化几何形态 */
  geometry: GeometryKind;
  /** 可选：GLB 路径。提供后覆盖程序化几何 */
  modelPath?: string;
  /** 命名用词根，拼「双层 + 脆鸡 + 堡」时用 */
  nameRoot?: string;
  /** 只能出现在栈顶（上层面包）或栈底（下层面包） */
  slot?: 'bottomOnly' | 'topOnly';
  /** 一句人话描述，用于 hover 浮层 */
  description?: string;
  /** 来自 MCP 的原始特调项 code/key，下单时回填 */
  mcp?: {
    code: string;
    selectedKey?: string;
    unselectedKey?: string;
  };
}

/** 官方配方 —— 由 query-meal-detail 映射而来 */
export interface BurgerRecipe {
  id: string;
  /** MCP productCode，结算唯一凭证 */
  productCode: string;
  name: string;
  /** 从下到上的完整层序列，含上下两片面包 */
  layers: string[];
  /** 官方展示价（元），仅用于列表显示；结算走 calculate-price */
  listPrice: number;
  /** 官方热量（kcal），无官方值时省略 */
  officialKcal?: number;
  description?: string;
  /** 角标文案，如「人气经典」「0 油煎」 */
  badge?: string;
  imageUrl?: string;
  /** 该产品允许的特调项，直接透传给 calculate-price */
  modifications?: McModification[];
  /** 数据来源：决定 UI 是否打「离线」标 */
  source: 'mcp' | 'cache' | 'seed';
}

export interface McModification {
  name: string;
  code: string;
  selectedKey?: string;
  unselectedKey?: string;
  /** 映射到的食材 ID；null 表示本系统无对应模型，仅透传 */
  ingredientId: string | null;
  /** 是否默认选中（isDefault === 1） */
  defaultOn: boolean;
  /** 价格增量（元），来自 MCP */
  priceDelta?: number;
}

/** 栈上的一层实例（同一食材可以出现多次） */
export interface StackLayer {
  /** 实例唯一 ID，不能用 ingredientId —— 双层的两片肉需要区分 */
  uid: string;
  ingredientId: string;
  /** 底部 Y 坐标，由 stack.ts 计算 */
  baseY: number;
  /** 入栈序号，用于错开动画 */
  index: number;
}

/** 整个 DIY 会话 */
export interface DiySession {
  layers: StackLayer[];
  status: 'idle' | 'stacking' | 'matching' | 'win' | 'near' | 'custom';
  /** 匹配结果 */
  match?: MatchResult;
  /** 用户命名（custom 态） */
  customName?: string;
  /** 结算锁定到的官方 SKU */
  lockedProductCode?: string;
}

export type MatchKind = 'exact' | 'sameParts' | 'near' | 'custom';

export interface MatchResult {
  kind: MatchKind;
  recipe?: BurgerRecipe;
  /** 序列编辑距离 */
  distance?: number;
  /** 差在哪：缺什么、多什么（人类可读） */
  diff?: { missing: string[]; extra: string[] };
  /** 结算时是否可映射到官方 SKU */
  orderable: boolean;
}
```

### 3.1 为什么 `uid` 必须独立于 `ingredientId`

双层脆鸡堡 = 同一块脆鸡排出现两次。若用 `ingredientId` 当 React key：

- React 会认为「同一个元素」，第二片不会重新挂载，落体动画不播；
- 撤销时会删错层（`filter` 会把两片一起删掉）。

所以每一层入栈时生成 `uid = ${ingredientId}#${timestamp}#${seq}`，`ingredientId` 只表达「这是什么」。

### 3.2 `thickness` / `sink` 的物理含义

```text
        ┌────────┐  ← 上一层底面
        │        │
   ─────┴────────┴─────  ← 本层顶面 = baseY + thickness
        │  sink  │        ← 实际只用了 thickness - sink
   ─────┴────────┴─────  ← 下一层顶面 = baseY
```

`sink` 让生菜被压进肉排里、酱料渗进面包纹理，视觉上才不「浮」。经验值：面包 0，肉排 0.02，蔬菜 0.03–0.04，酱料 0.03。

---

## 4. 组件拆分树

```text
- App  (app/page.tsx)
  - MCPProvider            // MCP 连接、门店上下文、菜单/配方缓存、降级状态
    - OrderProvider        // 购物车 + DIY 会话（useReducer）
      - Layout
        - Header           // 金拱门 lockup · 门店选择 · 1024 徽章 · 购物车角标（红底）
        - main (CSS Grid 三栏)
          - IngredientPanel         // 左：分类 Tab + 食材卡网格
            - CategoryTabs
            - IngredientCard        // 3D 缩略图 + 名称 + + 按钮
              - IngredientThumb     // 复用同一套 geometry，正交相机渲染
          - CanvasStage             // 中：R3F Canvas
            - ambient / directional / spot 灯光组
            - ContactShadows
            - CameraRig             // useFrame 自适应焦点与距离
            - OrbitControls
            - BurgerStack           // 按 layer.baseY 摆放所有层
              - IngredientLayer     // 单层：落体 + 压扁回弹
                - IngredientMesh    // 按 geometry 分支渲染低模
            - GhostTopBun           // stacking 态的虚线幽灵面包
            - BoardMat              // 托盘/纸垫
          - RecipePanel             // 右：配方列表 / 统计 / 决策
            - LayerList             // 逐层，可点击删除
            - MacroStats            // 层数 · 价格 · 热量（超阈值变色）
            - ActionBar             // 撤销 / 清空 / 完成
            - MatchResultSheet      // 匹配结果（桌面端内联，移动端用 Drawer）
        - QuickOrderRail    // 热销榜横滑（移动端在舞台下方）
        - ResultDrawer      // 移动端底部抽屉
        - Toaster
```

**状态归属**（避免 prop drilling）：

| 状态 | 归属 | 理由 |
|---|---|---|
| MCP Client、门店、菜单、配方池、离线标记 | `MCPProvider` | 全局只读，写入口只有 reload |
| 当前 DIY 层序列、匹配结果、购物车 | `OrderProvider` (useReducer) | 高频写，且需要撤销/重放 |
| 相机状态 | `CameraRig` 内的 ref | 每帧变化，绝不能进 React state |
| 动画进度 | GSAP timeline 实例 | 同上 |

> **踩坑提醒**：绝对不要把 `useFrame` 里算出来的值 `setState`。汉堡叠到 15 层时，60fps 的 setState 会让 React 直接把主线程锁死。所有每帧量走 `ref`。

---

## 5. 核心交互与动画实现思路

### 5.1 下落与回弹

**三层结构**，这样压扁才不会让层陷进下一层：

```text
<group position-y={baseY}>        ← 静态锚点，只随重排变化
  <group ref={animRef}>           ← 被 GSAP 操纵（位移 + 缩放）
    <mesh position-y={thickness/2}>  ← 几何体以底面为原点建模
```

因为几何体在局部坐标中「底面在 y=0」，`animRef.scale.y` 压缩时底面不动，效果就是「砸下去被压扁」而不是「整体缩小」。

时间线四段：

| 段 | 内容 | 时长 | 缓动 |
|---|---|---:|---|
| 落下 | `position.y: 3.2 → 0` | 420ms | `power2.in`（重力加速） |
| 触地压扁 | `scale: (1,1,1) → (1.08, 0.82, 1.08)` | 90ms | `power2.out` |
| 回弹过冲 | `→ (0.97, 1.06, 0.97)` | 140ms | `sine.out` |
| 落定 | `→ (1, 1, 1)` | 220ms | `elastic.out(1, 0.4)` |

叠加时间线错开：连续快速点击时，第 n 层延迟 `n * 40ms` 开始，避免所有层同步砸下变成一坨。

**材质与性能**：

- 所有层共享 `MeshStandardMaterial`（模块级 `Map<color, Material>` 缓存），同色只创建一次。
- 低模分段数：面包 `lathe 28 段`、肉排 `24 段`、蔬菜 `16 段`。15 层汉堡约 1.2 万三角面，集显也能跑 60fps。
- `frameloop="demand"` 不可用（有持续动画），但空闲时 `CameraRig` 停止写值，让 Drei 自动降帧。

### 5.2 相机自适应

诉求：汉堡从 3 层叠到 15 层时，相机要**自动后退 + 抬高焦点**，但**不能覆盖用户手动转过的角度**。

```ts
useFrame(({ camera, controls }, dt) => {
  const h = totalHeight;                        // 由 stack.ts 算出
  const focusY = Math.max(0.55, h * 0.58);      // 视觉重心略高于几何中心
  const dist = clamp(5.9 + h * 0.82, 5.9, 14);  // 越高越远

  // 保留用户方位角，只重算半径与焦点
  const offset = camera.position.clone().sub(controls.target);
  const azimuth = Math.atan2(offset.x, offset.z);
  const polar = clamp(Math.acos(offset.y / offset.length()), 0.95, 1.3);

  const desired = new Vector3(
    Math.sin(azimuth) * Math.sin(polar),
    Math.cos(polar),
    Math.cos(azimuth) * Math.sin(polar),
  ).multiplyScalar(dist).add(new Vector3(0, focusY, 0));

  const k = 1 - Math.exp(-6 * dt);             // 帧率无关的指数平滑
  camera.position.lerp(desired, k);
  controls.target.y += (focusY - controls.target.y) * k;
  controls.update();
});
```

关键点：

1. **`1 - Math.exp(-6 * dt)`** 而不是固定 `0.1`。后者在 30fps 和 120fps 设备上速度差 4 倍。
2. **`polar` 夹在 `[0.95, 1.13]` 弧度**（自天顶算，约 54°–65°），对应 **25°–36° 的观测仰角**。
   这组数字是实测出来的：第一版取 `[0.55, 1.05]`（31°–60°），画面几乎是俯视图，
   6 层汉堡被压成一张圆饼，用户数不清自己加了几层；第三版收到 `[0.85, 1.08]`（28°–41°）
   仍然偏高 —— 镜头在往面包顶上俯视，圆顶占掉画面一半，夹层全被压成一条缝。仰角低于 25° 时
   最底层又会被压成一条线。
3. **`CameraRig` 里的 clamp 必须和 `OrbitControls` 的 `min/maxPolarAngle` 完全一致**。
   两边不一致时每帧会被夹回来一次，画面持续微抽。
4. 只在 `totalHeight` 变化时算一次目标，其余帧只做 lerp —— 避免每帧 `Math.acos` 无意义重复计算。

### 5.3 配方匹配算法

**用户原始需求里的「去重并保留相对顺序」是错的**，必须改：

- 去重 → 双层脆鸡堡（两片脆鸡）和单层麦香鸡（一片脆鸡）会被判成同一个堡。
- 严格按顺序 → 用户先放生菜再放酱，和先放酱再放生菜，明明是同一个汉堡，却匹配失败。

**正确做法：三段式。**

```text
                      用户层序列（含上下包）
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ① 全等判定       ② 多重集判定      ③ 编辑距离
      （顺序+重数）      （重数敏感）      （找最接近）
              │               │               │
          exact          sameParts           near
        「完美复刻」    「配料齐了」      「只差一样」
```

1. **`exact`**：`userIds.join('>') === recipe.layers.join('>')`。只有这一个分支播成就动画。
2. **`sameParts`**：把两层序列各自排序后比较（多重集相等）。重数敏感、顺序无关。命中后仍锁定 `productCode`，只是文案降一级。
3. **`near`**：对每个官方配方算 Levenshtein 距离（插入/删除/替换各计 1）。取最小值，`distance <= 2` 时给出「缺什么 / 多什么」。`distance > 2` → `custom`。

`diff` 的计算不要用编辑距离回溯（代码难读），直接用计数差：

```ts
const a = countMap(userIds), b = countMap(recipe.layers);
missing = keys(b).filter(k => (a[k] ?? 0) < b[k]).map(ingName);
extra   = keys(a).filter(k => (a[k] ?? 0) > (b[k] ?? 0)).map(ingName);
```

**`orderable` 判定**（能不能真下单）：

```ts
orderable = kind === 'exact' || kind === 'sameParts';
```

因为 MCP 只能下单真实 SKU。`near` / `custom` 的汉堡没有 `productCode`，只能存为「菜单外灵感」并生成分享卡片 —— 这一点在 UI 上必须明说，不能给一个点了会失败的按钮。

### 5.4 自定义汉堡命名

不需要 LLM，纯规则拼接，保证确定性与离线可用：

```text
[口味词] + [层数词] + [芝士词] + [主料词] + 堡
  香辣/板烧/深海/芥末   双层/三层    芝士    牛肉/脆鸡/鳕鱼
```

去重规则：`香辣 + 麦辣鸡腿` → 丢掉口味词（`香辣麦辣鸡腿堡` 很怪）。
无肉排 → 走 `全素蔬萃堡` 分支。
最终兜底 `你的专属汉堡`。

### 5.5 微交互清单

| 元素 | 悬停 | 按下 | 禁用 |
|---|---|---|---|
| 食材卡片 | `translateY(-2px)` + 阴影，200ms | `scale(0.96)`，120ms | `opacity .4`，`cursor not-allowed` |
| 主按钮（完成） | 亮度 +6% | `scale(0.97)` | 灰底，文案换「再放一层」 |
| 层列表项 | 背景 `#FBF6EC` | — | — |
| 成就卡 | 从下弹入 `translateY(24px) → 0` + `opacity`，360ms `back.out(1.4)` | — | — |
| 价格数字变化 | 数字滚动（`requestAnimationFrame` 补间 300ms） | — | 变红 + 抖动 1 次 |

**不用颜色单独传达状态**：热量超阈值除了变红，同时出现 `⚠` 图标与「已超 800 kcal」文字。这是 WCAG 1.4.1 的要求。

### 5.6 食材细节：把「低模」做到不像色块

第一版食材是纯色旋转体，截图放大后像一堆塑料积木。第二轮补形体与质感，第三轮把
「撒点东西假装表面」全部换成**写进几何的位移**，第四轮解决的是**辨识度**：五块肉排
从此各有各的剪影，洋葱从「一片碎屑」变成七块楔片，斜视角度也压低到能看全夹层。
原则始终是**全部程序化、零外部资产**，但每一处细节都要有食物依据。

| 食材 | 做法 | 为什么这样做 |
|---|---|---|
| 上层面包 | Lathe 圆顶，**最大半径 0.925、厚度 0.40** + **顶点色竖向渐变** + 混合 UV + 18 块大斑驳 / 2200 粒细点 | 单一色 + 扁平光照一定像塑料。半径比生菜小一圈是关键：宽过生菜它就是一顶宽檐帽，把下面六层全罩进阴影里。**厚度别压过头**：0.925 : 0.30 = 3 : 1，什么圆顶摊成 3 : 1 都读成一块饼干；0.40 是 2.3 : 1，肩部的弧和顶部的拱才同时成立。大斑驳只在顶面（平面投影）安全，柱面展开会在极点拉成刷痕 |
| 芝麻 | 沿轮廓参数采样，用该点**外法线**定向，96 粒黄金角螺旋，单粒长度仅占面包直径 3% | 撒在固定半径的半球上会错：面包是压扁旋转体，靠近顶点全埋进面里、肩部又飘在面外。之前单粒长到 9% 直径 + 纯白，看着像贴上去的白色糖片 |
| 牛肉排 | 手压轮廓（顶面中间塌到 0.952）+ `crinkleGeometry` 0.0145/7/23 + 焦带画进贴图 | 「肉的颗粒」要长在轮廓上；靠 bump 只能骗光照，一打侧光就露馅。细点从 3600 颗 1px 收到 1500 颗 2–5px：前者是砂纸，后者才是绞肉 |
| 麦辣鸡腿排 | 同族轮廓但**最厚**（0.32），横向拉长 1.055，揉皱 0.021/9.4 | 它是一整块腿肉裹粉，柱状、比牛肉饼厚；不压「长轴/短轴」这一下，它和脆鸡排的剪影一模一样 |
| 脆鸡排 | 揉皱 0.019/8.5；轮廓抖动 0.044 / 频率 12；44 块边角块 + 54 片顶面翻壳 | 炸鸡先看剪影。0.022 在半径 1.0 上只有 2%，远看还是一条干净弧线 —— 读起来就是「刷了层颗粒的饼」。碎屑只挂侧壁时顶面是光板，顶面必须另铺一层翻壳 |
| 板烧鸡腿排 | **最扁最宽**（轮廓几乎平滑，抖动 0.012），椭圆 x 1.05 / z 0.92；粗糙度 0.5 + 4 道深焦带 | 铁板压过的东西是光的、油的。它和牛肉的第二个分野是「油光」，不是颜色 |
| 鳕鱼排 | **超椭圆（n=6）重映射成圆角方**，斜摆 24°，浅金底色 + 240 块大而糊的白斑 | 五种肉里只有它是方的 —— 剪影是最强的辨识信号。白斑要「大而少、边界糊」：800 颗均匀白点是撒了白巧碎的饼干，鱼肉是从面衣裂缝里透出来的 |
| 芝士 | **有厚度的方片**：1.62 见方，极坐标闭合薄板（顶面 + 底面 + 侧壁），超椭圆 n=6 削出近直角的四角，顶面只在 ±1.6% 厚度上起伏 | 一整条都写在「为什么不做融化」里：零厚度的面侧看只有一条没有厚度的边，读成黄色锡纸；塌边的「化开」在汉堡里既不像片、也看不出是哪一层。角半径 1.02 压过面包 0.925 一线 —— 露出的那点角是它在成品里唯一的辨识信号 |
| 洋葱 | **7 块有厚度的环形扇区**（外圈 4 段各 70°–84° + 内圈 3 段），两端按 `cos` 收薄到 45%，段间留缝；**同心层理画进贴图** | 上一版是「一整片 + 26 段小弧 + 46 颗碎丁 + 一张 opacity 0.5 的兜底圆盘」，七段一叠正好拼成一个完整圆盘 —— 读起来是一只带裂纹的塑料盘子。**洋葱的「层」不是颜色**：只给明度渐变，它还是一块浅色塑料片；层理要靠贴图（`onionWedgeGeometry` 的 UV 的 v 就是半径方向，画一条水平线 = 一圈弧） |
| 薯饼 | 压实的饼胚（细密揉皱 0.008/14）+ **4 层薯丝共 1160 根**，其中 460 根细丝铺在表面上，逐根换色 | 丝长 0.23 时半根伸到饼缘外，整块变成鸟窝；但丝也不能全嵌进饼体 —— 顶面那层密实的丝才是薯饼的辨识度，全嵌进去就只剩一块压花饼 |
| 生菜 | **三片错开的叶盘**：偏心 0.13–0.15、各自转向、z 向拍扁成椭圆（`scale z 0.84–0.92`）；抬升 0 / 0.32h / 0.58h；轮廓半径用**圆周噪声**再挖 4 个深缺口；褶线相位随半径偏移（`a + t·0.85`） | 三片**同轴**递减的叶盘，外轮廓永远是一个圆 —— 远看就是「一大片叶子」，换多少种子都没用。抬升量按「每片裙边（下垂 0.36h）正好压在下一片的面」给，交界处才看得见。褶线只按角度采样就等于整条半径一起升降，渲染成一片三角褶扇 |
| 生菜的材质 | roughness 0.92（叶盘与叶尖同值），`leafMap` 同时当 map 和 bumpMap，bumpScale 0.1 | 0.86 的叶面在 1.6 强度主光下糊成一团奶绿高光，是「塑料叶」的第二个来源。叶尖的 `color` 必须是白 —— 它乘的是饱和黄绿贴图，再乘一层奶白只会把绿色洗掉 |
| 番茄片 | **整张横切面画进 512² 贴图**：7 个透镜形心室（`sin(πt)^0.5` 决定胖瘦）、淡粉隔膜、水滴形籽、胶质果心、果皮圈；几何只剩「侧壁 + 一张圆片」 | 用 `RingGeometry` 楔形拼心室，边是硬的、等宽的，7 瓣一圈排下来是一枚风车 logo；籽用小球则是撒在切面上的糖珠。渐变和圆角只能画，画完绘制调用还从 20 多次降到 3 次 |
| 下层面包 | 轮廓在 `y≈1` 处收成平顶（`0.88 → 0.84 → 0`）+ 一张 **0.843 半径的圆片把平顶盖满**；瓤是**暖米色 + 看得见的气孔**：`crumb` 贴图 `repeat 1`（不是 3）、3600 粒 0.8–2.4px 细孔 + 30 块糊边大孔、bump 0.018；顶点色从圆心 `#FFFAF0` 渐变到边缘 `#C89A63`（`inner=0.55`，中间 55% 不压暗） | 切面必须是「切开的」，不能是圆穹 —— 穹顶会比切面高出来，四周顶出一圈被拉成竖条纹的外皮，像贝果的内壁。切面**要盖满**：窄 0.005 就会在那道缝里露出外皮材质，在顶面围出一圈浅色细环；再加个烤褐 Torus 就成了「面包片上画了一个圈」。**瓤必须有孔**：一片没有孔的浅色圆片，调成什么颜色都读成「盖了一层奶油」 |
| 培根 | 3 条有厚度的波浪肉条（0.024 / 0.022 / 0.02 厚，0.26 / 0.22 / 0.19 宽），z 各错 −0.17/0.05/0.24；**3 套不同的脂肪走向贴图** | 单色砖红薄板怎么弯都是硬纸板。脂肪带从 4–5 条宽白带收到 3 条窄带（总覆盖 35% → 18%）：脂肪占比一高、对比一强，读出来就是火腿片。瘦肉 `#9C3F1D → #B05228`、脂肪 `#E4C29C → #F2DBBC`：太暗的两档明度差会让它整条读成一片木刨花 |
| 纹理 | Canvas 程序化 `speckleTexture × 7` / `leafTexture` / `baconTexture × 3` / `grainTexture × 4` | 不引入贴图文件，改参数就换质感 |

十二个踩过的坑，写下来避免复现：
1. **`ExtrudeGeometry` 在 `bevelEnabled: false` 时不会生成顶/底盖。**
   three r175 的盖面三角剖分跑在 `for (b = 0; b < bevelSegments; b++)` 里，
   关掉倒角后 `bevelSegments` 被置 0，循环不执行，`contractedContour` 为空，盖面直接不生成。
   现象极具迷惑性：芝士只剩四条侧壁、中间透明，能透过它看到下面的番茄 —— 看起来像「芝士太小被挡住了」，
   实际是模型缺面。解法是开着倒角并用 0.006 这种极小值当「零倒角」用。最后芝士改成细分曲面，
   这条经验留在这里给以后换回挤出体的人。

2. **贴面小物件必须算外法线，不能按球面近似。**
   面包、肉排、番茄都是压扁的旋转体。用 `球面方向 × 半径` 定位芝麻，等于假设它是球。

3. **柱面 UV 在圆顶极点会把贴图挤成一把扇子。**
   `LatheGeometry` 的 UV 是 `u` 绕一圈、`v` 顺轮廓，到极点处所有 `u` 落到同一个像素，
   于是任何有横向变化的地图都变成放射状刷痕 —— 面包顶上那圈「谁拿刷子刷下来」的纹就是这个，
   不是光照也不是 bump。换顶视投影能治极点，但侧壁的 (x, z) 几乎不变，整壁采样同一列纹素，
   会拉出一圈竖条纹。最终用 `projectHybridUV`：法线朝上的面走顶视、接近竖直的面走柱面，
   切换点压在轮廓的圆角线上，接缝看不出来。

4. **顶点色和 map 是相乘的。**
   上层面包同时挂了 `speck: 'bunTop'`（map）和烘焙渐变（vertexColors）。
   渐变给的是 `#E9B675 → #C07B33`，乘上贴图底色 `#E0A05A` 之后顶面只剩
   `#C07B33 × #E0A05A ≈ #A85A12` —— 一个全麦面包。有 map 时，顶点色只能当「轻微压暗」
   的乘子用（`#FFFBF4 → #E8BC8C`），具体色相交给贴图。

5. **贴图 `repeat` 乘得太密 = 贴图不存在。**
   面包瓤的 `speck` 贴图原来是 `repeat: 3`：256px 的图铺 3 次，一张直径 1.7 单位的圆片
   在 1080p 下只有 380px，一个贴图像素摊不到半个屏幕像素 —— 所有气孔都被 mipmap 平均成
   一块均匀的浅色，于是「切面」在渲染里就是一张纯色圆片。**不是颜色不对，是孔根本没画出来。**
   凡是贴在**大面积平面**上的贴图，先算「贴图像素 ÷ 屏幕像素」，小于 1 就等于没贴。

6. **细点调色板里的亮色超过 1/5，表面就会长白疹子。**
   瓤的气孔是**阴影**，绝大多数偏暗，只有气孔壁的高点才亮。上一版 5 个色值里 2 个接近纯白
   （`#FBEDD2` / `#FFF6E4`），按均匀分布取色时 40% 的点是亮的，放大看像撒了一层白芝麻。

7. **「贴上去的平面」必须真的贴在面上，否则它会从面上顶出来。**
   下层面包的切面本来是半径 0.9 的一张浅锥，而面包轮廓一路收到 `[0.24, 1] [0, 1]`
   —— 顶上是个圆穹。穹面在 `r < 0.9` 的每一处都比那张锥高，于是从切面里穿了出来，
   露出它自己那圈被平面投影拉成竖条纹的外皮。远看就是「切面周围多了一圈贝果内壁」。
   凡是拿一张平面去盖一个曲面的地方（切面、酱料打底、纸袋），都要先确认那张平面
   **处处在曲面之上**；或者干脆把曲面改成平面 —— 面包最终就是改成平顶的。

8. **纯 `sin(freq·a)` 的轮廓抖动是完美周期的。**
   频率取 12，一圈就正好 12 个**等宽等深**的花瓣 —— 炸鸡的边渲染出来像一朵菊花模具。
   现在叠两层 `ringNoise`（它沿圆周采样、天然闭合），有的地方鼓得高、有的地方几乎平。
   同一条经验也适用于叶缘：周期感是「工业品」最明显的破绽。

9. **五块肉共用一条轮廓 = 剪影失语。**
   上一版 `pattyBeef / pattySpicy / pattyCrispy / pattyGrilled / pattyFish` 全指向
   `PATTY`，只靠贴图换色。结果在汉堡里无论夹牛肉、脆鸡还是鳕鱼，外形完全一样 ——
   用户只能靠颜色猜，还得记住哪块是哪个颜色。现在五种肉各自一条曲线：厚薄、宽窄、
   是否椭圆、是否方角，都进几何。**颜色是最不可靠的辨识信号，剪影才是。**

10. **零厚度的「片」不存在。** `PlaneGeometry` 侧看是一条没有厚度的边，
   配 `DoubleSide` 还会因为背面法线反向，在塌下去的角上出现莫名其妙的暗斑。
   凡是「片」—— 芝士、培根、面包切面 —— 都要有顶面 + 底面 + 侧壁，
   哪怕侧壁只有 3px。

11. **「同心」和「错开」是两种完全不同的形状。** 生菜三层半径递减、圆心重合时，
   无论把噪声种子、颜色、皱褶调成什么样，**外轮廓都是一个圆**，读起来只有
   「一大片叶子」。要读出「两三片」，必须动位置（偏心）、动朝向（rotY）、
   动形状（非均匀 scale），而不是动参数。同理，抬升量要按「上一片的裙边
   刚好压在下一片的面上」给 —— 太近则完全埋进去，交界一条线都看不见。

12. **混合 UV 的切换必须插值，不能二值判断。**
   `ny > 0.55 ? 顶视 : 柱面` 的写法，会让相邻两个顶点走完全不同的投影 ——
   饼底的圆角带上一左一右地跳，渲染出一圈「竖着小齿的条码」，看着像贴了一行字。
   改成 `smoothstep(ny, 0.32, 0.82)` 之后两个投影线性混合，过渡带里纹理只被拉斜一点点，
   在噪声贴图上完全看不出来。


---

## 6. 核心代码示例

以下为关键片段的精简版，完整实现见 `src/`。

### 6.1 React 中初始化 MCP 数据请求

```tsx
// src/components/providers/MCPProvider.tsx
'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { BurgerRecipe } from '@/types/burger';

type Phase = 'cold' | 'loading' | 'ready' | 'offline';

interface MCPState {
  phase: Phase;
  storeCode: string | null;
  storeName: string | null;
  recipes: BurgerRecipe[];
  offline: boolean;
  reload: () => void;
}

const Ctx = createContext<MCPState | null>(null);

/** 唯一的网络出口：只传工具名和参数，Token 在服务端注入 */
async function callTool<T>(tool: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args }),
  });
  if (!res.ok) throw new Error(`MCP ${tool} failed: ${res.status}`);
  const json = await res.json();
  return json.data as T;
}

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>('cold');
  const [store, setStore] = useState<{ code: string; name: string } | null>(null);
  const [recipes, setRecipes] = useState<BurgerRecipe[]>([]);
  const [offline, setOffline] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let dead = false;
    (async () => {
      setPhase('loading');
      try {
        // ① 门店上下文（一切查询的前置）
        //    注意：query-nearby-stores 的 beType / searchType 都是必填，
        //    searchType=1 查收藏餐厅，=2 才需要 city + keyword
        const stores = await callTool<{ stores: any[] }>('query-nearby-stores', {
          beType: 1,
          searchType: 1,
        });
        const s = stores.stores?.[0];
        if (!s) throw new Error('no store');
        if (dead) return;
        setStore({ code: s.storeCode, name: s.storeName });

        // ② 菜单
        const menu = await callTool<{ data: any }>('query-meals', {
          storeCode: s.storeCode,
          orderType: 1,
          beType: 1,
        });

        // ③ 并发拉每个汉堡的详情（限制 4 并发，避免打爆 MCP）
        const burgers = pickBurgers(menu);
        const details = await mapLimit(burgers, 4, (b) =>
          callTool('query-meal-detail', {
            storeCode: s.storeCode, orderType: 1, beType: 1, code: b.productCode,
          }),
        );

        if (dead) return;
        setRecipes(details.map(toBurgerRecipe).filter(Boolean) as BurgerRecipe[]);
        setPhase('ready');
      } catch (e) {
        console.warn('[MCP] 降级到本地快照', e);
        if (dead) return;
        setRecipes(SEED_RECIPES);
        setOffline(true);
        setPhase('offline');
      }
    })();
    return () => { dead = true; };
  }, [nonce]);

  const value = useMemo(
    () => ({ phase, storeCode: store?.code ?? null, storeName: store?.name ?? null,
             recipes, offline, reload: () => setNonce(n => n + 1) }),
    [phase, store, recipes, offline],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useMCP = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMCP must be used inside <MCPProvider>');
  return v;
};
```

服务端那侧（`src/app/api/mcp/route.ts`）：

```ts
import { NextResponse } from 'next/server';
import { getMcpClient } from '@/lib/mcp/client';

export const runtime = 'nodejs';

const ALLOWED = new Set([
  'query-nearby-stores', 'query-meals', 'query-meal-detail',
  'list-nutrition-foods', 'calculate-price', 'create-order',
  'query-store-coupons', 'now-time-info',
]);

export async function POST(req: Request) {
  const { tool, args } = await req.json();
  if (!ALLOWED.has(tool)) {
    return NextResponse.json({ error: 'tool not allowed' }, { status: 403 });
  }
  try {
    const client = await getMcpClient();
    const raw = await client.callTool({ name: tool, arguments: args ?? {} });
    return NextResponse.json({ data: unwrapToolResult(raw) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'mcp call failed' },
      { status: 502 },
    );
  }
}
```

### 6.2 IngredientLayer：单层渲染 + 落体动画

```tsx
// src/components/stage/IngredientLayer.tsx
'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { INGREDIENTS } from '@/lib/ingredients';
import { IngredientMesh } from './IngredientMesh';
import type { StackLayer } from '@/types/burger';

interface Props {
  layer: StackLayer;
  /** 是否播放落体动画（历史层重排时置 false） */
  animate?: boolean;
  onSettled?: () => void;
}

export function IngredientLayer({ layer, animate = true, onSettled }: Props) {
  const wrapRef = useRef<THREE.Group>(null);
  const ing = INGREDIENTS[layer.ingredientId];

  useEffect(() => {
    const g = wrapRef.current;
    if (!g) return;

    if (!animate) {
      g.position.y = 0;
      g.scale.set(1, 1, 1);
      return;
    }

    const tl = gsap.timeline({
      delay: Math.min(layer.index, 6) * 0.04, // 连续点击时错开
      onComplete: onSettled,
    });

    tl.fromTo(
      g.position,
      { y: 3.2 },
      { y: 0, duration: 0.42, ease: 'power2.in' },
    )
      // 触地：压扁 + 横向膨胀（体积守恒的错觉）
      .to(g.scale, { x: 1.08, y: 0.82, z: 1.08, duration: 0.09, ease: 'power2.out' })
      // 反弹过冲
      .to(g.scale, { x: 0.97, y: 1.06, z: 0.97, duration: 0.14, ease: 'sine.out' })
      // 落定
      .to(g.scale, { x: 1, y: 1, z: 1, duration: 0.22, ease: 'elastic.out(1, 0.4)' });

    return () => { tl.kill(); };
  }, [animate, layer.index, onSettled]);

  if (!ing) return null;

  return (
    <group position-y={layer.baseY}>
      {/* 内层组是动画目标：几何体底面在局部 y=0，缩放时底部不位移 */}
      <group ref={wrapRef}>
        <IngredientMesh ingredient={ing} />
      </group>
    </group>
  );
}
```

页面里这样用：

```tsx
// src/components/stage/BurgerStack.tsx
export function BurgerStack({ layers }: { layers: StackLayer[] }) {
  return (
    <group>
      {layers.map((layer, i) => (
        <IngredientLayer
          key={layer.uid}
          layer={layer}
          // 只有最后一层播动画；撤销/重排时其余层直接落位
          animate={i === layers.length - 1}
        />
      ))}
    </group>
  );
}
```

### 6.3 点击「完成」时的配方匹配

```ts
// src/lib/match.ts
import { INGREDIENTS } from './ingredients';
import type { BurgerRecipe, MatchResult } from '@/types/burger';

const nameOf = (id: string) => INGREDIENTS[id]?.name ?? id;

/** 多重集：重数敏感、顺序无关 */
function countMap(ids: string[]) {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

function sameMultiset(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const x = countMap(a), y = countMap(b);
  for (const [k, v] of x) if (y.get(k) !== v) return false;
  return true;
}

/** 序列编辑距离（插入/删除/替换各计 1） */
function editDistance(a: string[], b: string[]) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

export function matchRecipe(userIds: string[], recipes: BurgerRecipe[]): MatchResult {
  // ① 全等：顺序 + 重数都对
  for (const r of recipes) {
    if (r.layers.length === userIds.length &&
        r.layers.every((id, i) => id === userIds[i])) {
      return { kind: 'exact', recipe: r, distance: 0, orderable: true };
    }
  }

  // ② 多重集相等：配料齐了，摆盘不同
  for (const r of recipes) {
    if (sameMultiset(userIds, r.layers)) {
      return { kind: 'sameParts', recipe: r, distance: 0, orderable: true };
    }
  }

  // ③ 找最接近的
  let best: { r: BurgerRecipe; d: number } | null = null;
  for (const r of recipes) {
    const d = editDistance(userIds, r.layers);
    if (!best || d < best.d) best = { r, d };
  }

  if (best && best.d <= 2) {
    const u = countMap(userIds), o = countMap(best.r.layers);
    const missing = [...o].filter(([k, v]) => (u.get(k) ?? 0) < v).map(([k]) => nameOf(k));
    const extra   = [...u].filter(([k, v]) => v > (o.get(k) ?? 0)).map(([k]) => nameOf(k));
    return {
      kind: 'near', recipe: best.r, distance: best.d,
      diff: { missing, extra }, orderable: false,
    };
  }

  return { kind: 'custom', distance: best?.d, orderable: false };
}
```

调用侧：

```tsx
const onFinish = useCallback(() => {
  const ids = session.layers.map(l => l.ingredientId);
  const result = matchRecipe(ids, recipes);

  dispatch({ type: 'SET_MATCH', match: result });

  if (result.kind === 'exact') {
    // 命中官方配方 → 直接锁定 SKU，可加购
    dispatch({ type: 'LOCK_SKU', productCode: result.recipe!.productCode });
    toast(`恭喜你发明了${result.recipe!.name}！`);
  } else if (result.kind === 'custom') {
    dispatch({ type: 'SET_CUSTOM_NAME', name: nameCustomBurger(ids) });
  }
  // near 态不弹窗，右栏出黄条提示补料
}, [session.layers, recipes]);
```

### 6.4 相机自适应（完整版）

```tsx
// src/components/stage/CameraRig.tsx
'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function CameraRig({ totalHeight }: { totalHeight: number }) {
  const { camera, controls } = useThree() as any;
  const want = useRef({ focusY: 1.2, dist: 5 });

  // 只在高度变化时重算目标，不在每帧算三角函数
  useEffect(() => {
    want.current.focusY = totalHeight * 0.55;
    want.current.dist = THREE.MathUtils.clamp(4.2 + totalHeight * 1.15, 4.2, 12);
  }, [totalHeight]);

  useFrame((_, dt) => {
    if (!controls) return;
    const { focusY, dist } = want.current;
    const target = controls.target as THREE.Vector3;

    const offset = camera.position.clone().sub(target);
    const len = offset.length() || 1;
    const azimuth = Math.atan2(offset.x, offset.z);
    const polar = THREE.MathUtils.clamp(Math.acos(offset.y / len), 0.55, 1.05);

    const desired = new THREE.Vector3(
      Math.sin(azimuth) * Math.sin(polar),
      Math.cos(polar),
      Math.cos(azimuth) * Math.sin(polar),
    ).multiplyScalar(dist);
    desired.y += focusY;

    const k = 1 - Math.exp(-6 * dt);   // 帧率无关平滑
    camera.position.lerp(desired, k);
    target.y += (focusY - target.y) * k;
    controls.update();
  });

  return null;
}
```

---

## 7. 自检清单

交付前逐项过：

- [ ] 正文对比度 ≥ 4.5:1，UI 组件 ≥ 3:1（金黄底上不用白字）
- [ ] 所有状态变化不只用颜色表达（热量告警带图标 + 文字）
- [ ] Tab 可键盘操作，`:focus-visible` 有 2px 明显焦点环
- [ ] 触控目标 ≥ 44×44
- [ ] `100dvh`，iOS 地址栏不跳动
- [ ] 堆叠 20 层时帧率 ≥ 30fps（低端机）
- [ ] 断网后仍能进入「演示数据」模式并完成一次 DIY
- [ ] 门店打烊时段进入时不降级，顶栏标「预约菜单」并注明时段
- [ ] 客户端 bundle 中搜不到 Token
- [ ] 结算失败时有明确文案，不伪造成功
- [ ] 所有数字带单位（`¥` / `kcal` / `层`）
- [ ] 舞台里不出现「信息量为零」的装饰（上一版凭空多出一个黄色提示环，已删）
- [ ] 每个食材单独截图时都读得出是什么，不需要靠上下文猜
- [ ] **把五张肉排的截图去色成黑白，仍能靠剪影分出是哪一块**（颜色是最不可靠的辨识信号）
- [ ] **把截图缩到 50% 再看一眼**：轮廓上出现等宽等深的波浪 = 纯正弦抖动没换掉；
      出现一圈竖着小齿的条码 = 混合 UV 还是二值切换
- [ ] 相机仰角落在 25°–36°：八层时每一层都露得出来，圆顶不占画面的一半
- [ ] 浅色食材（面包切面）在场景里不过曝：截图取色应仍在 240 以下
