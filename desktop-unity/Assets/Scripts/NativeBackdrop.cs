using System;using System.IO;using UnityEngine;
namespace MotionStudio {
 // A camera-facing quad close to the far plane stays behind the actors.
 public class NativeBackdrop:MonoBehaviour {
  public Texture2D image;public string source;Material material;GameObject quad;
  public void Set(string file,string savedSource){var texture=new Texture2D(2,2,TextureFormat.RGBA32,false);if(!texture.LoadImage(File.ReadAllBytes(file))){Destroy(texture);throw new Exception("无法读取背景图片");}Clear();image=texture;source=savedSource;quad=GameObject.CreatePrimitive(PrimitiveType.Quad);quad.name="Picture background";Destroy(quad.GetComponent<Collider>());quad.transform.SetParent(transform,false);material=material??new Material(Shader.Find("Unlit/Texture"));material.mainTexture=image;quad.GetComponent<Renderer>().sharedMaterial=material;quad.GetComponent<Renderer>().shadowCastingMode=UnityEngine.Rendering.ShadowCastingMode.Off;}
  public void Clear(){if(quad)Destroy(quad);quad=null;if(image)Destroy(image);image=null;source=null;}
  void LateUpdate(){Refresh();}
  public void Refresh(){if(!image||!quad)return;var camera=GetComponent<Camera>();float z=camera.farClipPlane*.85f,aspect=(float)image.width/image.height,h=camera.orthographic?camera.orthographicSize*2:2*z*Mathf.Tan(camera.fieldOfView*Mathf.Deg2Rad*.5f),w=h*camera.aspect;float fit=Mathf.Min(w/image.width,h/image.height);quad.transform.localPosition=new Vector3(0,0,z);quad.transform.localScale=new Vector3(image.width*fit,image.height*fit,1);}
  void OnDestroy(){Clear();if(material)Destroy(material);}
 }
}
