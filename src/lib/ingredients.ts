import type { Ingredient, IngredientCategory } from '@/types/burger';

/**
 * 食材静态表
 *
 * thickness：层净厚度（下层面包半径 = 1）
 * sink     ：与下层的咬合下沉量
 * price/kcal：单层估算值，结算以 MCP 为准
 *
 * 扩展方式：加一条即可，3D / 列表 / 匹配全部自动生效。
 * 若要接入自有 GLB，加 modelPath 字段即可覆盖程序化几何。
 */
export const INGREDIENTS: Record<string, Ingredient> = {
  /* ───────────── 面包 ───────────── */
  bun_bottom: {
    id: 'bun_bottom',
    name: '下层面包片',
    category: 'bread',
    thickness: 0.3,
    sink: 0,
    price: 2,
    kcal: 120,
    repeat: false,
    color: '#E8A552',
    renderable: true,
    geometry: 'bunBottom',
    slot: 'bottomOnly',
    description: '柔软微焦的底座，承托所有野心',
  },
  bun_top: {
    id: 'bun_top',
    name: '上层面包片',
    category: 'bread',
    // 0.46 → 0.325 → 0.30 → 0.40
    //
    // 0.46 时顶包一个人吃掉整座汉堡近 40% 的高度，夹层被压成一条缝；
    // 但压到 0.30 又矫枉过正：半径 0.925、高度 0.30 的比例是 3 : 1，
    // 什么圆顶摊成 3 : 1 都会读成「一块饼干」，圆顶的体积感全没了。
    // 0.40 是这两版之间的折中 —— 比原版矮 13%，但仍是 2.3 : 1，
    // 肩部的弧还能看出是个面包。
    thickness: 0.4,
    // 盖子的 sink 要比其他层大：顶包收腰，底面比馅料窄一圈，
    // 只下沉 0.02 时从侧斜角能看到一层黑缝，像帽子悬在头上。
    sink: 0.042,
    price: 2,
    kcal: 130,
    repeat: false,
    color: '#F0B269',
    renderable: true,
    geometry: 'bunTop',
    slot: 'topOnly',
    description: '撒满芝麻的圆顶，只有「完成」时才盖下来',
  },

  /* ───────────── 肉排 ───────────── */
  patty_beef: {
    id: 'patty_beef',
    name: '100% 牛肉排',
    category: 'patty',
    thickness: 0.22,
    sink: 0.012,
    price: 8.5,
    kcal: 190,
    repeat: true,
    color: '#7B4A2A',
    renderable: true,
    geometry: 'pattyBeef',
    nameRoot: '牛肉',
    description: '炙烤出焦边，肉汁锁在里面',
  },
  patty_crispy: {
    id: 'patty_crispy',
    name: '脆鸡排',
    category: 'patty',
    thickness: 0.3,
    sink: 0.012,
    price: 6.5,
    kcal: 210,
    repeat: true,
    color: '#DFA13E',
    renderable: true,
    geometry: 'pattyCrispy',
    nameRoot: '脆鸡',
    description: '外层颗粒感十足，一口咔嚓',
  },
  patty_spicy: {
    id: 'patty_spicy',
    name: '麦辣鸡腿排',
    category: 'patty',
    thickness: 0.32,
    sink: 0.012,
    price: 7.5,
    kcal: 230,
    repeat: true,
    color: '#D97B2B',
    renderable: true,
    geometry: 'pattySpicy',
    nameRoot: '麦辣鸡腿',
    description: '辣味渗进面衣，越吃越上头',
  },
  patty_grilled: {
    id: 'patty_grilled',
    name: '板烧鸡腿排',
    category: 'patty',
    thickness: 0.21,
    sink: 0.012,
    price: 8.5,
    kcal: 180,
    repeat: true,
    color: '#C98A4B',
    renderable: true,
    geometry: 'pattyGrilled',
    nameRoot: '板烧鸡腿',
    description: '铁板压出焦纹，多汁不干',
  },
  patty_fish: {
    id: 'patty_fish',
    name: '深海鳕鱼排',
    category: 'patty',
    thickness: 0.22,
    sink: 0.012,
    price: 7.5,
    kcal: 150,
    repeat: true,
    color: '#EBCB8B',
    renderable: true,
    geometry: 'pattyFish',
    nameRoot: '鳕鱼',
    description: '雪白鱼肉，外裹金黄脆衣',
  },

  /* ───────────── 蔬菜 ───────────── */
  lettuce: {
    id: 'lettuce',
    name: '生菜',
    category: 'veg',
    thickness: 0.15,
    sink: 0.012,
    price: 1,
    kcal: 7,
    repeat: true,
    color: '#7AC74F',
    renderable: true,
    geometry: 'lettuce',
    nameRoot: '生菜',
    description: '大块叶片铺满一层，脆得能听见声音',
  },
  tomato: {
    id: 'tomato',
    name: '番茄片',
    category: 'veg',
    // 0.13 的厚度配上 0.74 的半径，侧壁比切面薄不了多少，
    // 从 3/4 视角看就是一只深红色的碗。真实番茄片更薄。
    thickness: 0.09,
    sink: 0.015,
    price: 1.5,
    kcal: 10,
    repeat: true,
    color: '#E2452F',
    renderable: true,
    geometry: 'tomato',
    nameRoot: '番茄',
    description: '酸甜汁水，负责解腻',
  },
  onion: {
    id: 'onion',
    name: '洋葱',
    category: 'veg',
    thickness: 0.11,
    sink: 0.015,
    price: 1,
    kcal: 12,
    repeat: true,
    // 3D 那边已经从冷紫白改成暖乳白，色板跟着走
    color: '#E5C4A6',
    renderable: true,
    geometry: 'onion',
    nameRoot: '洋葱',
    description: '生洋葱的辛香，越嚼越甜',
  },
  pickle: {
    id: 'pickle',
    name: '酸黄瓜',
    category: 'veg',
    thickness: 0.09,
    sink: 0.015,
    price: 1,
    kcal: 8,
    repeat: true,
    color: '#6E9F4A',
    renderable: true,
    geometry: 'pickle',
    nameRoot: '酸黄瓜',
    description: '一记酸脆，把油脂切开',
  },

  /* ───────────── 芝士 ───────────── */
  cheese: {
    id: 'cheese',
    name: '吉士片',
    category: 'cheese',
    thickness: 0.1,
    sink: 0.012,
    price: 2.5,
    kcal: 60,
    repeat: true,
    color: '#FFC53D',
    renderable: true,
    geometry: 'cheese',
    nameRoot: '芝士',
    description: '遇热微微塌角，拉丝的那一种',
  },

  /* ───────────── 酱料 ───────────── */
  sauce_mayo: {
    id: 'sauce_mayo',
    name: '麦香鸡酱',
    category: 'sauce',
    thickness: 0.1,
    sink: 0.015,
    price: 1,
    kcal: 45,
    repeat: true,
    color: '#EFD79B',
    renderable: true,
    geometry: 'sauce',
    description: '奶白微酸，最百搭的一味',
  },
  sauce_spicy: {
    id: 'sauce_spicy',
    name: '辣椒黄油风味酱',
    category: 'sauce',
    thickness: 0.1,
    sink: 0.015,
    price: 1,
    kcal: 50,
    repeat: true,
    color: '#D24A22',
    renderable: true,
    geometry: 'sauce',
    nameRoot: '香辣',
    description: '辣度集中在后段，回甘明显',
  },
  sauce_bbq: {
    id: 'sauce_bbq',
    name: '烤味酱',
    category: 'sauce',
    thickness: 0.1,
    sink: 0.015,
    price: 1,
    kcal: 55,
    repeat: true,
    color: '#8B4A2E',
    renderable: true,
    geometry: 'sauce',
    nameRoot: '烤味',
    description: '烟熏感十足，配板烧最对',
  },
  sauce_ketchup: {
    id: 'sauce_ketchup',
    name: '番茄酱',
    category: 'sauce',
    thickness: 0.1,
    sink: 0.015,
    price: 0.8,
    kcal: 30,
    repeat: true,
    color: '#CC3220',
    renderable: true,
    geometry: 'sauce',
    description: '经典红，酸甜平衡',
  },
  sauce_mustard: {
    id: 'sauce_mustard',
    name: '芥末酱',
    category: 'sauce',
    thickness: 0.1,
    sink: 0.015,
    price: 0.8,
    kcal: 35,
    repeat: true,
    color: '#E7C246',
    renderable: true,
    geometry: 'sauce',
    description: '一点点冲，鳕鱼堡的灵魂',
  },
  sauce_mustard_salad: {
    id: 'sauce_mustard_salad',
    name: '芥末沙拉酱',
    category: 'sauce',
    thickness: 0.1,
    sink: 0.015,
    price: 1,
    kcal: 52,
    repeat: true,
    color: '#E3D07A',
    renderable: true,
    geometry: 'sauce',
    description: '芥末的冲被奶香压住，双层牛堡的标配',
  },
  sauce_big: {
    id: 'sauce_big',
    name: '巨无霸酱',
    category: 'sauce',
    thickness: 0.1,
    sink: 0.015,
    price: 1,
    kcal: 50,
    repeat: true,
    color: '#E8C477',
    renderable: true,
    geometry: 'sauce',
    description: '酸甜带一丝咸，豪放地抹两圈',
  },

  /* ───────────── 配菜 ───────────── */
  bacon: {
    id: 'bacon',
    name: '培根',
    category: 'side',
    thickness: 0.16,
    sink: 0.015,
    price: 4,
    kcal: 90,
    repeat: true,
    color: '#C2492F',
    renderable: true,
    geometry: 'bacon',
    nameRoot: '培根',
    description: '煎到卷边，咸香油脂全出来了',
  },
  hashbrown: {
    id: 'hashbrown',
    name: '薯饼',
    category: 'side',
    thickness: 0.21,
    sink: 0.015,
    price: 3,
    kcal: 140,
    repeat: true,
    color: '#DFB25E',
    renderable: true,
    geometry: 'hashbrown',
    nameRoot: '薯饼',
    description: '外脆内糯，夹进汉堡是隐藏吃法',
  },
};

