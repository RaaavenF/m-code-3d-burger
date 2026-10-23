'use client';

import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import * as THREE from 'three';
import { INGREDIENTS } from '@/lib/ingredients';
import type { StackLayer } from '@/types/burger';
import { IngredientMesh } from './IngredientMesh';

/** 下落起始高度（世界单位，面包半径 = 1） */
const DROP_HEIGHT = 3.2;

interface Props {
  layer: StackLayer;
  /** 挂载时是否播放入场动画。历史层重排时传 false */
  animate?: boolean;
}

/**
 * 单层食材
 *
 * 三层结构是整套动画能成立的关键：
 *
 *   <group position-y={baseY}>   静态锚点，随重排直接跳位
 *     <group ref={animRef}>      唯一被 GSAP 操纵的对象
 *       <IngredientMesh />       几何体底面在本地 y=0
 *
 * 因为几何体底面就在 y=0，animRef.scale.y 压缩时底面不动，
 * 视觉上是「砸下去被压扁」，而不是「整体缩小」。
 *
 * 动画只在挂载时播一次（deps 为空）。
 * 若跟着 props 重播，撤销一层后新的末层会莫名其妙再砸一次。
 */
export function IngredientLayer({ layer, animate = true }: Props) {
  const animRef = useRef<THREE.Group>(null);
  const ing = INGREDIENTS[layer.ingredientId];

  useEffect(() => {
    const g = animRef.current;
    if (!g || !animate) return;

    // 连续快速点击时错开，避免所有层同步砸下变成一坨
    const delay = Math.min(layer.index, 7) * 0.045;

    const tl = gsap.timeline({ delay });

    tl
      // ① 自由落体：加速下落
      .fromTo(
        g.position,
        { y: DROP_HEIGHT },
        { y: 0, duration: 0.42, ease: 'power2.in' },
      )
      // ② 触地压扁：Y 收、XZ 胀，读起来像「体积守恒」
      .to(g.scale, { x: 1.08, y: 0.82, z: 1.08, duration: 0.09, ease: 'power2.out' })
      // ③ 回弹过冲
      .to(g.scale, { x: 0.97, y: 1.06, z: 0.97, duration: 0.14, ease: 'sine.out' })
      // ④ 落定：弹性缓动收尾
      .to(g.scale, { x: 1, y: 1, z: 1, duration: 0.24, ease: 'elastic.out(1, 0.4)' });

    return () => {
      tl.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ing) return null;

  return (
    <group position-y={layer.baseY}>
      <group ref={animRef}>
        <IngredientMesh ingredient={ing} />
      </group>
    </group>
  );
}
