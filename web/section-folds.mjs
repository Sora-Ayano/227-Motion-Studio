export function foldSections(panel,state,key,changed){
 let content;for(const node of [...panel.children]){
  if(node.matches('.section-head')){const title=node.querySelector('h2')?.textContent||'设置',details=document.createElement('details'),summary=document.createElement('summary');details.className='scene-section';details.dataset.title=title;details.open=state[key]?.[title]!==true;summary.textContent=title;content=document.createElement('div');content.className='scene-section-content';for(const child of [...node.children])if(child.tagName!=='H2')content.append(child);details.append(summary,content);panel.insertBefore(details,node);node.remove();details.addEventListener('toggle',()=>{state[key]??={};if(state[key][title]===!details.open)return;state[key][title]=!details.open;changed();});}else if(content)content.append(node);
 }
 return ()=>{for(const details of panel.querySelectorAll(':scope > details'))details.open=state[key]?.[details.dataset.title]!==true;};
}
