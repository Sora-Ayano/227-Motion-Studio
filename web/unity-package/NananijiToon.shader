Shader "22-7 Studio/Toon" {
 Properties { _MainTex("Base",2D)="white"{} _ShadowTex("Shade",2D)="white"{} _RampTex("Toon Ramp",2D)="white"{} _UseRamp("Use Ramp",Float)=0 _Color("Color",Color)=(1,1,1,1) _Cull("Cull",Float)=2 }
 SubShader { Tags { "RenderType"="Opaque" } Cull [_Cull]
  Pass { Tags { "LightMode"="ForwardBase" }
   CGPROGRAM
   #pragma vertex vert
   #pragma fragment frag
   #include "UnityCG.cginc"
   #include "Lighting.cginc"
   sampler2D _MainTex,_ShadowTex,_RampTex;float4 _Color;float _UseRamp;
   struct v2f { float4 pos:SV_POSITION;float2 uv:TEXCOORD0;float3 normal:TEXCOORD1; };
   v2f vert(appdata_base v){v2f o;o.pos=UnityObjectToClipPos(v.vertex);o.uv=v.texcoord;o.normal=UnityObjectToWorldNormal(v.normal);return o;}
   fixed4 frag(v2f i):SV_Target {fixed4 base=tex2D(_MainTex,i.uv)*_Color;clip(base.a-.01);float light=dot(normalize(i.normal),normalize(_WorldSpaceLightPos0.xyz))*.5+.5;fixed3 shade=max(tex2D(_ShadowTex,i.uv).rgb*_Color.rgb,base.rgb*.55);return fixed4(lerp(shade,base.rgb,lerp(smoothstep(.35,.65,light),tex2D(_RampTex,float2(light,light)).r,_UseRamp)),base.a);}
   ENDCG
  }
 }
}
