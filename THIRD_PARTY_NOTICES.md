# Third-party notices

## Project license

The original implementation of **22/7 Motion Studio** is copyright (c) 2026 Sora-Ayano and is distributed under the [MIT license](LICENSE). Third-party components retain the licenses and copyright notices identified below. The project license does not relicense those components or user-imported assets.

## Runtime dependencies

- **Three.js**, copyright Three.js authors, MIT. Used for rendering, model loaders, controls, outlines and GLB export. [Source](https://github.com/mrdoob/three.js), [license](licenses/Three-MIT.txt).
- **MediaPipe Tasks Vision**, copyright Google LLC, Apache-2.0. Used for local landmark inference and WASM. [Source](https://github.com/google-ai-edge/mediapipe), [license](licenses/MediaPipe-APACHE-2.0.txt).
- **mmd-parser**, copyright 2016 Takahiro, MIT. `web/lib/mmdparser.mjs` is derived from the npm module; `tools/prepare-vendor.mjs` adds UTF-8 PMX text decoding and preserves the original license header. [Source](https://github.com/takahirox/mmd-parser), [license](licenses/mmd-parser-MIT.txt).
- **fflate**, copyright Arjun Barrett, MIT. Used for ZIP packaging. [Source](https://github.com/101arrowz/fflate), [license](licenses/fflate-MIT.txt).

npm installs the unmodified dependency packages. Their notices remain with those packages.

## Desktop and full installer

- **Unity**, proprietary engine: [Unity](https://unity.com/). The native player is compiled using the installed Unity editor. Its engine binaries retain Unity's licensing; the project MIT license covers the original C# / HLSL implementation only.
- **Newtonsoft.Json**, MIT: [source and license](https://github.com/JamesNK/Newtonsoft.Json). Copied from the installed editor for native JSON loading; upstream copyright and MIT notice are retained.
- **Node.js**, MIT and bundled dependency notices: [official source](https://github.com/nodejs/node). Included in the full installer, with its upstream license files.
- **Python**, PSF license and third-party notices: [official source](https://www.python.org/). The embeddable runtime and its license are included in the full installer.
- The full installer also includes the external **FFmpeg** executable and its build-specific GPL notices and source download references. This is separate from the source distribution, which does not bundle it. Bundled game assets retain their original licenses and are not relicensed by MIT.
- **Inno Setup** is used only as the official build tool: [source and license](https://github.com/jrsoftware/issrc). Its compiler is not bundled in the editor. The installer contains its setup runtime.

## Bundled public AI models

Google MediaPipe model bundles are distributed unmodified in `web/models`. Exact versioned download URLs, sizes and SHA-256 hashes are recorded in `manifest.json`. All use Apache-2.0, as identified in the model cards:

- Pose Heavy and Full: [BlazePose GHUM 3D model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf).
- Face detector: [BlazeFace model card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf).
- Face mesh: [Face Mesh V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf).
- Hands: [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker), 21 hand landmarks; Apache-2.0 model bundle, exact URL and checksum in the manifest.
- Facial expression predictor: [Blendshape V2 model card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf).

[Apache-2.0 license](licenses/MediaPipe-APACHE-2.0.txt). These are landmark and expression models, not identity recognition or semantic activity classifiers.

## Optional external tools

- **UnityPy**, copyright K0lb3 and contributors, MIT: [source and license](https://github.com/K0lb3/UnityPy). The Python converter uses its asset readers and mesh helpers. The package is installed separately.
- **NumPy**, BSD-3-Clause: [source and license](https://github.com/numpy/numpy). Installed separately for conversion matrices.
- **FFmpeg**: [source](https://ffmpeg.org/), [license information](https://ffmpeg.org/legal.html). It is invoked as an external executable and is not bundled. Builds using libx264 commonly use GPL; each executable's own license applies.
- **NVIDIA NVENC** is the installed GPU driver's hardware encoder interface. No NVIDIA SDK or driver binary is distributed here. [FFmpeg integration documentation](https://docs.nvidia.com/video-technologies/video-codec-sdk/13.1/ffmpeg-with-nvidia-gpu/index.html).

## Workflow references

[AmyangXYZ/reze-mipo](https://github.com/AmyangXYZ/reze-mipo), [AmyangXYZ/reze-studio](https://github.com/AmyangXYZ/reze-studio) and [reze.studio](https://reze.studio/) inspired video-to-avatar and browser animation workflows. Both repositories carry GPL-3.0 licenses. Their source files are not copied or bundled as dependencies in this distribution.

The project implements cloth constraints with reference to the published [XPBD method](https://matthias-research.github.io/pages/publications/XPBD.pdf) and [Small Steps in Physics Simulation](https://mmacklin.com/smallsteps.pdf). No third-party cloth engine binary or implementation is bundled.

Game and personal assets are not part of the source distribution. Original asset providers retain their respective rights; the editor's license does not license those assets.
