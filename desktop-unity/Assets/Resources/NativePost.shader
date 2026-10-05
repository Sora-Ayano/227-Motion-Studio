Shader "22-7 Native/Post" {Properties{_MainTex("Image",2D)="white"{} _Glow("Glow",2D)="black"{}} SubShader{Cull Off ZWrite Off ZTest Always Pass{CGPROGRAM
 #pragma vertex vert_img
 #pragma fragment frag
 #include "UnityCG.cginc"
 sampler2D _MainTex,_Glow;float4 _MainTex_TexelSize;float2 _Direction;float _Mode,_Bloom,_Exposure;float3 _Tint;
 float4 frag(v2f_img i):SV_Target{float3 c=tex2D(_MainTex,i.uv).rgb;if(_Mode<.5){float l=max(c.r,max(c.g,c.b));return float4(c*max(0,l-.85)/max(l,.0001),1);}if(_Mode<1.5){float2 d=_Direction*_MainTex_TexelSize.xy;return float4(c*.227027+(tex2D(_MainTex,i.uv+d*1.384615).rgb+tex2D(_MainTex,i.uv-d*1.384615).rgb)*.316216+(tex2D(_MainTex,i.uv+d*3.230769).rgb+tex2D(_MainTex,i.uv-d*3.230769).rgb)*.070270,1);}c=(c+tex2D(_Glow,i.uv).rgb*_Bloom)*_Exposure*_Tint;c=c/(1+c*.32);return float4(c,1);}
 ENDCG}}}
