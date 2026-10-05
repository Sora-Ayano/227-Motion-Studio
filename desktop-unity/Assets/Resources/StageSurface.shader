Shader "22-7 Native/StageSurface" {Properties{_MainTex("Base",2D)="white"{} _Color("Color",Color)=(1,1,1,1) _Cull("Cull",Float)=2 _SrcBlend("Src",Float)=5 _DstBlend("Dst",Float)=10 _ZWrite("Depth",Float)=0} SubShader{Tags{"Queue"="Transparent" "RenderType"="Transparent"} Cull [_Cull] Blend [_SrcBlend] [_DstBlend] ZWrite [_ZWrite] Pass{CGPROGRAM
 #pragma vertex vert
 #pragma fragment frag
 #include "UnityCG.cginc"
 sampler2D _MainTex;float4 _MainTex_ST,_Color;struct v2f{float4 position:SV_POSITION;float2 uv:TEXCOORD0;};v2f vert(appdata_base v){v2f o;o.position=UnityObjectToClipPos(v.vertex);o.uv=TRANSFORM_TEX(v.texcoord,_MainTex);return o;}fixed4 frag(v2f i):SV_Target{return tex2D(_MainTex,i.uv)*_Color;}
 ENDCG}}}
