Shader "22-7 Studio/Toon" {
 Properties { _MainTex("Base",2D)="white"{} _ShadowTex("Shade",2D)="white"{} _RampTex("Toon Ramp",2D)="white"{} _UseRamp("Use Ramp",Float)=0 _Color("Color",Color)=(1,1,1,1) _Cull("Cull",Float)=2 _Softness("Light softness",Range(0,1))=.6 _Ambient("Environment fill",Range(0,1))=.19 _Sheen("Fabric sheen",Range(0,1))=0 _Roughness("Fabric roughness",Range(.15,1))=.75 _RimColor("Rim color",Color)=(.8,.8,1,1) _Rim("Rim strength",Range(0,.3))=.025 }
 SubShader { Tags { "RenderType"="Opaque" } Cull [_Cull]
  Pass { Tags { "LightMode"="ForwardBase" }
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "UnityCG.cginc"
   #include "Lighting.cginc"
   sampler2D _MainTex,_ShadowTex,_RampTex;float4 _Color,_RimColor;float _UseRamp,_Softness,_Ambient,_Sheen,_Roughness,_Rim;
   struct v2f { float4 pos:SV_POSITION;float2 uv:TEXCOORD0;float3 normal:TEXCOORD1;float3 world:TEXCOORD2; };
   v2f vert(appdata_base v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.uv=v.texcoord;o.normal=UnityObjectToWorldNormal(v.normal);o.world=mul(unity_ObjectToWorld,v.vertex).xyz;return o;}
   fixed4 frag(v2f i):SV_Target {fixed4 base=tex2D(_MainTex,i.uv)*_Color;clip(base.a-.01);float3 normal=normalize(i.normal),view=normalize(_WorldSpaceCameraPos-i.world),direction=normalize(_WorldSpaceLightPos0.xyz);float light=dot(normal,direction)*.5+.5;float ramp=lerp(smoothstep(.35,.65,light),tex2D(_RampTex,float2(light,light)).r,_UseRamp);ramp=lerp(ramp,smoothstep(.15,.85,light),_Softness);ramp=lerp(ramp,1,_Ambient);fixed3 shade=max(tex2D(_ShadowTex,i.uv).rgb*_Color.rgb,base.rgb*.42);float grazing=pow(1-max(0,dot(normal,view)),2);float spec=pow(max(0,dot(normal,normalize(direction+view))),lerp(90,7,_Roughness));float3 color=lerp(shade,base.rgb*lerp(float3(1,1,1),_LightColor0.rgb,.5),ramp)+base.rgb*_Sheen*(grazing*.1+spec*.08)+_RimColor.rgb*_Rim*grazing;return fixed4(color,base.a);}
   ENDCG
  }
 }
}
