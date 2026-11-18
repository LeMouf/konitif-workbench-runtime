import assert from 'node:assert/strict';
import {test} from 'node:test';
import {get} from 'svelte/store';
import {createWorkspace} from '@konitif/workbench/workspace-contracts';
import {createWorkbenchStoreRuntime} from '../dist/runtime.js';
import {createWorkbenchInitializationObservation} from '../dist/workbench/workbenchInitializationObservation.js';
const descriptor=key=>({key,label:key,source:'test',kind:'operation'});
test('notifications preserve nesting, explicit prerequisites and original values',()=>{
 const events=[],observation=createWorkbenchInitializationObservation(event=>events.push(event)),value={};let calls=0;
 assert.equal(observation.measure(descriptor('root'),()=>{observation.measure(descriptor('first'),()=>1);return observation.measure({...descriptor('second'),dependsOn:['first']},()=>{calls++;return value;});}),value);
 assert.equal(calls,1);const starts=events.filter(e=>e.phase==='start');assert.equal(starts[1].parentOperation,starts[0].operation);assert.equal(starts[2].parentOperation,starts[0].operation);assert.deepEqual(starts[2].prerequisites,[starts[1].operation]);
});
test('observer errors never replace a result or the original runtime exception',()=>{
 const observation=createWorkbenchInitializationObservation(()=>{throw Error('observer');}),failure=Error('runtime');let calls=0;
 assert.equal(observation.measure(descriptor('value'),()=>{calls++;return 42;}),42);
 assert.throws(()=>observation.measure(descriptor('error'),()=>{calls++;throw failure;}),error=>error===failure);assert.equal(calls,2);
});
function fixture(load,observer){const calls={workspace:0,shell:0,focus:0,subscribe:0,unsubscribe:0};return {calls,options:{initialToolId:'missing',persistenceKey:'initialization-test',hostEvents:null,detachedWindows:null,initializationObserver:observer,toolCatalog:{getDefinition:()=>undefined},shellWidgetCatalog:{getDefinition:()=>undefined},workspacePersistence:{load:()=>{calls.workspace++;return load();},save(){}},shellPersistence:{load:fallback=>{calls.shell++;return fallback;},save(){},serialize:JSON.stringify,normalize:(_,fallback)=>fallback},focusPersistence:{load:(_,fallback)=>{calls.focus++;return fallback;},save(){},serialize:JSON.stringify,normalize:(_,__,fallback)=>fallback},workspaceSync:{publish(){},subscribe:()=>{calls.subscribe++;return()=>{calls.unsubscribe++;};}}}};}
test('restored and empty provider results follow only their executed initialization branch',()=>{
 for(const restored of [false,true]){const events=[],workspace=restored?createWorkspace():null,f=fixture(()=>workspace,event=>events.push(event)),runtime=createWorkbenchStoreRuntime(f.options),starts=events.filter(e=>e.phase==='start');
  assert.equal(starts.some(e=>e.descriptor.key==='initial.workspace-fallback'),!restored);assert.deepEqual([f.calls.workspace,f.calls.shell,f.calls.focus,f.calls.subscribe],[1,1,1,1]);
  if(restored)assert.deepEqual(get(runtime.workspaceStore).workspace,workspace);
  const load=events.find(e=>e.phase==='success'&&e.descriptor.key==='initial.workspace-load');assert.equal(load.value,workspace);
  runtime.dispose();runtime.dispose();assert.equal(f.calls.unsubscribe,1);
 }
});
test('a failing provider reports failure and rethrows the same exception',()=>{const events=[],failure=Error('provider failed'),f=fixture(()=>{throw failure;},event=>events.push(event));assert.throws(()=>createWorkbenchStoreRuntime(f.options),error=>error===failure);assert.equal(events.find(e=>e.phase==='failure'&&e.descriptor.key==='initial.workspace-load').error,failure);assert.equal(f.calls.shell,0);});
test('a throwing observer leaves the runtime state and disposal unchanged',()=>{const workspace=createWorkspace(),f=fixture(()=>workspace,()=>{throw Error('observer');}),runtime=createWorkbenchStoreRuntime(f.options);assert.deepEqual(get(runtime.workspaceStore).workspace,workspace);runtime.dispose();assert.equal(f.calls.workspace,1);assert.equal(f.calls.unsubscribe,1);});

test('coherent initialization reuses its snapshot and coordinator without provider loads',()=>{
 const baseline=fixture(()=>createWorkspace()),first=createWorkbenchStoreRuntime(baseline.options),initialState=get(first.workspaceStore);first.dispose();
 const events=[],f=fixture(()=>{throw Error('load must not run');},event=>events.push(event));let disposed=0,changes=0;const coordinator={handleStateChange(){changes++;},flush(){},dispose(){disposed++;}};
 const runtime=createWorkbenchStoreRuntime({...f.options,coherentPersistence:{initialState,coordinator}});
 assert.deepEqual([f.calls.workspace,f.calls.shell,f.calls.focus,f.calls.subscribe],[0,0,0,0]);assert.equal(events.some(e=>e.descriptor.key==='initial.workspace-load'||e.descriptor.key==='initial.workspace-fallback'),false);const reused=events.find(e=>e.phase==='success'&&e.descriptor.key==='initial.persistence');assert.equal(reused.descriptor.kind,'read');assert.equal(reused.value,coordinator);assert.equal(changes,1);runtime.dispose();assert.equal(disposed,1);
});
