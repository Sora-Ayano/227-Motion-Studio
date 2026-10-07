const $=id=>document.getElementById(id);
export function initBlenderWorkflow(h){
 const {state,changed,download,fail}=h,panel=$('retargetPanel'),head=[...panel.children].find(el=>el.querySelector('h2')?.textContent==='一键布料与渲染');
 if(!head)return;
 head.querySelector('h2').textContent='Blender 制作流程';
 const nodes=[];let next=head.nextElementSibling;while(next&&!next.matches('.section-head')){nodes.push(next);next=next.nextElementSibling;}
 const flow=document.createElement('div');flow.className='blender-workflow';flow.innerHTML=`<ol class="blender-steps" aria-label="Blender 制作步骤">${['准备场景','布料与柔光','逐帧渲染','保存视频'].map((name,i)=>`<li data-step="${i}"><span class="step-number">${i+1}</span><strong>${name}</strong><small>待开始</small></li>`).join('')}</ol><p id="blenderSceneSummary" class="hint"></p><label class="checkbox-field"><input id="blenderFixedView" type="checkbox">固定当前视角拍摄</label><p class="hint">1 先选择角色、歌曲和舞台。固定视角会使用当前透视视图；取消勾选可使用已导入的镜头。</p><div id="blenderSettings"></div><div class="blender-output-settings"><label>分辨率<select id="blenderResolution"></select></label><label>帧率<select id="blenderFPS"><option value="30">30 fps</option><option value="60">60 fps</option></select></label><label class="checkbox-field"><input id="blenderSound" type="checkbox">包含音乐</label></div><progress id="blenderWorkflowBar" max="1" value="0" class="full"></progress><p id="blenderWorkflowStatus" role="status">准备好后，一键解算预览或直接导出完整视频。</p><button id="saveBlenderAgain" class="full" disabled>另存已渲染的视频</button><p class="hint">4 渲染完成后选择保存目录；再次另存无需重新渲染。</p><details id="blenderBakeDetails"><summary>布料预览范围与缓存</summary></details>`;
 head.after(flow);for(const node of nodes)$('blenderSettings').append(node);
 const bake=$('blenderBakePanel');if(bake)$('blenderBakeDetails').append(bake);
 const resolutions=$('videoResolution');for(const option of resolutions.options)$('blenderResolution').add(new Option(option.textContent,option.value));
 for(const [own,source]of [['blenderResolution','videoResolution'],['blenderFPS','outputFPS']])$(own).onchange=()=>{$(source).value=$(own).value;$(source).dispatchEvent(new Event('change',{bubbles:true}));};
 $('blenderSound').onchange=()=>{$('mp4IncludeAudio').checked=$('blenderSound').checked;changed();};
 $('blenderFixedView').onchange=()=>{$('enableCamera').checked=!$('blenderFixedView').checked;state.previewCamera=false;$('enableCamera').dispatchEvent(new Event('change',{bubbles:true}));};
 $('saveBlenderAgain').onclick=async()=>{try{if(!state.lastBlenderRender)return;const saved=await download(state.lastBlenderRender,'22-7-blender.mp4','video/mp4');if(saved)state.blenderProgress={status:'completed',done:1,total:1};refresh();}catch(e){fail(e);}};
 function refresh(){
  const mirror=$('videoBlenderSteps');if(mirror){if(!mirror.children.length)mirror.append(flow.querySelector('.blender-steps').cloneNode(true));mirror.hidden=$('videoRenderer').value==='web';}
  const progress=state.blenderProgress||{},ready=!!state.model,phase=progress.status||'idle',fraction=progress.total?Math.max(0,Math.min(1,progress.done/progress.total)):0;
  $('blenderSceneSummary').textContent=(state.profile?.name||'请选择角色')+' · '+(state.motion?.name||'静止姿态')+' · '+(state.duration/30).toFixed(1)+' 秒';
  $('blenderResolution').value=$('videoResolution').value;$('blenderFPS').value=$('outputFPS').value;$('blenderSound').checked=$('mp4IncludeAudio').checked;$('blenderFixedView').checked=!$('enableCamera').checked;
  const encoded=['saving','completed'].includes(phase),rendered=encoded||phase==='encoding',inRender=['rendering','encoding','saving','completed'].includes(phase),clothReady=rendered||phase==='preview-ready';
  const labels=[ready?'已选择角色与场景':'请选择角色',clothReady?'已完成':phase==='preview'||inRender?'随帧解算':phase==='sampling'?'采样中':'可预览或直接导出',rendered?'已完成':phase==='rendering'?Math.round(fraction*100)+'%':phase==='encoding'?'合成 MP4':'待渲染',phase==='completed'?'已保存':phase==='saving'?'请选择保存位置':'待保存'];
  const done=[ready,clothReady,rendered,phase==='completed'],working=[false,['preview','rendering'].includes(phase),['sampling','rendering','encoding'].includes(phase),phase==='saving'];
  document.querySelectorAll('.blender-steps li').forEach(step=>{const i=Number(step.dataset.step);step.classList.toggle('is-done',done[i]);step.classList.toggle('is-working',working[i]);step.querySelector('small').textContent=labels[i];});
  $('blenderWorkflowBar').value=['completed','saving','encoding','preview-ready'].includes(phase)?1:['rendering','preview','sampling'].includes(phase)?fraction:0;
  $('blenderWorkflowStatus').textContent=progress.message||({idle:'准备好后，一键解算预览或直接导出完整视频。',sampling:'正在收集骨架、表情、舞台和固定镜头…',preview:'正在解算布料预览…','preview-ready':'布料预览已返回网页，可自由跳转时间轴。',rendering:'Blender 布料与渲染 · '+(progress.done||0)+' / '+(progress.total||0)+' 帧',encoding:'所有帧已完成，正在合成视频和音乐。',saving:'视频已渲染完成，请选择保存位置。',completed:'视频已保存，全部步骤完成。',cancelled:'已停止；工程保留。',failed:'任务失败，请查看错误提示。'}[phase]||'准备场景');
  $('saveBlenderAgain').disabled=!state.lastBlenderRender||state.recording;
 }
 const timer=setInterval(refresh,750);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});refresh();return {refresh};
}
