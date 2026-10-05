# Unity 原生桌面版

原生源码位于 [desktop 分支](https://github.com/Sora-Ayano/227-Motion-Studio/tree/desktop)，Web 源码继续维护于 main。

## 当前版本

`0.4.0-preview.1` 是原生引擎的早期预览版，不是 Web 编辑器的完整功能迁移。Unity 2022.3 LTS 通过 Direct3D 11 渲染，C# 管理编辑器，HLSL Compute 执行布料原型，未使用 Electron。

已经实现：本地角色/服装/贴图、五人上场和位置设置、原游戏舞蹈/相机及音频、舞台与原生灯光、原游戏背景图片和本地图片替换舞台、柔光和布料材质、HDR 泛光、四个渲染风格、粒子、简单骨骼关键帧、原生工程 JSON 保存、PNG 与固定帧率 1080p / 60 fps MP4、GitHub 手动更新检查与下载入口。

尚未迁移：通用 GLB/FBX/PMX 与 VMD 导入和完整重定向、视频动捕推理、多种分辨率/视频混音、完整表情和相机轨道编辑、模型导出、自定义配饰编辑、完整时间轴与撤销。检测模型和原始配饰资源在完整安装包中，但原生版尚无对应编辑或推理界面。这些功能目前继续使用 main 分支 Web 版。

GPU 布料原型处理受裙摆骨骼影响的顶点、邻接长度约束、腿和脚胶囊碰撞、阻尼与有限风力，并限制相对原动作的偏移。它不是完整布料解算器，尚未提供完整自碰撞、撕裂或发丝求解，极端姿势仍可能穿模；可单独关闭。实际性能取决于显卡、模型和多人数量，不保证 60 fps。

## 安装

从 [Releases](https://github.com/Sora-Ayano/227-Motion-Studio/releases) 下载同一版本的 `Setup.exe` 和所有 `Setup-*.bin`，放在同一个文件夹，运行 EXE。GitHub 每个附件限制 2 GiB，完整素材必须使用分卷。安装位置可选，默认安装到当前用户 Programs 目录。

运行不需要单独浏览器、Unity 编辑器或预装 Node/Python。完整包保留本地角色、服装、贴图、舞台、动作、歌曲和四个 MediaPipe 权重及转换/编码工具；不包含作者私人素材、个人工程、配置、日志、浏览器档案和调试符号。首次启动保持深色背景；GPU 信息显示在底部。

工程、图片和视频均使用系统保存对话框，每次可指定位置。原生工程目前与 Web 工程不同，不能宣称可以完整互导。源码更新不会直接替换 Unity 可执行程序；点击 GitHub 更新检查后下载新版安装包。安装覆盖前请保存工程。

## 构建

安装 Unity 2022.3 LTS 和 Windows Build Support，遵循 Unity 引擎许可。原创 C# / HLSL 源码为 MIT。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-native.ps1 -UnityExe "<Unity.exe>" -OutputDirectory "<player-folder>"
```

脚本从已安装编辑器复制其 Newtonsoft.Json 库，依赖 DLL 和 Unity Library/Temp/UserSettings 不随源码发布。

完整包由经过检查的便携素材包与编译好的 Unity Player 组成：

```sh
python tools/build-native-package.py --base <audited-portable-folder> --player <player-folder> --output <native-package-folder>
```

使用官方 Inno Setup 编译 `desktop-unity/installer.iss`，指定 PayloadDir、OutputDir 和 AppVersion。构建器检查相对文件路径、隐私、校验和，并排除 PDB/MDB 调试符号。不要把作者本机日志或缓存当成源码发布。

`--diagnostics` 参数在本机缓存生成 GPU 报告与截图，不上传任何诊断内容。
