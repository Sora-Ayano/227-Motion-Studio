#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEditor;

// Copy this file into Assets/Editor. Select the assembled original Unity prefab
// root, then import the Studio's Unity animation JSON from the Tools menu.
public static class NananijiAnimationImporter
{
    [Serializable] class Track { public string name, family; public float[] times, positions, quaternions; }
    [Serializable] class Morph { public string mesh, name; public float[] times, weights; }
    [Serializable] class Motion { public string format, name, coordinateSystem; public int version; public float fps, duration; public Track[] tracks; public Morph[] morphs; }
    [MenuItem("Tools/22-7 Studio/Import Native Animation")]
    public static void Import()
    {
        var root = Selection.activeTransform;
        if (root == null) { EditorUtility.DisplayDialog("22/7 Studio", "先选中已组装角色的根节点。", "确定"); return; }
        var source = EditorUtility.OpenFilePanel("选择 Unity 骨骼动画 JSON", "", "json");
        if (string.IsNullOrEmpty(source)) return;
        var destination = EditorUtility.SaveFilePanelInProject("保存原生动画", "22-7-motion", "anim", "保存 AnimationClip");
        if (string.IsNullOrEmpty(destination)) return;
        Selection.activeObject = ImportAsset(root, source, destination);
    }
    public static AnimationClip ImportAsset(Transform root, string source, string destination)
    {
        var motion = JsonUtility.FromJson<Motion>(File.ReadAllText(source));
        if (root == null || motion == null || motion.format != "nananiji-unity-animation" || motion.version != 1 || motion.tracks == null) throw new InvalidDataException("不是 22/7 Studio Unity 动画 JSON。");
        var clip = new AnimationClip { name = motion.name, frameRate = motion.fps, legacy = false };
        var all = root.GetComponentsInChildren<Transform>(true);
        foreach (var track in motion.tracks)
        {
            var matches = track.family == "root" ? new[] { root } : all.Where(t => t.name == track.name).ToArray();
            if (matches.Length > 1 && !string.IsNullOrEmpty(track.family)) matches = matches.Where(t => Family(t, root, track.family)).ToArray();
            if (matches.Length != 1) { Debug.LogWarning("22/7 Studio: 跳过缺失或重名骨骼 " + track.family + "/" + track.name); continue; }
            string path = AnimationUtility.CalculateTransformPath(matches[0], root);
            if (track.positions != null) for (int axis = 0; axis < 3; axis++) Curve(clip, path, typeof(Transform), "m_LocalPosition." + "xyz"[axis], track.times, track.positions, 3, axis);
            if (track.quaternions != null) for (int axis = 0; axis < 4; axis++) Curve(clip, path, typeof(Transform), "m_LocalRotation." + "xyzw"[axis], track.times, track.quaternions, 4, axis);
        }
        foreach (var morph in motion.morphs ?? new Morph[0])
        {
            // Unity may rename a saved Mesh asset to its asset filename. The node
            // name is the stable mesh identifier shared by both Studio exports.
            var candidates = root.GetComponentsInChildren<SkinnedMeshRenderer>(true).Where(r => r.sharedMesh != null && (r.transform.name == morph.mesh || r.sharedMesh.name == morph.mesh || r.transform.name.EndsWith("_" + morph.mesh) || r.sharedMesh.name.EndsWith("_" + morph.mesh)) && r.sharedMesh.GetBlendShapeIndex(morph.name) >= 0).ToArray();
            var mesh = candidates.Length == 1 ? candidates[0] : null;
            if (mesh == null) { Debug.LogWarning("22/7 Studio: 缺少表情 " + morph.mesh + "/" + morph.name); continue; }
            Curve(clip, AnimationUtility.CalculateTransformPath(mesh.transform, root), typeof(SkinnedMeshRenderer), "blendShape." + morph.name, morph.times, morph.weights, 1, 0);
        }
        clip.EnsureQuaternionContinuity();
        AssetDatabase.CreateAsset(clip, destination); AssetDatabase.SaveAssets(); Selection.activeObject = clip;
        Debug.Log("22/7 Studio: 已导入 " + motion.name + "，" + motion.duration + " 秒。");
        return clip;
    }
    static bool Family(Transform node, Transform root, string family) { for(var p = node; p != null && p != root; p = p.parent) if(p.name == family) return true; return false; }
    static void Curve(AnimationClip clip, string path, Type type, string property, float[] times, float[] values, int stride, int axis)
    {
        if (times == null || values.Length != times.Length * stride) throw new InvalidDataException("动画关键帧数组长度不符。");
        var keys = new Keyframe[times.Length];
        for (int i = 0; i < times.Length; i++) keys[i] = new Keyframe(times[i], values[i * stride + axis]);
        var curve = new AnimationCurve(keys);
        for (int i = 0; i < keys.Length; i++) { AnimationUtility.SetKeyLeftTangentMode(curve, i, AnimationUtility.TangentMode.Linear); AnimationUtility.SetKeyRightTangentMode(curve, i, AnimationUtility.TangentMode.Linear); }
        clip.SetCurve(path, type, property, curve);
    }
}
#endif
