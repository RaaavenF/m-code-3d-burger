'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  /** 汉堡总高度，由 buildStack 算出 */
  totalHeight: number;
}

/**
 * 相机自适应
 *
 * 目标：汉堡从 3 层叠到 15 层时自动后退并抬高焦点，
 *      但绝不覆盖用户已经转好的方位角。
 *
 * 三个容易踩的坑：
 *  1. 不能用固定插值系数。0.1 在 30fps 和 120fps 设备上速度差 4 倍，
 *     所以用 1 - exp(-k·dt)，与帧率无关。
 *  2. 不能每帧算 atan2/acos。只在高度变化时重算目标，其余帧只做 lerp。
 *  3. 不能永远写 camera.position。OrbitControls 自己也在写，
 *     持续双写会抖。所以设一个 ~1.2s 的「沉降窗口」，窗口结束就交还控制权。
 */
export function CameraRig({ totalHeight }: Props) {
  const camera = useThree(s => s.camera);
  const controls = useThree(s => s.controls) as any;

  const want = useRef({ focusY: 0.9, dist: 5 });
  const settleUntil = useRef(0);

  useEffect(() => {
    const focusY = Math.max(0.5, totalHeight * 0.5); // 视觉重心略高于几何中心
    // 基准距离 5.0：汉堡宽度（约 2.2）占画面的 75% 左右，既不空旷也不顶边。
    // 斜率只留 0.55，层数变多时缓慢后退，不能让用户觉得「越堆越小」。
    const dist = THREE.MathUtils.clamp(5.0 + totalHeight * 0.55, 5.0, 10);
    want.current = { focusY, dist };
    settleUntil.current = performance.now() + 1200;
  }, [totalHeight]);

  useFrame((_, dt) => {
    if (!controls || performance.now() > settleUntil.current) return;

    const target = controls.target as THREE.Vector3;
    const { focusY, dist } = want.current;

    // 分解出球坐标，保留方位角，只重算半径与俯仰范围
    const offset = camera.position.clone().sub(target);
    const len = offset.length() || 1;
    const azimuth = Math.atan2(offset.x, offset.z);
    // 与 OrbitControls 的夹持区间保持一致，否则每帧都会被夹回来、看起来在抽
    const polar = THREE.MathUtils.clamp(Math.acos(offset.y / len), 0.95, 1.13);

    const desired = new THREE.Vector3(
      Math.sin(azimuth) * Math.sin(polar),
      Math.cos(polar),
      Math.cos(azimuth) * Math.sin(polar),
    )
      .multiplyScalar(dist)
      .add(new THREE.Vector3(0, focusY, 0));

    // 帧率无关的指数平滑
    const k = 1 - Math.exp(-6 * Math.min(dt, 0.1));
    camera.position.lerp(desired, k);
    target.y += (focusY - target.y) * k;
    controls.update();
  });

  return null;
}
