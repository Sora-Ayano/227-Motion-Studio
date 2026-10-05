# 渲染与物理设置

“场景 → 高级渲染”选择方案，会同时设置灯光和材质响应；“画面滤镜”只改变后期色调，可独立选择。

- **冷光夜舞台**：低环境补光、冷主光与紫色轮廓光，低曝光、少量泛光和反射地面。
- **花映暖柔光**：暖主光、冷补光、柔化明暗过渡，控制白色高光，适合明亮花景。
- **二次元粉嫩**：中性樱粉主光、淡蓝补光、樱粉轮廓光；低泛光和高光压缩，避免人物发白。

“环境与布料材质”支持本地 HDR/EXR、反射强度、反射地面、薄雾、衣服高光及粗糙度。PBR 场景和导入材质使用环境反射；原生 Toon 保留原阴影贴图和明暗过渡，并接收柔化灯具照明及布面高光。原游戏灯具的颜色、位置、方向和范围保留；烘焙灯具提供受限的动态补光，避免重复叠加过曝。

花瓣、雪、萤火和星光采用一个 GPU Points 绘制。时间来自动画轨道，不依赖实际播放速度；同一随机种子在跳转和离线渲染时得到同一画面。最多 1200 个粒子，默认关闭。绿幕保留纯绿色；开启粒子时它们属于前景，会出现在导出中。

“转换”面板的接触精度、布料类型、自碰撞、配饰接触、肢体约束、摩擦和厚度分别调节。高精度更慢，建议最终离线输出使用；过大碰撞厚度会把裙面撑开，不能只靠加大厚度解决穿模。实现边界见 [开发状态](STATUS.md)。

## 技术参考

- Three.js [MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)、[PMREMGenerator](https://threejs.org/docs/pages/PMREMGenerator.html)、[Reflector](https://threejs.org/docs/pages/Reflector.html)：材质、环境预过滤及反射。
- [XPBD](https://matthias-research.github.io/pages/publications/XPBD.pdf)、[Small Steps](https://matthias-research.github.io/pages/publications/smallsteps.pdf)：柔顺性约束与时间步方法。
- [Ten Minute Physics: self collision](https://matthias-research.github.io/pages/tenMinutePhysics/15-selfCollision.html)：空间哈希与布料接触思路；没有复制其源码。
- Unity [Lightmap 技术说明](https://docs.unity3d.com/cn/2021.3/Manual/Lightmaps-TechnicalInformation.html)：dLDR / RGBM 解码。
- MediaPipe [Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js)：本地 21 点手部检测。
