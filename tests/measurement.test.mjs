import test from 'node:test';
import assert from 'node:assert/strict';
import {pixelsPerReference, measuredLength, measurementLabel, validScale, measurementsCsv} from '../dist/measurement.mjs';
const scale={source:'px',distance:200,real:100,unit:'µm',dpi:96};
test('known segment and diagonal use original pixels',()=>{assert.equal(measuredLength({x1:0,y1:0,x2:200,y2:0},scale),100);assert.equal(measuredLength({x1:0,y1:0,x2:300,y2:400},scale),250);});
test('centimeters respect explicit DPI',()=>{const s={...scale,source:'cm',distance:1,dpi:254};assert.equal(pixelsPerReference(s),100);assert.equal(measuredLength({x1:0,y1:0,x2:200,y2:0},s),200);});
test('translation, offset and zoom do not alter measurement',()=>{assert.equal(measuredLength({x1:50,y1:20,x2:250,y2:20,offset:300,zoom:.2},scale),100);});
test('units are arbitrary, very small values stay nonzero',()=>{assert.equal(measurementLabel({x1:0,y1:0,x2:200,y2:0},{...scale,unit:'услов. ед.'}),'100 услов. ед.');assert.notEqual(measurementLabel({x1:0,y1:0,x2:1e-6,y2:0},scale),'0 µm');});
test('invalid scales are rejected',()=>{for(const n of [0,-1,Infinity,NaN])assert.equal(validScale({...scale,distance:n}),false);assert.equal(validScale({...scale,unit:' '}),false);assert.equal(validScale({...scale,dpi:0}),false);assert.throws(()=>measuredLength({x1:0,y1:0,x2:1,y2:1},{...scale,real:0}),RangeError);});

test('CSV exports current labels including manual corrections and displayed rounding',()=>{
  const arrows=[{x1:0,y1:0,x2:300,y2:400,label:'123,50 µm',autoLabel:false},{label:'1.2500 µm'},{label:'0,0000001 µm'},{label:'1 234,5 µm'}];
  assert.equal(measurementsCsv(arrows,scale),'123.50\r\n1.2500\r\n0.0000001\r\n1234.5\r\n');
  assert.equal(measurementsCsv(arrows,{...scale,real:200}),measurementsCsv(arrows,scale));
  assert.equal(measurementsCsv([{label:'12 mm2'}],{...scale,unit:'mm2'}),'12\r\n');
  assert.equal(measurementsCsv([],scale),'');
  assert.throws(()=>measurementsCsv([{label:'заметка'}],scale),/стрелки 1/);
  assert.throws(()=>measurementsCsv([{label:'10–20 µm'}],scale),/одно числовое/);
});
