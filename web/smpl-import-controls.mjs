import {parseSMPLMotion,parseSMPLNPY,retargetSMPLMotion} from './core/smpl-motion.mjs';
const $=id=>document.getElementById(id);
export function initSMPLImport(h){
 const {state}=h;
 $('retargetPanel').insertAdjacentHTML('beforeend',`<div class="section-head"><h2>AI 骨骼动作</h2></div><p class="hint">导入已生成的 SMPL24 / FACT 身体动作。镜头与音乐继续使用当前工程。此处不包含编舞模型或权重。</p><button id="importSMPL" class="full">导入 AI 骨骼动作</button><div class="background-position"><label>源帧率<select id="smplFPS"><option value="auto">自动 · 文件信息</option><option value="60">60 fps · FACT</option><option value="30">30 fps</option><option value="15">15 fps</option></select></label><label>源绑定姿势<select id="smplRest"><option value="auto">自动 · 文件信息</option><option value="t-pose">标准 T 姿势 · 自动匹配</option><option value="bind">与目标绑定姿势一致</option></select></label></div><label class="field">源坐标系<select id="smplCoordinates"><option value="auto">自动 · 文件信息</option><option value="y-up-z-forward">SMPL · Y 向上 / +Z 向前</option><option value="y-up-negative-z-forward">Y 向上 / −Z 向前</option><option value="z-up-y-forward">Z 向上 / +Y 向前</option><option value="mmd">MMD 坐标</option></select></label><p id="smplStatus" class="hint">支持数值 .npy 或 SMPL24 .json；起始位置对齐当前角色。</p>`);
 const input=document.createElement('input');input.type='file';input.accept='.npy,.json';input.hidden=true;document.body.append(input);$('importSMPL').onclick=()=>{if(state.recording){h.fail(new Error('请等待当前导出结束'));return;}input.click();};
 input.onchange=async()=>{const file=input.files[0];if(!file)return;try{
  if(!state.model)throw new Error('先载入角色模型');if(file.size>128*1048576)throw new Error('动作文件超过 128 MB');await h.togglePlay(false);h.setLoading(true,'正在匹配 AI 动作与角色骨骼…');
  const options={fps:$('smplFPS').value==='auto'?undefined:Number($('smplFPS').value),coordinateSystem:$('smplCoordinates').value==='auto'?undefined:$('smplCoordinates').value},parsed=/\.npy$/i.test(file.name)?parseSMPLNPY(await file.arrayBuffer(),options):parseSMPLMotion(JSON.parse(await file.text()),options);
  const result=retargetSMPLMotion(state.model,parsed,{name:file.name,rootMode:'relative',restPose:$('smplRest').value==='auto'?undefined:$('smplRest').value});h.pushHistory();
  result.motion.morphs=state.motion?.morphs||{};state.motion=result.motion;state.edits={bones:result.edits.bones,morphs:state.edits?.morphs||{}};state.duration=Math.max(1,Math.ceil(result.motion.duration));h.refreshMotion();h.setFrame(0);h.changed();h.report();
  const d=result.diagnostics;$('smplStatus').textContent=`已导入 ${d.frames} 帧 · 适配 ${d.mappedJoints} 个关节 · 行进范围 ${d.rootRangeMeters.map(n=>n.toFixed(2)).join(' / ')} 米。${d.warnings.join(' ')}`;h.toast('AI 骨骼动作已导入，可编辑关键帧并保存工程或 VMD');
 }catch(error){h.fail(error);}finally{input.value='';h.setLoading(false);}};
}
