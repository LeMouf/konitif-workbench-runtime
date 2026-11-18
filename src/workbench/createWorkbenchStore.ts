import { LocalWorkspacePersistence } from '@konitif/workbench';
import { createLocalWorkbenchShellPersistence } from './workbenchShellPersistence';
import { createLocalWorkbenchFocusPersistence } from './workbenchFocusPersistence';
import { createBrowserWorkspaceSyncController } from './workspaceSyncController';
import { createBrowserWorkbenchHostEvents } from './browserWorkbenchHostEvents';
import { createBrowserDetachedWindowHost } from './browserDetachedWindowHost';
import { createWorkbenchInitializationObservation } from './workbenchInitializationObservation';
import {createWorkbenchStoreRuntime,type CreateWorkbenchStoreRuntimeOptions} from './createWorkbenchStoreRuntime';

type DefaultedPort='workspacePersistence'|'shellPersistence'|'focusPersistence'|'workspaceSync'|'hostEvents'|'detachedWindows';
export type CreateWorkbenchStoreOptions=Omit<CreateWorkbenchStoreRuntimeOptions,DefaultedPort>&Partial<Pick<CreateWorkbenchStoreRuntimeOptions,DefaultedPort>>;

/** Compatible browser assembly. The runtime owns state, not provider selection. */
export function createWorkbenchStore(options:CreateWorkbenchStoreOptions){
 const observation=createWorkbenchInitializationObservation(options.initializationObserver),source='src/workbench/createWorkbenchStore.ts';
 const isEnabled=()=>options.persistenceEnabled?.()??true;
 const {workspacePersistence,shellPersistence,workspaceSync,focusPersistence,hostEvents,detachedWindows}=observation.measure({key:'providers',label:'Select initialization providers',kind:'operation',source},()=>{
  const workspacePersistence=options.workspacePersistence??observation.measure({key:'providers.workspace',label:'Create workspace persistence provider',kind:'construction',subject:'Workspace persistence provider',source},()=>new LocalWorkspacePersistence(options.persistenceKey));
  const shellPersistence=options.shellPersistence??observation.measure({key:'providers.shell',label:'Create shell persistence provider',kind:'construction',subject:'Shell persistence provider',source},()=>createLocalWorkbenchShellPersistence({storageKey:options.shellPersistenceKey??`${options.persistenceKey}.shell`,isEnabled,shellWidgetCatalog:options.shellWidgetCatalog}));
  const workspaceSync=options.workspaceSync??observation.measure({key:'providers.sync',label:'Create workspace synchronization provider',kind:'construction',subject:'Workspace synchronization provider',source},()=>createBrowserWorkspaceSyncController({persistenceKey:options.persistenceKey,isEnabled}));
  const focusPersistence=options.focusPersistence??observation.measure({key:'providers.focus',label:'Create focus persistence provider',kind:'construction',subject:'Focus persistence provider',source},()=>createLocalWorkbenchFocusPersistence({storageKey:options.focusPersistenceKey??`${options.persistenceKey}.focus`,isEnabled}));
  const hostEvents=options.hostEvents===undefined?observation.measure({key:'providers.events',label:'Create browser host events',kind:'construction',subject:'Browser host events',source},()=>createBrowserWorkbenchHostEvents()):options.hostEvents;
  const detachedWindows=options.detachedWindows===undefined?observation.measure({key:'providers.windows',label:'Create detached-window host',kind:'construction',subject:'Detached-window host',source},()=>createBrowserDetachedWindowHost()):options.detachedWindows;
  return{workspacePersistence,shellPersistence,workspaceSync,focusPersistence,hostEvents,detachedWindows};
 });
 const runtime=observation.measure({key:'runtime',label:'Assemble the runtime',kind:'construction',source,dependsOn:['providers']},()=>createWorkbenchStoreRuntime({...options,workspacePersistence,shellPersistence,focusPersistence,workspaceSync,hostEvents,detachedWindows}));
 let disposed=false;
 return{...runtime,dispose():void{if(disposed)return;disposed=true;try{runtime.dispose();}finally{if(!options.workspaceSync)workspaceSync.dispose?.();}}};
}
