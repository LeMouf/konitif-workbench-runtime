export interface WorkbenchInitializationInput {readonly reference:object;readonly label:string;}
export interface WorkbenchInitializationDescriptor {
 readonly key:string;readonly label:string;readonly source:string;
 readonly kind:'construction'|'read'|'operation';readonly subject?:string;
 readonly dependsOn?:readonly string[];readonly inputs?:readonly WorkbenchInitializationInput[];
}
interface WorkbenchInitializationBase {readonly operation:object;readonly parentOperation?:object;readonly descriptor:WorkbenchInitializationDescriptor;readonly prerequisites:readonly object[];}
export type WorkbenchInitializationEvent=
 |(WorkbenchInitializationBase&{readonly phase:'start'})
 |(WorkbenchInitializationBase&{readonly phase:'success';readonly value:unknown})
 |(WorkbenchInitializationBase&{readonly phase:'failure';readonly error:unknown});
/** Synchronous, best-effort notification. Observers do not own or execute initialization. */
export type WorkbenchInitializationObserver=(event:WorkbenchInitializationEvent)=>void;
export function createWorkbenchInitializationObservation(observer?:WorkbenchInitializationObserver){
 let active:object|undefined;const completed=new Map<string,object>();
 const notify=(event:WorkbenchInitializationEvent)=>{try{observer?.(event);}catch{/* Diagnostics must not reject or replace a runtime operation. */}};
 return{measure<T>(descriptor:WorkbenchInitializationDescriptor,run:()=>T):T{
  if(!observer)return run();const operation={},parentOperation=active,base={operation,parentOperation,descriptor,prerequisites:(descriptor.dependsOn??[]).flatMap(key=>{const value=completed.get(key);return value?[value]:[];})};
  notify({...base,phase:'start'});active=operation;
  try{const value=run();completed.set(descriptor.key,operation);notify({...base,phase:'success',value});return value;}catch(error){notify({...base,phase:'failure',error});throw error;}finally{active=parentOperation;}
 }};
}
