# 22/7 Motion Studio · Unity Native

这是原生桌面版的早期预览项目，不使用 Electron 或浏览器渲染。Unity C# 管理编辑器，Direct3D 11 执行蒙皮、Toon 光照、HDR 后期和 HLSL Compute 衣服碰撞原型。

请使用 Unity 2022.3 LTS 与 Windows Build Support。运行 `tools/build-native.ps1` 时指定本机 Unity.exe 和输出目录；脚本从已安装的 Unity 编辑器复制 Newtonsoft.Json 到本地插件目录，该 DLL 不随源码提交。项目场景由 `BuildStudio.Build` 自动生成。完整素材通过独立安装包提供，源码中不包含游戏资源。

首版可载入角色与服装、原游戏舞蹈和相机、舞台，支持五人模式、位置设置、简单骨骼关键帧、柔光与材质、HDR 泛光、粒子、原生工程保存、图片与固定帧率视频导出。完整迁移状态、尚未迁移的 Web 功能和物理边界见 [桌面版说明](../docs/DESKTOP.md)。

GPU 求解器采用每顶点邻接位置约束和腿/脚胶囊碰撞，并约束相对原动画的最大偏移。这是原型，不是完整有限元布料或通用自碰撞解算器；不保证消除极端穿模。缺少 Compute 支持时应关闭此原型，保留原游戏骨骼动画。

作者：Sora-Ayano。原创源码为 MIT；Unity 引擎与第三方组件使用各自许可。
