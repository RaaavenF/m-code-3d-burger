'use client';

import { useMemo } from 'react';
import { buildStack } from '@/lib/stack';
import { IngredientLayer } from './IngredientLayer';

interface Props {
  /** 从下到上的食材 ID 序列 */
  ids: string[];
  /** 是否播放入场动画（快速点单载入时 true，从购物车恢复时 false） */
  animate?: boolean;
}

/**
 * 整座汉堡
 *
 * 只负责把 layers 铺开，不持有任何状态。
 * baseY 由 lib/stack 的累加算法给出，组件本身不知道「第几层该多高」。
 */
export function BurgerStack({ ids, animate = true }: Props) {
  const { layers } = useMemo(() => buildStack(ids), [ids]);

  return (
    <group>
      {layers.map(layer => (
        <IngredientLayer key={layer.uid} layer={layer} animate={animate} />
      ))}
    </group>
  );
}
