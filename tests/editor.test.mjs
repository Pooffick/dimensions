import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as measurement from '../dist/measurement.mjs';
test('editor recalculates, calibrates and restores scale through undo',()=>{
 const nodes=new Map(),documentEvents={},windowEvents={};
 const context2d=new Proxy({measureText:s=>({width:s.length*10})},{get:(o,k)=>k in o?o[k]:()=>{}});
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,checked:false,style:{},events:{},classList:{toggle(){}},setAttribute(){},removeAttribute(){},addEventListener(k,f){(this.events[k]??=[]).push(f);},getContext:()=>context2d,focus(options){this.focusOptions=options;},showModal(){this.open=true;},close(){this.open=false;},querySelectorAll:()=>[],setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){},scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0,width:1000,height:700}),clientWidth:1200,clientHeight:900});return nodes.get(id);};
 const sandbox={documentEvents,windowEvents,...measurement,assert,console,Intl,Math,Number,JSON,structuredClone,devicePixelRatio:1,setTimeout:()=>1,clearTimeout(){},document:{querySelector:()=>null,getElementById:node,querySelectorAll:()=>[],addEventListener(k,f){documentEvents[k]=f;}},window:{addEventListener(k,f){windowEvents[k]=f;}},ResizeObserver:class{observe(){}}};
 vm.createContext(sandbox);
 const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/,'');
 vm.runInContext(source+`

 image={naturalWidth:1000,naturalHeight:700}; scale={source:'px',distance:200,real:100,unit:'µm',dpi:96};
 serial=1;arrows=[{...defaults,id:1,x1:0,y1:0,x2:300,y2:400}];selected=1;sync();assert.equal(active().label,'250 µm');
 update('x2',0);assert.equal(active().label,'200 µm');undo();assert.equal(active().label,'250 µm');redo();assert.equal(active().label,'200 µm');
 update('autoLabel',false);update('label','ручной текст');remember();scale.real=200;sync();assert.equal(active().label,'ручной текст');update('autoLabel',true);assert.equal(active().label,'400 µm');
 $('scale-real').events.change[0]({target:{value:'100'}});assert.equal(active().label,'200 µm');undo();assert.equal(active().label,'400 µm');redo();assert.equal(active().label,'200 µm');
 $('scale-real').events.change[0]({target:{value:'0',setAttribute(){}}});assert.equal(scale.real,100);assert.equal($('scale-error').hidden,false);
 selected=null;setTool('calibrate');canvas.events.pointerdown[0]({button:0,pointerId:1,clientX:100,clientY:100,preventDefault(){}});canvas.events.pointermove[0]({pointerId:1,clientX:500,clientY:100});finishDrag({pointerId:1});assert.equal(scale.distance,400);assert.equal(arrows.length,1);assert.equal(arrows[0].label,'100 µm');undo();assert.equal(scale.distance,200);assert.equal(arrows[0].label,'200 µm');redo();
 setTool('arrow');canvas.events.pointerdown[0]({button:0,pointerId:2,clientX:50,clientY:50,preventDefault(){}});canvas.events.pointermove[0]({pointerId:2,clientX:450,clientY:50});finishDrag({pointerId:2});assert.equal(active().label,'100 µm');const saved=active().label;changeZoom(.5);update('offset',-200);assert.equal(active().label,saved);

 // Stroke-based weights must work even when a font only has regular and bold faces.
 update('textWeight',900);assert.equal(active().textWeight,900);assert.ok(textStroke(active())>0);undo();assert.equal(active().textWeight,400);redo();assert.equal(active().textWeight,900);
 const strokes=[];const exportContext=new Proxy({measureText:()=>({width:50}),strokeText(){strokes.push(this.lineWidth);}},{get:(o,k)=>k in o?o[k]:()=>{}});paintArrow(exportContext,active(),false);assert.equal(strokes.length,1);assert.equal(strokes[0],textStroke(active()));
 const event=(code,extra={})=>({code,target:{matches:()=>false},preventDefault(){this.prevented=true;},...extra});
 const z=event('KeyZ');documentEvents.keydown(z);const beforeZoom=zoom;const wheel={deltaY:-100,deltaMode:0,clientX:300,clientY:200,preventDefault(){this.prevented=true;}};viewport.events.wheel[0](wheel);assert.ok(zoom>beforeZoom);assert.equal(wheel.prevented,true);assert.equal(active().label,saved);
 documentEvents.keyup(event('KeyZ'));const releasedZoom=zoom;viewport.events.wheel[0](wheel);assert.equal(zoom,releasedZoom);
 documentEvents.keydown(event('KeyZ',{target:{matches:()=>true}}));viewport.events.wheel[0](wheel);assert.equal(zoom,releasedZoom);
 documentEvents.keydown(event('KeyZ'));windowEvents.blur();viewport.events.wheel[0](wheel);assert.equal(zoom,releasedZoom);
 $('hotkeys-open').events.click[0]();recording='zoom';documentEvents.keydown(event('KeyA'));assert.equal(shortcutDraft.zoom,'KeyZ');assert.ok($('hotkey-error').textContent);documentEvents.keydown(event('KeyX'));assert.equal(shortcutDraft.zoom,'KeyX');$('hotkeys-save').events.click[0]();assert.equal(shortcuts.zoom,'KeyX');
 documentEvents.keydown(event('KeyZ'));viewport.events.wheel[0](wheel);assert.equal(zoom,releasedZoom);documentEvents.keyup(event('KeyZ'));documentEvents.keydown(event('KeyX'));viewport.events.wheel[0](wheel);assert.ok(zoom>releasedZoom);


 windowEvents.blur();viewport.scrollLeft=400;viewport.scrollTop=300;
 const unchanged=snapshot(),undoCount=history.length;setTool('arrow');
 const down={button:2,pointerId:9,clientX:300,clientY:200,preventDefault(){},stopPropagation(){this.stopped=true;}};
 viewport.events.pointerdown[0]({...down,button:0});assert.equal(pan,null);
 viewport.events.pointerdown[0](down);assert.equal(down.stopped,true);assert.ok(pan);assert.equal(drag,null);
 assert.equal(canvas.focusOptions.preventScroll,true);
 viewport.events.pointermove[0]({pointerId:9,buttons:2,clientX:360,clientY:240,preventDefault(){}});assert.equal(viewport.scrollLeft,340);assert.equal(viewport.scrollTop,260);assert.equal(snapshot(),unchanged);assert.equal(history.length,undoCount);
 documentEvents.keyup(event('KeyA'));assert.ok(pan);
 viewport.events.pointerup[0]({pointerId:9});assert.equal(pan,null);
 viewport.events.pointermove[0]({pointerId:9,buttons:0,clientX:500,clientY:500,preventDefault(){}});assert.equal(viewport.scrollLeft,340);
 viewport.events.pointerdown[0](down);windowEvents.blur();assert.equal(pan,null);
 viewport.events.pointerdown[0](down);viewport.events.pointercancel[0]({pointerId:9});assert.equal(pan,null);
 viewport.events.pointerdown[0](down);viewport.events.pointermove[0]({pointerId:9,buttons:0});assert.equal(pan,null);
 const menu={preventDefault(){this.prevented=true;}};viewport.events.contextmenu[0](menu);assert.equal(menu.prevented,true);
 const space=event('Space');documentEvents.keydown(space);assert.notEqual(space.prevented,true);viewport.events.pointerdown[0]({...down,button:0});assert.equal(pan,null);windowEvents.blur();
   `,sandbox);
});
