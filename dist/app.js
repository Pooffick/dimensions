import {pixelsPerReference, validScale, measurementLabel, formatValue, measurementsCsv} from './measurement.mjs';
const $ = id => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), viewport = $('viewport');
const defaults = {label:'',autoLabel:true,font:'Arial',textWeight:400,fontSize:28,textPosition:'above',offset:64,width:2,color:'#2563eb',textDx:0,textDy:0};
let arrows = [], selected = null, image = null, filename = '', zoom = 1, tool = 'select', drag = null, pan = null;
let history = [], future = [], serial = 0, toastTimer, loadSerial = 0;
const active = () => arrows.find(a => a.id === selected);
let scale = {source:'cm',distance:1,real:100,unit:'µm',dpi:96};
function refreshLabels(){for(const a of arrows)if(a.autoLabel)a.label=measurementLabel(a,scale);}
const snapshot = () => JSON.stringify({arrows,selected,scale});
function remember() { history.push(snapshot()); if(history.length > 80) history.shift(); future = []; }
function restore(value) { const state = JSON.parse(value); arrows = state.arrows; selected = state.selected; scale = state.scale; sync(); render(); }
function undo() { if(!history.length)return; future.push(snapshot()); restore(history.pop()); }
function redo() { if(!future.length)return; history.push(snapshot()); restore(future.pop()); }
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3600); }
function setTool(value) { tool = value; $('select-tool').classList.toggle('active',value === 'select'); $('arrow-tool').classList.toggle('active',value === 'arrow'); $('select-tool').setAttribute('aria-pressed',value === 'select'); $('arrow-tool').setAttribute('aria-pressed',value === 'arrow'); viewport.classList.toggle('drawing',value !== 'select'); $('calibrate').setAttribute('aria-pressed',value === 'calibrate'); canvas.style.cursor=value==='select'?'default':'crosshair'; $('tool-hint').textContent = !image ? 'Начните с изображения' : value === 'calibrate' ? 'Проведите отрезок известной длины' : value === 'arrow' ? 'Проведите от начала до конца размера' : 'Перетаскивайте стрелку и её маркеры'; }
function sync() {
  refreshLabels();
  for(const [id,key] of Object.entries({'scale-distance':'distance','scale-source':'source','scale-real':'real','scale-unit':'unit','scale-dpi':'dpi'})) { $(id).value=scale[key]; $(id).removeAttribute('aria-invalid'); }
  $('dpi-field').hidden=scale.source!=='cm';
  $('scale-summary').textContent=`${formatValue(scale.distance)} ${scale.source==='cm'?'см':'px'} = ${formatValue(scale.real)} ${scale.unit} · 1 px = ${formatValue(scale.real/pixelsPerReference(scale))} ${scale.unit}`;
  $('scale-error').hidden=true;
  const a = active(), style = a || defaults;
  for(const [id,key] of Object.entries({label:'label',font:'font','font-size':'fontSize','text-position':'textPosition',offset:'offset','offset-number':'offset',width:'width',color:'color'})) $(id).value = style[key];
  $('width-value').value = style.width;
  $('text-weight').value=style.textWeight || (style.bold?700:400);
  $('auto-label').checked=style.autoLabel;
  $('label').readOnly=style.autoLabel;
  $('label-help').textContent=style.autoLabel?'Длина отрезка рассчитывается по масштабу. Выноска и увеличение просмотра не влияют на размер.':'Ручная подпись: автоматический пересчёт для этой стрелки выключен.';
  document.querySelectorAll('.swatch').forEach(b => {b.classList.toggle('selected',b.dataset.color === style.color);b.setAttribute('aria-pressed',b.dataset.color === style.color);});
  for(const k of ['x1','y1','x2','y2']) {$(k).disabled = !a; $(k).value = a ? Math.round(a[k]) : '';}
  for(const k of ['add','arrow-tool','export','fit','zoom-in','zoom-out','calibrate']) $(k).disabled = !image;
  $('duplicate').disabled = $('delete').disabled = !a;
  $('export-csv').disabled = !image || arrows.length === 0;
  $('undo').disabled = history.length === 0; $('redo').disabled = future.length === 0;
  $('count-info').textContent = `Стрелок: ${arrows.length}`;
}
function geometry(a) {
  const dx = a.x2-a.x1, dy = a.y2-a.y1, length = Math.hypot(dx,dy) || 1;
  const ux = dx/length, uy = dy/length, nx = -uy, ny = ux;
  const p = {x:a.x1+nx*a.offset,y:a.y1+ny*a.offset}, q = {x:a.x2+nx*a.offset,y:a.y2+ny*a.offset};
  const mid = {x:(p.x+q.x)/2,y:(p.y+q.y)/2};
  let angle = Math.atan2(dy,dx); if(angle > Math.PI/2) angle -= Math.PI; if(angle < -Math.PI/2) angle += Math.PI;
  const sign = a.textPosition === 'above' ? -1 : a.textPosition === 'below' ? 1 : 0;
  const distance = sign*(a.fontSize*.7+7);
  const text = a.textPosition === 'custom' ? {x:mid.x+a.textDx,y:mid.y+a.textDy} : {x:mid.x-Math.sin(angle)*distance,y:mid.y+Math.cos(angle)*distance};
  return {p,q,mid,text,angle,ux,uy,nx,ny,length};
}
function line(c,x1,y1,x2,y2) { c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke(); }
function textStroke(a){return ((a.textWeight || (a.bold?700:400))-400)/500*a.fontSize*.075;}
function paintArrow(c,a,handles=false) {
  const g = geometry(a); c.save(); c.strokeStyle = c.fillStyle = a.color;c.lineWidth = a.width;c.lineCap = 'round';c.lineJoin = 'round';
  if(Math.abs(a.offset)>2) {
    const sign = Math.sign(a.offset), gap = Math.min(5,Math.abs(a.offset)/3), extra = 10;
    line(c,a.x1+g.nx*gap*sign,a.y1+g.ny*gap*sign,g.p.x+g.nx*extra*sign,g.p.y+g.ny*extra*sign);
    line(c,a.x2+g.nx*gap*sign,a.y2+g.ny*gap*sign,g.q.x+g.nx*extra*sign,g.q.y+g.ny*extra*sign);
  }
  c.font = `400 ${a.fontSize}px "${a.font}"`;
  const textWidth = c.measureText(a.label).width + textStroke(a);
  if(a.textPosition === 'center' && a.label) {
    const gap = Math.min(g.length/2,(textWidth+18)/2);
    line(c,g.p.x,g.p.y,g.mid.x-g.ux*gap,g.mid.y-g.uy*gap);
    line(c,g.mid.x+g.ux*gap,g.mid.y+g.uy*gap,g.q.x,g.q.y);
  } else line(c,g.p.x,g.p.y,g.q.x,g.q.y);
  const head = Math.min(Math.max(10,a.width*4),g.length*.3);
  for(const [point,sign] of [[g.p,1],[g.q,-1]]) {
    c.beginPath();c.moveTo(point.x,point.y);c.lineTo(point.x+g.ux*head*sign+g.nx*head*.38,point.y+g.uy*head*sign+g.ny*head*.38);c.lineTo(point.x+g.ux*head*sign-g.nx*head*.38,point.y+g.uy*head*sign-g.ny*head*.38);c.closePath();c.fill();
  }
  c.save();c.translate(g.text.x,g.text.y);c.rotate(g.angle);c.textAlign='center';c.textBaseline='middle';if(textStroke(a)>0){c.lineWidth=textStroke(a);c.strokeText(a.label,0,0);}c.fillText(a.label,0,0);c.restore();
  if(handles) {
    c.strokeStyle='#2563eb';c.fillStyle='#fff';c.lineWidth=1.5/zoom;
    c.setLineDash([4/zoom,4/zoom]);line(c,a.x1,a.y1,a.x2,a.y2);c.setLineDash([]);
    for(const p of [{x:a.x1,y:a.y1},{x:a.x2,y:a.y2}]) {c.beginPath();c.arc(p.x,p.y,5/zoom,0,Math.PI*2);c.fill();c.stroke();}
    // Keep the offset handle separate from a centered label.
    const h={x:g.p.x+(g.q.x-g.p.x)*.25,y:g.p.y+(g.q.y-g.p.y)*.25}, r=6/zoom;
    c.beginPath();c.moveTo(h.x,h.y-r);c.lineTo(h.x+r,h.y);c.lineTo(h.x,h.y+r);c.lineTo(h.x-r,h.y);c.closePath();c.fill();c.stroke();
    if(a.label) { c.save();c.translate(g.text.x,g.text.y);c.rotate(g.angle);c.strokeStyle='#2563eb66';c.setLineDash([3/zoom,3/zoom]);c.strokeRect(-textWidth/2-5,-a.fontSize*.6,textWidth+10,a.fontSize*1.2);c.restore(); }
  }
  c.restore();
}
function render() {
  refreshLabels();
  if(!image)return;
  const w=image.naturalWidth,h=image.naturalHeight,dpr=Math.min(devicePixelRatio || 1,2,8192/(Math.max(w,h)*zoom),Math.sqrt(16000000/(w*h*zoom*zoom)));
  canvas.style.width=`${w*zoom}px`;canvas.style.height=`${h*zoom}px`;
  const cw=Math.max(1,Math.round(w*zoom*dpr)),ch=Math.max(1,Math.round(h*zoom*dpr));
  if(canvas.width!==cw || canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  ctx.setTransform(cw/w,0,0,ch/h,0,0);ctx.clearRect(0,0,w,h);ctx.drawImage(image,0,0);
  for(const a of arrows)paintArrow(ctx,a,a.id===selected);
  if(drag?.kind==='calibrate'){
    const p=drag.p,q=drag.end;ctx.save();ctx.strokeStyle='#d97706';ctx.fillStyle='#d97706';ctx.lineWidth=2/zoom;ctx.setLineDash([6/zoom,4/zoom]);line(ctx,p.x,p.y,q.x,q.y);ctx.setLineDash([]);
    for(const pt of [p,q]){ctx.beginPath();ctx.arc(pt.x,pt.y,4/zoom,0,Math.PI*2);ctx.fill();}
    ctx.font=`${14/zoom}px Arial`;ctx.textAlign='center';ctx.fillText(`${formatValue(Math.hypot(q.x-p.x,q.y-p.y))} px = ${formatValue(scale.real)} ${scale.unit}`,(p.x+q.x)/2,(p.y+q.y)/2-12/zoom);ctx.restore();
  }
  $('zoom-value').textContent=`${Math.round(zoom*100)}%`;
}
function fit() { if(!image)return;zoom=Math.min(1,Math.max(.02,Math.min((viewport.clientWidth-90)/image.naturalWidth,(viewport.clientHeight-90)/image.naturalHeight)));render(); }
function changeZoom(factor) { if(!image)return; const max = Math.min(4,8192/Math.max(image.naturalWidth,image.naturalHeight));zoom=Math.max(.02,Math.min(max,zoom*factor));render(); }
async function loadFile(file) {
  if(!file)return;
  if(!/^image\/(png|jpeg|webp|gif|bmp|x-ms-bmp)$/.test(file.type))return toast('Выберите PNG, JPG, WebP, GIF или BMP.');
  if(file.size>30*1024*1024)return toast('Изображение больше 30 МБ. Выберите файл поменьше.');
  const request=++loadSerial,url=URL.createObjectURL(file), next=new Image();
  try {
    next.src=url;await next.decode();if(request!==loadSerial)return;
    if(next.naturalWidth*next.naturalHeight>40000000 || Math.max(next.naturalWidth,next.naturalHeight)>16000)throw new Error('too-large');
    stopPan();drag=null;image=next;filename=file.name;arrows=[];selected=null;history=[];future=[];
    $('empty').hidden=true;$('canvas-wrap').hidden=false;
    $('image-info').textContent=`${filename} · ${image.naturalWidth} × ${image.naturalHeight} px`;
    fit();setTool('arrow');sync();toast('Изображение открыто. Проверьте масштаб перед измерением.');
  } catch(error) {toast(error.message==='too-large'?'Изображение слишком большое: максимум 40 Мп и 16 000 px по стороне.':'Не удалось открыть изображение. Попробуйте другой файл.');}
  finally {URL.revokeObjectURL(url);$('file').value='';}
}
function point(event) {const rect=canvas.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*image.naturalWidth,y:(event.clientY-rect.top)/rect.height*image.naturalHeight};}
function distanceToSegment(p,a,b) {const dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy || 1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function hit(a,p,selectedOnly=false) {
  const g=geometry(a),r=11/zoom;
  if(selectedOnly){
    if(Math.hypot(p.x-a.x1,p.y-a.y1)<r)return 'start';
    if(Math.hypot(p.x-a.x2,p.y-a.y2)<r)return 'end';
    if(Math.hypot(p.x-(g.p.x+(g.q.x-g.p.x)*.25),p.y-(g.p.y+(g.q.y-g.p.y)*.25))<r)return 'offset';
  }
  const dx=p.x-g.text.x,dy=p.y-g.text.y,tx=dx*Math.cos(g.angle)+dy*Math.sin(g.angle),ty=-dx*Math.sin(g.angle)+dy*Math.cos(g.angle);
  ctx.font=`400 ${a.fontSize}px "${a.font}"`;
  if(a.label && Math.abs(tx)<(ctx.measureText(a.label).width+textStroke(a))/2+6/zoom && Math.abs(ty)<a.fontSize*.65+3/zoom)return 'text';
  if(distanceToSegment(p,g.p,g.q)<r || distanceToSegment(p,{x:a.x1,y:a.y1},g.p)<r || distanceToSegment(p,{x:a.x2,y:a.y2},g.q)<r)return 'move';
  return null;
}
canvas.addEventListener('pointerdown',event=>{
  if(!image || event.button!==0 || drag || pan)return;
  event.preventDefault();canvas.focus({preventScroll:true});const p=point(event);canvas.setPointerCapture(event.pointerId);
  if(tool==='calibrate'){drag={kind:'calibrate',p,end:{...p},pointerId:event.pointerId};render();return;}
  if(tool==='arrow'){
    remember();const a={...defaults,id:++serial,x1:p.x,y1:p.y,x2:p.x,y2:p.y};arrows.push(a);selected=a.id;drag={kind:'draw',p,original:{...a},pointerId:event.pointerId};
  } else {
    let a=active(),kind=a&&hit(a,p,true);
    if(!kind){a=[...arrows].reverse().find(item=>hit(item,p));kind=a&&hit(a,p);}
    if(a && kind){selected=a.id;remember();drag={kind,p,original:{...a},pointerId:event.pointerId};}else{selected=null;}
  }
  sync();render();
});
canvas.addEventListener('pointermove',event=>{
  if(!image || pan)return;const p=point(event);
  if(!drag){if(tool==='select')canvas.style.cursor=(active()&&hit(active(),p,true)) || arrows.some(a=>hit(a,p)) ? 'move':'default';else canvas.style.cursor='crosshair';return;}
  if(event.pointerId!==drag.pointerId)return;
  if(drag.kind==='calibrate'){drag.end=p;if(event.shiftKey){if(Math.abs(p.x-drag.p.x)>Math.abs(p.y-drag.p.y))drag.end.y=drag.p.y;else drag.end.x=drag.p.x;}render();return;}
  const a=active(),o=drag.original,dx=p.x-drag.p.x,dy=p.y-drag.p.y;
  if(!a)return;
  if(drag.kind==='draw' || drag.kind==='end'){
    a.x2=p.x;a.y2=p.y;
    if(event.shiftKey){if(Math.abs(a.x2-a.x1)>Math.abs(a.y2-a.y1))a.y2=a.y1;else a.x2=a.x1;}
  }else if(drag.kind==='start'){a.x1=p.x;a.y1=p.y;}
  else if(drag.kind==='move'){a.x1=o.x1+dx;a.y1=o.y1+dy;a.x2=o.x2+dx;a.y2=o.y2+dy;}
  else if(drag.kind==='offset'){const g=geometry(o);a.offset=Math.max(-1000,Math.min(1000,o.offset+dx*g.nx+dy*g.ny));}
  else if(drag.kind==='text'){const g=geometry(o);a.textPosition='custom';a.textDx=g.text.x-g.mid.x+dx;a.textDy=g.text.y-g.mid.y+dy;}
  sync();render();
});
function finishDrag(event){
  if(!drag || event.pointerId!==drag.pointerId)return;
  if(drag.kind==='calibrate'){
    const distance=Math.hypot(drag.end.x-drag.p.x,drag.end.y-drag.p.y);
    if(distance*zoom<8){drag=null;render();toast('Отрезок слишком короткий. Проведите его ещё раз.');return;}
    remember();scale={...scale,source:'px',distance};drag=null;setTool('arrow');sync();render();toast('Масштаб установлен. Теперь проведите размерную стрелку.');return;
  }
  const a=active();if(drag.kind==='draw'){
    if(!a || Math.hypot(a.x2-a.x1,a.y2-a.y1)*zoom<8){restore(history.pop());toast('Проведите от начала до конца стрелки, удерживая кнопку мыши.');}
    else setTool('select');
  }
  drag=null;sync();render();
}
canvas.addEventListener('pointerup',finishDrag);
canvas.addEventListener('pointercancel',event=>{if(drag && event.pointerId===drag.pointerId){const calibration=drag.kind==='calibrate';drag=null;if(!calibration && history.length)restore(history.pop());else render();}});
function update(key,value){const a=active();if(a){remember();a[key]=value;if(key==='textPosition'){a.textDx=0;a.textDy=0;}}else defaults[key]=value;sync();render();}
$('settings').addEventListener('submit',e=>e.preventDefault());
$('text-weight').addEventListener('change',e=>update('textWeight',Number(e.target.value)));
for(const [id,key] of Object.entries({'scale-distance':'distance','scale-source':'source','scale-real':'real','scale-unit':'unit','scale-dpi':'dpi'})){
  $(id).addEventListener('change',e=>{
    const value=key==='unit'?e.target.value.trim():key==='source'?e.target.value:Number(e.target.value);
    const next={...scale,[key]:value};
    if(!validScale(next)){$('scale-error').textContent='Введите положительные длины (от 0,000001 до 10¹²), DPI от 1 до 100 000 и непустую единицу. Масштаб пока не изменён.';$('scale-error').hidden=false;e.target.setAttribute('aria-invalid','true');return;}
    remember();scale=next;sync();render();
  });
}
$('calibrate').addEventListener('click',()=>{selected=null;setTool('calibrate');sync();render();toast(`Проведите отрезок, соответствующий ${scale.real} ${scale.unit}. Esc — отменить.`);});
$('auto-label').addEventListener('change',e=>{const a=active();if(a)remember();(a||defaults).autoLabel=e.target.checked;sync();render();});
// Text input keeps caret position while updating the canvas.
$('label').addEventListener('focus',()=>{if(active() && !active().autoLabel)remember();});
$('label').addEventListener('input',e=>{if((active()||defaults).autoLabel)return;(active() || defaults).label=e.target.value;render();$('undo').disabled=!history.length;});
for(const [id,key] of Object.entries({font:'font','text-position':'textPosition',color:'color'}))$(id).addEventListener('change',e=>update(key,e.target.value));
for(const [id,key,min,max] of [['font-size','fontSize',8,160],['offset-number','offset',-1000,1000],['x1','x1',-16000,32000],['y1','y1',-16000,32000],['x2','x2',-16000,32000],['y2','y2',-16000,32000]])$(id).addEventListener('change',e=>{const v=Number(e.target.value);if(e.target.value==='' || !Number.isFinite(v)){sync();return;}update(key,Math.max(min,Math.min(max,v)));});
for(const [id,key] of [['offset','offset'],['width','width']]){
  let started=false;
  $(id).addEventListener('input',e=>{if(!started){if(active())remember();started=true;}(active()||defaults)[key]=Number(e.target.value);$('offset-number').value=(active()||defaults).offset;$('width-value').value=(active()||defaults).width;render();});
  $(id).addEventListener('change',()=>{started=false;sync();});
}
document.querySelectorAll('.swatch').forEach(b=>b.addEventListener('click',()=>update('color',b.dataset.color)));
for(const id of ['upload','empty-upload'])$(id).addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',e=>loadFile(e.target.files[0]));
let dragDepth=0;
viewport.addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;$('drop-overlay').hidden=false;});
viewport.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
viewport.addEventListener('dragleave',()=>{dragDepth--;if(dragDepth<=0)$('drop-overlay').hidden=true;});
viewport.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('drop-overlay').hidden=true;loadFile(e.dataTransfer.files[0]);});
window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>e.preventDefault());
$('select-tool').addEventListener('click',()=>setTool('select'));
for(const id of ['arrow-tool','add'])$(id).addEventListener('click',()=>{selected=null;setTool('arrow');sync();render();toast('Проведите стрелку на изображении. Shift — строго по горизонтали или вертикали.');});
$('undo').addEventListener('click',undo);$('redo').addEventListener('click',redo);
$('fit').addEventListener('click',fit);$('zoom-in').addEventListener('click',()=>changeZoom(1.25));$('zoom-out').addEventListener('click',()=>changeZoom(.8));
function remove(){if(!active())return;remember();arrows=arrows.filter(a=>a.id!==selected);selected=null;sync();render();}
$('delete').addEventListener('click',remove);
$('duplicate').addEventListener('click',()=>{const a=active();if(!a)return;remember();const copy={...a,id:++serial,x1:a.x1+20,y1:a.y1+20,x2:a.x2+20,y2:a.y2+20};arrows.push(copy);selected=copy.id;sync();render();});
// Custom shortcuts are device-local preferences.
const shortcutDefaults={select:'KeyV',arrow:'KeyA',remove:'Delete',undo:'Mod+KeyZ',redo:'Mod+Shift+KeyZ',duplicate:'Mod+KeyD',fit:'KeyF',calibrate:'KeyC',zoom:'KeyZ'};
const shortcutLabels={select:'Выделение',arrow:'Новая стрелка',remove:'Удалить стрелку',undo:'Отменить',redo:'Повторить',duplicate:'Дублировать',fit:'Вписать изображение',calibrate:'Калибровка',zoom:'Зум + колесо мыши'};
let shortcuts={...shortcutDefaults},shortcutDraft={},recording=null;
const pressedKeys=new Set();
const validBinding=value=>typeof value==='string' && /^(Mod\+)?(Alt\+)?(Shift\+)?(Key[A-Z]|Digit[0-9]|Delete|Backspace|Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Home|End)$/.test(value);
try{
  const saved=JSON.parse(localStorage.getItem('razmer.shortcuts')||'null');
  if(saved){
    const merged={...shortcutDefaults};for(const key of Object.keys(merged))if(validBinding(saved[key]))merged[key]=saved[key];
    if(new Set(Object.values(merged)).size===Object.keys(merged).length)shortcuts=merged;
  }
}catch{}
function binding(e){return (e.ctrlKey||e.metaKey?'Mod+':'')+(e.altKey?'Alt+':'')+(e.shiftKey?'Shift+':'')+e.code;}
function bindingLabel(value){return value.split('+').map(key=>key==='Mod'?'Ctrl / ⌘':key.replace('Key','').replace('Digit','').replace('Space','Пробел')).join(' + ');}
function refreshShortcutHints(){
  for(const [id,action] of Object.entries({'select-tool':'select','arrow-tool':'arrow',undo:'undo',redo:'redo',fit:'fit',calibrate:'calibrate',duplicate:'duplicate',delete:'remove'}))$(id).title=shortcutLabels[action]+' ('+bindingLabel(shortcuts[action])+')';
  const tip=document.querySelector('.status-tip');if(tip)tip.textContent=bindingLabel(shortcuts.arrow)+' — стрелка · '+bindingLabel(shortcuts.zoom)+' + колесо — зум · '+'ПКМ — перемещение';
}
function drawShortcutRows(){
  $('hotkey-list').innerHTML=Object.keys(shortcutDefaults).map(action=>'<div class="hotkey-row"><span>'+shortcutLabels[action]+'</span><button type="button" class="button" data-shortcut="'+action+'"></button></div>').join('');
  for(const button of $('hotkey-list').querySelectorAll('button')){
    const action=button.dataset.shortcut;button.textContent=recording===action?'Нажмите клавиши…':bindingLabel(shortcutDraft[action]);button.classList.toggle('recording',recording===action);button.setAttribute('aria-label',shortcutLabels[action]+': '+button.textContent);
    button.addEventListener('click',()=>{recording=action;$('hotkey-error').textContent='';drawShortcutRows();});
  }
}
$('hotkeys-open').addEventListener('click',()=>{shortcutDraft={...shortcuts};recording=null;resetNavigation();$('hotkey-error').textContent='';drawShortcutRows();$('hotkeys-dialog').showModal();});
$('hotkeys-close').addEventListener('click',()=>$('hotkeys-dialog').close());
$('hotkeys-dialog').addEventListener('close',()=>{recording=null;pressedKeys.clear();$('hotkeys-open').focus();});
$('hotkeys-dialog').addEventListener('cancel',e=>{if(recording){e.preventDefault();recording=null;drawShortcutRows();}});
$('hotkeys-reset').addEventListener('click',()=>{shortcutDraft={...shortcutDefaults};recording=null;$('hotkey-error').textContent='';drawShortcutRows();});
$('hotkeys-save').addEventListener('click',()=>{shortcuts={...shortcutDraft};try{localStorage.setItem('razmer.shortcuts',JSON.stringify(shortcuts));}catch{toast('Настройки применены, но браузер не разрешил их сохранить.');}refreshShortcutHints();$('hotkeys-dialog').close();});
function isEditing(target){return target?.isContentEditable || target?.matches?.('input,select,textarea');}
document.addEventListener('keydown',e=>{
  if($('hotkeys-dialog').open){
    if(!recording || e.code==='Escape' || e.code==='Tab')return;
    e.preventDefault();if(['ControlLeft','ControlRight','MetaLeft','MetaRight','AltLeft','AltRight','ShiftLeft','ShiftRight'].includes(e.code))return;
    const value=binding(e);
    if(!validBinding(value) || ['Mod+KeyL','Mod+KeyR','Mod+KeyW','Mod+KeyT','Mod+KeyN','Mod+KeyP','Mod+KeyS','Alt+ArrowLeft','Alt+ArrowRight'].includes(value)){$('hotkey-error').textContent='Выберите другую клавишу: это сочетание занято браузером или не поддерживается.';return;}
    if(Object.keys(shortcutDraft).some(k=>k!==recording && shortcutDraft[k]===value)){$('hotkey-error').textContent='Это сочетание уже назначено другому действию.';return;}
    shortcutDraft[recording]=value;recording=null;$('hotkey-error').textContent='';drawShortcutRows();return;
  }
  if(isEditing(e.target))return;
  pressedKeys.add(e.code);
  if(e.code==='Escape'){
    resetNavigation();
    if(drag){const calibration=drag.kind==='calibrate';drag=null;if(!calibration && history.length)restore(history.pop());}
    selected=null;setTool('select');sync();render();return;
  }
  if(drag || pan)return;
  const action=Object.keys(shortcuts).find(k=>shortcuts[k]===binding(e));if(!action)return;
  e.preventDefault();if(e.repeat || action==='zoom')return;
  if(action==='undo')undo();else if(action==='redo')redo();else if(action==='remove')remove();else if(action==='select')setTool('select');
  else if(image){const id={arrow:'add',duplicate:'duplicate',fit:'fit',calibrate:'calibrate'}[action];if(id)$(id).click();}
});
function stopPan(){
  const pointerId=pan?.pointerId;pan=null;viewport.classList.toggle('panning',false);
  if(pointerId!==undefined && viewport.hasPointerCapture(pointerId))viewport.releasePointerCapture(pointerId);
}
function resetNavigation(){pressedKeys.clear();stopPan();}
document.addEventListener('keyup',e=>pressedKeys.delete(e.code));
window.addEventListener('blur',resetNavigation);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetNavigation();});
viewport.addEventListener('contextmenu',e=>{if(image)e.preventDefault();});
// Capture before the canvas so a right-button drag never creates or edits an arrow.
viewport.addEventListener('pointerdown',e=>{
  if(!image || drag || pan || e.button!==2 || $('hotkeys-dialog').open)return;
  e.preventDefault();e.stopPropagation();canvas.focus({preventScroll:true});
  pan={pointerId:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};
  viewport.setPointerCapture(e.pointerId);viewport.classList.toggle('panning',true);
},true);
viewport.addEventListener('pointermove',e=>{
  if(!pan || e.pointerId!==pan.pointerId)return;
  if(!(e.buttons & 2)){stopPan();return;}e.preventDefault();
  viewport.scrollLeft=pan.left-(e.clientX-pan.x);viewport.scrollTop=pan.top-(e.clientY-pan.y);
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])viewport.addEventListener(type,e=>{if(pan && e.pointerId===pan.pointerId)stopPan();});
viewport.addEventListener('wheel',e=>{
  if(!image || drag || pan || $('hotkeys-dialog').open || isEditing(document.activeElement))return;
  const key=shortcuts.zoom.split('+').at(-1);
  if(!pressedKeys.has(key) || binding({...e,code:key,ctrlKey:e.ctrlKey,metaKey:e.metaKey,altKey:e.altKey,shiftKey:e.shiftKey})!==shortcuts.zoom)return;
  e.preventDefault();const before=canvas.getBoundingClientRect(),px=(e.clientX-before.left)/zoom,py=(e.clientY-before.top)/zoom;
  const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?viewport.clientHeight:1);
  changeZoom(Math.exp(-Math.max(-500,Math.min(500,delta))*.002));
  const after=canvas.getBoundingClientRect();viewport.scrollLeft+=after.left+px*zoom-e.clientX;viewport.scrollTop+=after.top+py*zoom-e.clientY;
},{passive:false});
refreshShortcutHints();
$('export-csv').addEventListener('click',()=>{
  if(!image || !arrows.length)return;
  try{
    const blob=new Blob([measurementsCsv(arrows,scale)],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=filename.replace(/\.[^.]+$/,'')+'-измерения.csv';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),10000);toast('CSV подготовлен: одна колонка числовых значений.');
  }catch(error){toast(error instanceof RangeError ? error.message : 'Не удалось экспортировать подписи стрелок.');}
});
$('export').addEventListener('click',()=>{
  if(!image)return;refreshLabels();
  try{
    const output=document.createElement('canvas');output.width=image.naturalWidth;output.height=image.naturalHeight;const c=output.getContext('2d');c.drawImage(image,0,0);for(const a of arrows)paintArrow(c,a);
    output.toBlob(blob=>{if(!blob){toast('Не удалось сохранить изображение.');return;}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${filename.replace(/\.[^.]+$/,'')}-размеры.png`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('PNG сохранён в исходном разрешении.');},'image/png');
  }catch{toast('Не удалось сохранить изображение. Попробуйте файл меньшего размера.');}
});
new ResizeObserver(()=>{if(image && !drag)render();}).observe(viewport);
sync();setTool('select');
// Optional browser agent interface; the same state is used by the visible editor.
if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const register=tool=>{try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}};
  register({name:'read_dimensions',description:'Read the image size and dimension arrows in the editor.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:()=>({image:image?{width:image.naturalWidth,height:image.naturalHeight}:null,scale:structuredClone(scale),arrows:structuredClone(arrows)})});
  register({name:'add_dimension',description:'Create a dimension arrow on the loaded image using image pixel coordinates. Label is optional; omitted labels are calculated from the image scale.',inputSchema:{type:'object',properties:{x1:{type:'number'},y1:{type:'number'},x2:{type:'number'},y2:{type:'number'},label:{type:'string',maxLength:120}},required:['x1','y1','x2','y2'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{if(!image)throw new Error('Load an image first');if(!input || !['x1','y1','x2','y2'].every(k=>Number.isFinite(input[k])&&input[k]>=0&&input[k]<=(k[0]==='x'?image.naturalWidth:image.naturalHeight)) || (input.label!==undefined && (typeof input.label!=='string' || input.label.length>120)) || Math.hypot(input.x2-input.x1,input.y2-input.y1)<1)throw new Error('Invalid coordinates or label');remember();const a={...defaults,id:++serial,x1:input.x1,y1:input.y1,x2:input.x2,y2:input.y2,label:input.label??'',autoLabel:input.label===undefined};arrows.push(a);selected=a.id;setTool('select');sync();render();return {id:a.id,count:arrows.length};}});
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
