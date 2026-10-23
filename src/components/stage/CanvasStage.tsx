'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { stackHeight } from '@/lib/stack';
import { BurgerStack } from './BurgerStack';
import { CameraRig } from './CameraRig';

interface Props {
  ids: string[];
  animate?: boolean;
}

export function CanvasStage({ ids, animate = true }: Props) {
  const height = useMemo(() => stackHeight(ids), [ids]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      // 背景交给 CSS 的暖色径向渐变：WebGL 里画不出「中心亮、四周暗」的渐变背景，
      // 硬塞一张渐变贴图又会被色调映射吃掉。给 canvas 透明，舞台就是一块干净的奶油色。
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 2.9, 5.0], fov: 34, near: 0.1, far: 100 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        // 1.12 那版把食材全推到了高光的肩膀上：生菜变成白薄荷、
        // 芝士变成一张亮黄纸。压到 1.0 附近，中间调才留得住颜色。
        gl.toneMappingExposure = 1.0;
      }}
      style={{ touchAction: 'none' }}
    >
      {/* 灯光：主光从右前上方打下来，暖色补光让面包有烘焙感。
          背景是浅色，所以地面反弹要亮，否则食材底面会闷成黑边。
           hemisphere 从 1.15 收到 0.92 —— 环境光太强时所有食材都变成
           没有明暗的色块，看起来像贴了一层不干胶。 */}
      <hemisphereLight args={['#FFFBF0', '#F3DCC0', 0.92]} />
      <directionalLight
        position={[4.5, 8, 4]}
        intensity={1.95}
        color="#FFF4DE"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-near={0.5}
        shadow-camera-far={22}
        shadow-bias={-0.0008}
      />
      <directionalLight position={[-5, 3, -4]} intensity={0.42} color="#FFC79B" />
      <spotLight position={[0, 7.5, 1.5]} angle={0.72} penumbra={0.9} intensity={0.5} color="#FFFFFF" />

      {/* 不用「盘子」——一块比背景亮的圆垫会在浅色背景上变成一块灰色的洞，
          反而把汉堡圈在中间。只留一层接触阴影，汉堡就站在光里。 */}
      <ContactShadows
        position={[0, 0.002, 0]}
        opacity={0.34}
        scale={7}
        blur={2.6}
        far={3.6}
        resolution={512}
        color="#7A5230"
      />

      <BurgerStack ids={ids} animate={animate} />

      {/* 这里原来有一圈「盖子会盖在这里」的黄色提示环。
          它在最上层食材的顶面上画了个圆，看起来只是凭空多出一个圈 ——
          信息量几乎为零，却抢了整座汉堡的注意力。删掉。 */}

      <CameraRig totalHeight={height} />

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping={false}
        minDistance={3.4}
        maxDistance={11}
        // 俯仰夹在 55°–65°（自天顶算）＝ 25°–35° 的观测仰角。
        // 上一版给到 28°–41°，抬得太高：镜头几乎在往面包顶上俯视，
        // 圆顶占掉了画面一半，夹层全被压成一条缝。
        // 压低 6° 之后，侧壁露出来，8 层才读得出是 8 层。
        minPolarAngle={0.95}
        maxPolarAngle={1.13}
        target={[0, 0.55, 0]}
      />
    </Canvas>
  );
}
