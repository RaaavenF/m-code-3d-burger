/**
 * 领域模型
 *
 * 设计前提：
 *  1. 食材表是「物理属性」—— 厚度、几何、热量都是常量，与门店无关；
 *  2. 配方是「业务数据」—— 完全来自 MCP，随时可变；
 *  3. 两者分离，改配方不需要碰 3D 代码。
 */

/** 食材分类，同时决定左栏 Tab 顺序 */
export type IngredientCategory =
  | 'bread'
  | 'patty'
  | 'veg'
  | 'cheese'
  | 'sauce'
  | 'side';

/** 程序化几何形态。若同时提供 modelPath，则优先加载 GLB */
export type GeometryKind =
  | 'bunBottom'
  | 'bunTop'
  | 'pattyBeef'
  | 'pattyCrispy'
  | 'pattySpicy'
  | 'pattyGrilled'
  | 'pattyFish'
  | 'lettuce'
  | 'tomato'
  | 'onion'
  | 'pickle'
  | 'cheese'
  | 'sauce'
  | 'bacon'
  | 'hashbrown';

export interface Ingredient {
  /** 稳定 ID，3D 层的业务标识 */
  id: string;
  name: string;
  category: IngredientCategory;
  /** 该层净厚度（世界单位，下层面包半径 = 1） */
  thickness: number;
  /** 与下层的咬合下沉量，避免出现硬缝隙 */
  sink: number;
  /** 单层价格（元），仅用于本地估算；结算以 MCP calculate-price 为准 */
  price: number;
  /** 单层热量（kcal，估算） */
  kcal: number;
  /** 是否允许重复叠加（芝士 / 酱料 / 酸黄瓜 = true，面包 = false） */
  repeat: boolean;
  /** 主色，用于缩略图与配方列表色块 */
  color: string;
  /** 是否需要渲染进 3D 舞台 */
  renderable: boolean;
  geometry: GeometryKind;
  /** 可选 GLB 路径，提供后覆盖程序化几何 */
  modelPath?: string;
  /** 自定义汉堡命名用词根，如「脆鸡」 */
  nameRoot?: string;
  /** 位置约束：上层面包只能封顶，下层面包只能垫底 */
  slot?: 'bottomOnly' | 'topOnly';
  description?: string;
  /** 来自 MCP 特调项的原始 code/key，下单时回填 */
  mcp?: {
    code: string;
    selectedKey?: string;
    unselectedKey?: string;
  };
}

/** MCP 餐品详情里的一个特调项 */
export interface McModification {
  name: string;
  code: string;
  selectedKey?: string;
  unselectedKey?: string;
  /** 映射到的食材 ID；null 表示本系统没有对应模型，仅透传 */
  ingredientId: string | null;
  defaultOn: boolean;
  /** 价格增量（元），来自 MCP；未知时省略 */
  priceDelta?: number;
}

/** 官方配方，由 query-meal-detail 映射而来 */
export interface BurgerRecipe {
  id: string;
  /** MCP productCode，结算唯一凭证 */
  productCode: string;
  name: string;
  /** 从下到上的完整层序列，含上下两片面包 */
  layers: string[];
  /** 列表展示价（元）；结算走 calculate-price */
  listPrice: number;
  /** 官方热量（kcal），MCP 未提供时省略 */
  officialKcal?: number;
  description?: string;
  /** 角标文案，如「人气经典」 */
  badge?: string;
  imageUrl?: string;
  /** 该产品允许的特调项，直接透传给 calculate-price */
  modifications?: McModification[];
  /** 数据来源，决定 UI 是否打「离线」标 */
  source: 'mcp' | 'cache' | 'seed';
}

/** 栈上的一个实例。同一食材可出现多次 */
export interface StackLayer {
  /** 实例唯一 ID —— 不能用 ingredientId，双层堡的两片肉必须可区分 */
  uid: string;
  ingredientId: string;
  /** 底部 Y 坐标 */
  baseY: number;
  /** 入栈序号，用于错开动画 */
  index: number;
}

export type MatchKind = 'exact' | 'sameParts' | 'near' | 'custom';

export interface MatchResult {
  kind: MatchKind;
  recipe?: BurgerRecipe;
  /** 序列编辑距离 */
  distance?: number;
  /** 差在哪：缺什么、多什么（人类可读的中文名） */
  diff?: { missing: string[]; extra: string[] };
  /** 能否映射到官方 SKU 真实下单 */
  orderable: boolean;
}

export type DiyStatus = 'idle' | 'stacking' | 'matching' | 'win' | 'near' | 'custom';

export interface CartItem {
  uid: string;
  /** 官方 productCode；自定义菜单外汉堡没有 */
  productCode?: string;
  name: string;
  price: number;
  kcal: number;
  layerIds: string[];
  /** 是否为「菜单外灵感」（不可结算） */
  offMenu: boolean;
}

/** /api/mcp 的响应外壳 */
export interface McpProxyResponse<T = unknown> {
  data?: T;
  error?: string;
}
