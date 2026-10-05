# 22/7 Motion Studio

**【22/7】 通用MMD/Unity模型编辑器**

项目仓库：[Sora-Ayano/227-Motion-Studio](https://github.com/Sora-Ayano/227-Motion-Studio)。功能状态见 [开发状态](docs/STATUS.md)。

## 功能

- 导入 GLB、glTF、FBX、PMX 及贴图；识别 Unity Humanoid、MMD、Mixamo 等常见人形骨骼，支持手工修正映射及源 PMX 静止姿态校准。
- 保留原生骨架，适配 VMD；身体、表情、相机与音频独立导入、编辑、清除和保存。
- 时间轴关键帧添加、删除、移动与数值编辑，支持撤销、重做、任意位置播放、30 / 60 fps。
- 本地角色组件库、服装与配饰预览；五人编队、中心主角、独立换装、角色位置编辑与重置。
- 本地背景和舞台资源、舞台灯光、环境补光、光照柔化、描边、泛光、景深与多种滤镜；预览支持绿幕与全屏。
- 裙摆布料约束与腿部碰撞、头发、领带和飘带等辅助骨骼动态。物理求解有明确边界，见下方说明。
- 内置 **MediaPipe Pose Heavy / Full** 与 **Face / Hand Landmarker**，在工作线程中处理本地视频，输出人体骨骼与面部表情关键帧；支持自动 GPU / CPU 选择。
- 导出带贴图及自定义配饰的 GLB、PMX 模型包、Unity 模型包与原生骨骼动画 JSON，以及 VMD、PNG、WebM、MP4。
- MP4 采用固定时间逐帧输出，支持 NVIDIA NVENC、CPU 编码与 1 / 2 / 4 帧流水线，横屏、竖屏、方形及 1080p / 2K / 4K，可选择是否合成音频。
- 每次保存可选择文件位置；可从编辑器关闭当前本地服务。

## 0.3.1 更新

- 恢复原版 22/7 页头标识和网站图标。
- 泛光改用低分辨率分离卷积；时间轴缓存静态关键帧，减少播放时的重复绘制。
- 流畅模式自动调整预览分辨率，逐帧导出仍使用指定分辨率；WebGL 优先选择高性能 GPU。

真实音乐生成全身舞蹈的候选方案及适配边界见 [AI 编舞](docs/AI_CHOREOGRAPHY.md)。当前规则试作仍不等于生成式 AI 编舞。

## 0.3.0 更新

- 新增冷光夜舞台、花映暖柔光和二次元粉嫩渲染方案。实际灯光、环境反射、布料材质、反射地面、薄雾与独立后期可调；舞台柔光进入角色材质。
- 新增花瓣、雪、萤火、星光 GPU 粒子，可设置数量、大小、颜色、速度、范围与种子，保存和逐帧导出保持一致。
- 手部本地检测模型、五人物分配、自定义表情通道；动捕中心位移和场景放置旋转适配修复。
- 布料自碰撞、多层接触、摩擦、配饰/衣服接触和可选肢体约束；PMX 基础刚体与弹簧关节。
- Unity 2022.3 Built-in 导入器和渲染已实际验证；修复无骨骼脸部的表情导出。新增标准/PBR 舞台材质适配。
- 手动 GitHub 正式 Release 更新检查、源码下载、备份和重启；保留个人工程、配置和素材。

渲染方案设置见 [渲染与物理](docs/RENDERING.md)，完成情况和具体边界见 [开发状态](docs/STATUS.md)。极端穿模、多人遮挡和实时 60 fps 仍有明确限制。音乐编舞目前是本地节拍/歌词试作，尚未内置训练好的生成舞蹈模型。

## 快速开始

建议使用 Windows、Node.js 22 或以上版本，以及启用硬件加速的 Chrome / Edge。

```sh
npm ci
npm start
```

打开终端显示的本机地址。Windows 也可双击 `启动.cmd`；首次使用仍需先安装 Node.js 并执行 `npm ci`。

**首次启动不需要游戏原包或个人素材。** 没有本地资源库时，编辑器显示标准 Unity 人形骨架，可直接导入自己的模型与动作。公共人体、面部与手部模型已经随源码包提供；安装 npm 依赖后，推理无需联网。

MP4 导出需要本地 [FFmpeg](https://ffmpeg.org/download.html)，安装后将其加入 PATH，或在 `config.local.json` 的 `ffmpeg` 字段指定可执行文件。自动模式会实际探测 `h264_nvenc`；不可用时使用 CPU。FFmpeg 不包含在源码包中。

可选的 Unity 资源转换器需要 Python 3.10+：

```sh
python -m pip install -r requirements.txt
```

复制 `config.example.json` 为 `config.local.json`，按需设置本地资源位置。个人配置、原始素材、资源索引、缓存与导出文件均不进入源码仓库。详见 [本地资源配置](docs/LOCAL_RESOURCES.md)。

## 常用流程

1. 导入模型及相关贴图，或选择自己的本地角色库；检查“转换”面板的关节映射。
2. 导入 VMD 或原生动作，单独导入相机、音频；需要时导入源 PMX 来校准动作的静止骨架。
3. 在“轨道”面板选择通道，添加或删除关键帧、修改数值；保存工程保留编辑内容。
4. 设置场景、灯光、物理强度和滤镜。编辑时自由观察，播放 / 镜头预览时使用相机轨道。
5. 从“导出”选择格式、视频分辨率、帧率、音频和编码器，再指定保存位置。

视频动捕在“转换 → 视频动作提取”：选择 Heavy 或 Full，选择人体、人体与面部、仅面部，再提取。仅面部模式保留现有身体动作。模型没有某个关节或表情时，不会生成不存在的目标通道；缺少的关节需要补充或修正映射。人体长度、关节静止轴向和已有骨骼层级参与适配。

## 导出性能与物理边界

提供 NVIDIA 硬件编码。

## 项目结构

```text
server.mjs              本机服务、资源读取、保存与视频导出接口
web/                    编辑器界面与浏览器代码
web/core/               骨骼适配、相机、关键帧、渲染、物理与动捕
web/models/             公共 MediaPipe 模型与校验清单
web/unity-package/      Unity 模型包导入器与 Shader
tools/                  可复用的本机启动、转换和编码工具
docs/                   配置说明与开发状态
licenses/               第三方许可证
config.example.json     可公开的通用默认配置
```

## 开源项目与技术来源

感谢下列项目！

| 项目 | 使用方式 | 许可证 |
| --- | --- | --- |
| [Three.js](https://github.com/mrdoob/three.js) | WebGL 渲染、模型载入器、OrbitControls、OutlineEffect、GLTFExporter | MIT |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe) | Tasks Vision、WASM、本地人体及面部模型 | Apache-2.0 |
| [mmd-parser](https://github.com/takahirox/mmd-parser) | PMX 解析；本项目补充 UTF-8 文本读取 | MIT |
| [fflate](https://github.com/101arrowz/fflate) | 模型与贴图 ZIP 打包 | MIT |
| [UnityPy](https://github.com/K0lb3/UnityPy) | 可选的 Unity AssetBundle 读取与资源转换 | MIT |
| [NumPy](https://github.com/numpy/numpy) | 可选转换器的坐标和绑定矩阵计算 | BSD-3-Clause |
| [FFmpeg](https://ffmpeg.org/) | 外部 MP4 / AAC 编码及音视频合成 | LGPL / GPL，取决于所用构建；不随源码分发 |
| [reze-mipo](https://github.com/AmyangXYZ/reze-mipo) | 视频姿态驱动角色的流程参考 | GPL-3.0 |
| [reze-studio](https://github.com/AmyangXYZ/reze-studio) / [reze.studio](https://reze.studio/) | 网页动作工作区及编辑流程参考 | 仓库 GPL-3.0 |

详细的第三方声明、模型卡和修改说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。布料约束实现参考 [XPBD](https://matthias-research.github.io/pages/publications/XPBD.pdf) 与 [Small Steps in Physics Simulation](https://mmacklin.com/smallsteps.pdf) 的公开技术方法。

## 许可证与素材

编辑器源码按 [MIT](LICENSE) 发布，第三方代码和 AI 模型遵循各自许可证。