/** 左栏 Tab 顺序 */
export const CATEGORIES: { id: IngredientCategory; name: string; hint: string }[] = [
  { id: 'bread', name: '面包', hint: '底座与封顶' },
  { id: 'patty', name: '肉排', hint: '一份汉堡的主角' },
  { id: 'veg', name: '蔬菜', hint: '脆、酸、辛' },
  { id: 'cheese', name: '芝士', hint: '叠起来最疯的一样' },
  { id: 'sauce', name: '酱料', hint: '风味的方向盘' },
  { id: 'side', name: '配菜', hint: '夹进汉堡的隐藏吃法' },
];

/** 堆叠时的排序优先级（生成官方配方默认序列用） */
export const CATEGORY_STACK_ORDER: Record<IngredientCategory, number> = {
  bread: 0,
  patty: 1,
  cheese: 2,
  veg: 3,
  side: 4,
  sauce: 5,
};

export const ing = (id: string): Ingredient | undefined => INGREDIENTS[id];

export const ingName = (id: string): string => INGREDIENTS[id]?.name ?? id;

/** 价格格式化：整数不带小数，其余保留一位 */
export function formatPrice(n: number): string {
  const v = Math.round(n * 10) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** 本地估算：价格 / 热量 / 层数 */
export function totals(ids: string[]) {
  let price = 0;
  let kcal = 0;
  for (const id of ids) {
    const it = INGREDIENTS[id];
    if (!it) continue;
    price += it.price;
    kcal += it.kcal;
  }
  return { price: Math.round(price * 10) / 10, kcal, count: ids.length };
}
