Shader "22-7 Native/SoftToon" {
 Properties {_MainTex("Base",2D)="white"{} _ShadowTex("Shade",2D)="white"{} _RampTex("Ramp",2D)="white"{} _Color("Color",Color)=(1,1,1,1) _Ambient("Fill",Range(0,1))=.2 _Softness("Softness",Range(0,1))=.7 _Sheen("Fabric sheen",Range(0,1))=.2 _UseRamp("Ramp enabled",Float)=0 _Cull("Cull",Float)=2 _GPUCloth("GPU cloth",Float)=0}
 SubShader {Tags{"RenderType"="Opaque"} Cull [_Cull]
 CGPROGRAM
 #pragma target 4.5
 #pragma surface surf Soft fullforwardshadows vertex:vert addshadow
 #include "UnityCG.cginc"
 sampler2D _MainTex,_ShadowTex,_RampTex;float4 _Color;float _Ambient,_Softness,_Sheen,_UseRamp,_GPUCloth;
 #if defined(SHADER_API_D3D11)
 StructuredBuffer<float3> _GarmentOffsets;
 #endif
 struct appdata {float4 vertex:POSITION;float3 normal:NORMAL;float4 tangent:TANGENT;float4 texcoord:TEXCOORD0;float4 texcoord1:TEXCOORD1;float4 texcoord2:TEXCOORD2;float4 color:COLOR;uint id:SV_VertexID;};
 struct Input {float2 uv_MainTex;float3 viewDir;};
 void vert(inout appdata v){
 #if defined(SHADER_API_D3D11)
 if(_GPUCloth>.5)v.vertex.xyz+=mul((float3x3)unity_WorldToObject,_GarmentOffsets[v.id]);
 #endif
 }
 struct SurfaceOutputSoft {fixed3 Albedo;fixed3 Normal;fixed3 Emission;half Specular;fixed Gloss;fixed Alpha;fixed3 Shade;};
 void surf(Input i,inout SurfaceOutputSoft o){fixed4 base=tex2D(_MainTex,i.uv_MainTex)*_Color;clip(base.a-.01);o.Albedo=base.rgb;o.Shade=max(tex2D(_ShadowTex,i.uv_MainTex).rgb*_Color.rgb,base.rgb*.48);o.Alpha=base.a;o.Emission=base.rgb*_Ambient*.16;}
 half4 LightingSoft(SurfaceOutputSoft s,half3 lightDir,half3 viewDir,half atten){float light=dot(s.Normal,lightDir)*.5+.5;float ramp=smoothstep(lerp(.36,.18,_Softness),lerp(.64,.82,_Softness),light);ramp=lerp(ramp,tex2D(_RampTex,float2(light,light)).r,_UseRamp*.55);float grazing=pow(1-saturate(dot(s.Normal,viewDir)),3);half3 color=lerp(s.Shade,s.Albedo,ramp)*_LightColor0.rgb*atten+s.Albedo*grazing*_Sheen*.055;return half4(color,s.Alpha);}
 ENDCG
 }
 Fallback "Diffuse"
}
