#if UNITY_EDITOR
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
public static class NananijiModelImporter {
 [Serializable] public class Model { public string format,name; public int version; public Node[] nodes; public MeshData[] meshes; }
 [Serializable] public class Node { public string name; public int parent; public float[] position,quaternion,scale; public bool active; }
 [Serializable] public class MeshData { public int node; public float[] vertices,normals,uv,skinWeight; public int[] bones,skinIndex; public MatrixData[] bindposes; public Submesh[] submeshes; public Morph[] morphs; }
 [Serializable] public class MatrixData { public float[] values; }
 [Serializable] public class Submesh { public int[] indices; public MaterialData material; }
 [Serializable] public class MaterialData { public string name,texture,shadow,ramp; public float[] color; public int cull; }
 [Serializable] public class Morph { public string name; public float[] deltas; }
 static Vector3 V(float[] a,int i=0) { return new Vector3(a[i],a[i+1],a[i+2]); }
 static Texture2D Texture(string folder,string name) { if(string.IsNullOrEmpty(name))return null;string path=folder+"/"+name;var importer=AssetImporter.GetAtPath(path) as TextureImporter;if(importer!=null){importer.textureType=TextureImporterType.Default;importer.sRGBTexture=!name.Contains("ramp");importer.wrapMode=TextureWrapMode.Repeat;importer.SaveAndReimport();}return AssetDatabase.LoadAssetAtPath<Texture2D>(path); }
 [MenuItem("22-7 Studio/Import selected model")]
 public static void Import() {
  string path=AssetDatabase.GetAssetPath(Selection.activeObject);if(!path.EndsWith("model.unity.json")){EditorUtility.DisplayDialog("22/7 Studio","请选中 model.unity.json","确定");return;}
  Selection.activeObject=ImportAsset(path);
 }
 public static GameObject ImportAsset(string path) {
  Model doc=JsonUtility.FromJson<Model>(File.ReadAllText(path));Validate(doc);string folder=Path.GetDirectoryName(path).Replace('\\','/'),outdir=AssetDatabase.GenerateUniqueAssetPath(folder+"/Generated");AssetDatabase.CreateFolder(folder,Path.GetFileName(outdir));
  Transform[] nodes=doc.nodes.Select(n=>new GameObject(n.name).transform).ToArray();for(int i=0;i<nodes.Length;i++){Node n=doc.nodes[i];if(n.parent>=0)nodes[i].SetParent(nodes[n.parent],false);nodes[i].localPosition=V(n.position);nodes[i].localRotation=new Quaternion(n.quaternion[0],n.quaternion[1],n.quaternion[2],n.quaternion[3]);nodes[i].localScale=V(n.scale);nodes[i].gameObject.SetActive(n.active);}
  int count=0;foreach(MeshData d in doc.meshes){Mesh mesh=new Mesh();mesh.name=nodes[d.node].name;mesh.indexFormat=IndexFormat.UInt32;mesh.vertices=Enumerable.Range(0,d.vertices.Length/3).Select(i=>V(d.vertices,i*3)).ToArray();if(d.normals.Length==d.vertices.Length)mesh.normals=Enumerable.Range(0,d.normals.Length/3).Select(i=>V(d.normals,i*3)).ToArray();mesh.uv=Enumerable.Range(0,d.uv.Length/2).Select(i=>new Vector2(d.uv[i*2],d.uv[i*2+1])).ToArray();mesh.subMeshCount=d.submeshes.Length;for(int i=0;i<d.submeshes.Length;i++)mesh.SetTriangles(d.submeshes[i].indices,i);
   if(d.bones.Length>0){mesh.boneWeights=Enumerable.Range(0,d.vertices.Length/3).Select(i=>new BoneWeight{boneIndex0=d.skinIndex[i*4],boneIndex1=d.skinIndex[i*4+1],boneIndex2=d.skinIndex[i*4+2],boneIndex3=d.skinIndex[i*4+3],weight0=d.skinWeight[i*4],weight1=d.skinWeight[i*4+1],weight2=d.skinWeight[i*4+2],weight3=d.skinWeight[i*4+3]}).ToArray();mesh.bindposes=d.bindposes.Select(a=>{Matrix4x4 m=new Matrix4x4();for(int j=0;j<16;j++)m[j]=a.values[j];return m;}).ToArray();}
   else if(d.morphs.Length>0){mesh.boneWeights=Enumerable.Range(0,d.vertices.Length/3).Select(i=>new BoneWeight{boneIndex0=0,weight0=1}).ToArray();mesh.bindposes=new[]{Matrix4x4.identity};}
   foreach(Morph morph in d.morphs)mesh.AddBlendShapeFrame(morph.name,100,Enumerable.Range(0,d.vertices.Length/3).Select(i=>V(morph.deltas,i*3)).ToArray(),null,null);if(d.normals.Length==0)mesh.RecalculateNormals();mesh.RecalculateBounds();AssetDatabase.CreateAsset(mesh,outdir+"/mesh_"+count+".asset");
   Renderer renderer;if(d.bones.Length>0||d.morphs.Length>0){var skin=nodes[d.node].gameObject.AddComponent<SkinnedMeshRenderer>();skin.sharedMesh=mesh;skin.bones=d.bones.Length>0?d.bones.Select(i=>nodes[i]).ToArray():new[]{nodes[d.node]};skin.rootBone=d.bones.Length>0?nodes[0]:nodes[d.node];skin.updateWhenOffscreen=true;renderer=skin;}else{nodes[d.node].gameObject.AddComponent<MeshFilter>().sharedMesh=mesh;renderer=nodes[d.node].gameObject.AddComponent<MeshRenderer>();}
   renderer.sharedMaterials=d.submeshes.Select((sub,i)=>{var m=new Material(Shader.Find("22-7 Studio/Toon")??Shader.Find("Unlit/Texture"));m.name=sub.material.name;m.SetTexture("_MainTex",Texture(folder,sub.material.texture));m.SetTexture("_ShadowTex",Texture(folder,string.IsNullOrEmpty(sub.material.shadow)?sub.material.texture:sub.material.shadow));m.SetTexture("_RampTex",Texture(folder,sub.material.ramp));m.SetFloat("_UseRamp",string.IsNullOrEmpty(sub.material.ramp)?0:1);m.SetColor("_Color",new Color(sub.material.color[0],sub.material.color[1],sub.material.color[2],sub.material.color[3]));m.SetFloat("_Cull",sub.material.cull);AssetDatabase.CreateAsset(m,outdir+"/material_"+count+"_"+i+".mat");return m;}).ToArray();count++;
  }PrefabUtility.SaveAsPrefabAsset(nodes[0].gameObject,outdir+"/Model.prefab");UnityEngine.Object.DestroyImmediate(nodes[0].gameObject);AssetDatabase.SaveAssets();return AssetDatabase.LoadAssetAtPath<GameObject>(outdir+"/Model.prefab");
 }
 public static void Validate(Model doc) {
  if(doc==null||doc.format!="nananiji-unity-model"||doc.version!=1||doc.nodes==null||doc.nodes.Length==0||doc.meshes==null)throw new InvalidDataException("不是兼容的 22/7 模型包。");
  for(int i=0;i<doc.nodes.Length;i++){var n=doc.nodes[i];if(n.parent>=i||n.parent< -1||n.position==null||n.position.Length!=3||n.quaternion==null||n.quaternion.Length!=4||n.scale==null||n.scale.Length!=3)throw new InvalidDataException("模型节点或层级无效。");}
  foreach(var d in doc.meshes){if(d.node<0||d.node>=doc.nodes.Length||d.vertices==null||d.vertices.Length%3!=0||d.submeshes==null||d.bones==null||d.bindposes==null||d.morphs==null)throw new InvalidDataException("网格数组无效。");int count=d.vertices.Length/3;
   if(d.bones.Length!=d.bindposes.Length||d.bones.Any(i=>i<0||i>=doc.nodes.Length))throw new InvalidDataException("骨骼或绑定矩阵无效。");
   if(d.bones.Length>0&&(d.skinIndex.Length!=count*4||d.skinWeight.Length!=count*4||d.skinIndex.Any(i=>i<0||i>=d.bones.Length)))throw new InvalidDataException("蒙皮权重数组无效。");
   foreach(var m in d.submeshes)if(m.indices.Length%3!=0||m.indices.Any(i=>i<0||i>=count))throw new InvalidDataException("三角面索引无效。");
   foreach(var m in d.morphs)if(m.deltas.Length!=d.vertices.Length)throw new InvalidDataException("表情顶点数组无效。");
  }
 }
}
#endif
