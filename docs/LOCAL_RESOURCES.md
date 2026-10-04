# 本地资源配置

公共源码包可以独立启动，不包含游戏、个人媒体或工程文件。

## 默认导入

在网页中导入模型、贴图、动作、相机、音频和背景。模型以本地资源编号保存到 `assets/imported/`。

## 配置文件

服务先读取 `config.example.json`，再读取可选的 `config.json`、`config.local.json`。相同字段以后者为准。所有相对位置以项目根目录为基准。个人配置不会提交。

| 字段 | 含义 |
| --- | --- |
| `port` | 本机服务端口，可通过环境变量 `STUDIO_PORT` 覆盖 |
| `assetRoot` | 本地资源目录，默认 `assets` |
| `motionRoot` | 自动扫描 VMD / 音频的目录 |
| `ffmpeg` | FFmpeg 可执行文件；留空时自动使用 PATH 或本地 runtime |
| `python` | 可选转换器的 Python 命令 |
| `gameRoot` | 可选 Unity 原包 / AssetBundle 根目录 |
| `catalogDatabase` | 可选资源映射数据库 |
| `masterRoot` | 可选角色 / 服装配置表目录 |
| `unityPyVendor` | 可选 Python 依赖目录；安装到正常 Python 环境时可保持默认 |

服务只监听本机回环接口，不提供互联网托管或远程文件写入功能。请通过网页提供的导入与保存界面操作。

## 预转换的个人资源库

已有个人资源包可在本机放置以下内容。下面只定义通用目录结构，不附带个人资源包。

```text
cache/catalog.json                 角色、组件编号、计数与可用状态
cache/components/                  转换后的组件 model.json 与贴图
web/data/motions.json               VMD 与音频索引
web/data/game-motions.json          原生身体 / 表情动作索引
web/data/game-cameras.json          独立相机索引
web/data/game-layouts.json          原生歌曲站位及相机挂点元数据
web/data/game-audio.json            有舞蹈歌曲的音频索引
web/data/stages.json                舞台与背景索引
web/game-motions/                   原生动画与压缩帧数据
web/game-cameras/                   相机数据
web/stages/                        舞台数据与贴图
web/audio/                         本地音频
web/motions/                       本地 VMD
```
