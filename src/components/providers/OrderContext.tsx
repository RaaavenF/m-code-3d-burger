'use client';

import { createContext, useContext, useMemo, useReducer } from 'react';
import { buildStack, canAdd } from '@/lib/stack';
import { totals as sumTotals } from '@/lib/ingredients';
import type { CartItem, DiyStatus, MatchResult, StackLayer } from '@/types/burger';

interface State {
  ids: string[];
  status: DiyStatus;
  match: MatchResult | null;
  customName: string;
  cart: CartItem[];
  /**
   * 每次「载入官方配方」自增。
   * 作为 <BurgerStack key={stackKey}> 的 key，强制整座汉堡重新挂载，
   * 从而让所有层重新播一次落体动画 —— 快速点单的仪式感就靠它。
   */
  stackKey: number;
}

type Action =
  | { type: 'ADD'; id: string }
  | { type: 'UNDO' }
  | { type: 'CLEAR' }
  | { type: 'FINISH'; match: MatchResult; name: string }
  | { type: 'RESET' }
  | { type: 'LOAD_RECIPE'; layers: string[] }
  | { type: 'ADD_TO_CART'; item: CartItem }
  | { type: 'REMOVE_FROM_CART'; uid: string };

const initial: State = {
  // 台面上永远有一片下层面包 —— 它是工作台的一部分，不是用户加的一层。
  // 若从空数组开始，既看不见底座，配方比对时又会永远「缺下层面包片」。
  ids: ['bun_bottom'],
  status: 'idle',
  match: null,
  customName: '',
  cart: [],
  stackKey: 0,
};

function statusFromMatch(match: MatchResult): DiyStatus {
  switch (match.kind) {
    case 'exact':
    case 'sameParts':
      return 'win';
    case 'near':
      return 'near';
    default:
      return 'custom';
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD': {
      if (!canAdd(state.ids, action.id)) return state;
      // 封顶之后再点食材 = 「揭开盖子加一层」。
      // 必须先把 bun_top 摘掉再追加，否则它会永远留在序列里，
      // 「完成并封顶」的判定（!ids.includes('bun_top')）就再也过不去，
      // 按钮变成永久禁用的「再放一层就能封顶」。
      const base = state.ids.filter(id => id !== 'bun_top');
      const ids = [...base, action.id];
      return { ...state, ids, status: 'stacking', match: null };
    }

    case 'UNDO': {
      // 保留底座：少于 2 层时不允许再撤销
      if (state.ids.length <= 1) return state;
      const ids = state.ids.slice(0, -1);
      const onlyBase = ids.length <= 1;
      return { ...state, ids, status: onlyBase ? 'idle' : 'stacking', match: null };
    }

    case 'CLEAR':
      return { ...state, ids: ['bun_bottom'], status: 'idle', match: null, customName: '' };

    case 'FINISH':
      return {
        ...state,
        // 封顶：把上层面包真正加进层序列，3D 舞台才会播那一下扣下来的动画。
        // 只算匹配结果不加层，用户会看到「已完成」但汉堡没盖盖。
        ids: state.ids.includes('bun_top') ? state.ids : [...state.ids, 'bun_top'],
        status: statusFromMatch(action.match),
        match: action.match,
        customName: action.name,
      };

    case 'RESET':
      return { ...state, ids: ['bun_bottom'], status: 'idle', match: null, customName: '' };

    case 'LOAD_RECIPE':
      return {
        ...state,
        ids: action.layers,
        status: 'stacking',
        match: null,
        customName: '',
        stackKey: state.stackKey + 1,
      };

    case 'ADD_TO_CART':
      return { ...state, cart: [...state.cart, action.item] };

    case 'REMOVE_FROM_CART':
      return { ...state, cart: state.cart.filter(c => c.uid !== action.uid) };

    default:
      return state;
  }
}

interface OrderApi {
  state: State;
  dispatch: React.Dispatch<Action>;
  layers: StackLayer[];
  height: number;
  totals: { price: number; kcal: number; count: number };
  cartTotal: number;
}

const Ctx = createContext<OrderApi | null>(null);

export function OrderProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  const layout = useMemo(() => buildStack(state.ids), [state.ids]);
  const totals = useMemo(() => sumTotals(state.ids), [state.ids]);
  const cartTotal = useMemo(
    () => Math.round(state.cart.reduce((s, c) => s + c.price, 0) * 10) / 10,
    [state.cart],
  );

  const value = useMemo<OrderApi>(
    () => ({
      state,
      dispatch,
      layers: layout.layers,
      height: layout.height,
      totals,
      cartTotal,
    }),
    [state, dispatch, layout, totals, cartTotal],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrder(): OrderApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOrder 必须在 <OrderProvider> 内使用');
  return v;
}
