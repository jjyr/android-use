import { it, expect, vi, afterEach } from "vitest";
import { compactObservation } from "../src/feedback.js";
import { probe } from "../src/observation.js";
import { readHierarchy } from "../src/hierarchy.js";
import type { Observation, Element } from "../src/types.js";
afterEach(()=>vi.unstubAllEnvs());
it('compact feedback preserves IDs, disabled targets and meaningful labels without changing SDK state',()=> {
  const empty: Element={id:'1',bounds:[0,0,10,10],text:'',description:'',resourceId:'',className:'android.view.View',clickable:false,longClickable:false,editable:false,focused:false,enabled:true,password:false,scrollable:false};
  const o={schemaVersion:1,elements:[empty,{...empty,id:'9',text:'Price ¥2239'}, {...empty,id:'12',clickable:true,enabled:false}, {...empty,id:'15',editable:true,password:true}],screenshot:Buffer.from('png')} as Observation;
  const compact=compactObservation(o,3);
  expect(compact.elements.map(e=>e.id)).toEqual(['9','12','15']);
  expect(compact.elements[1]).toMatchObject({enabled:false,clickable:true,bounds:[0,0,10,10]});
  expect(compact.elements[2]).toMatchObject({password:true,editable:true});
  expect(compact.feedback).toEqual({format:'compact',totalElements:4,omittedElements:1,observationsInCall:3});
  expect(compact).not.toHaveProperty('screenshot'); expect(o.elements).toHaveLength(4);
});
it('runs independent probes concurrently, keeping override dimensions and state checks',async()=> {
  let active=0,max=0;
  const bound={shell:async(args:string[])=> {active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--; return args[1]==='window'?'mCurrentFocus=Window{x u0 com.example/.Main} isKeyguardShowing=false':args[1]==='input'?'SurfaceOrientation: 1':args[1]==='power'?'mWakefulness=Awake':'Physical size: 20x40\nOverride size: 30x60';}};
  const p=await probe(bound as any);expect(max).toBe(4);expect(p).toMatchObject({size:[30,60],rotation:1,awake:true,locked:false,packageName:'com.example'});
});
it('falls back to UIAutomator when the opt-in service is unavailable and cleans up files',async()=> {
  vi.stubEnv('ANDROID_USE_HIERARCHY','accessibility');const calls:string[][]=[];
  const bound={valid:true,shell:async(a:string[])=>{calls.push(a);return 'Broadcast completed: result=0';},execute:async()=>Buffer.from('<hierarchy/>')};
  expect(await readHierarchy(bound as any,0)).toBe('<hierarchy/>');
  expect(calls.some(a=>a[0]==='uiautomator')).toBe(true);expect(calls.some(a=>a[0]==='run-as'&&a[2]==='rm')).toBe(true);
});
it('does not fall back after connection invalidation',async()=> {
  vi.stubEnv('ANDROID_USE_HIERARCHY','accessibility');const bound={valid:true,shell:async()=> {bound.valid=false;throw new Error('offline');}};
  await expect(readHierarchy(bound as any,0)).rejects.toThrow('offline');
});
