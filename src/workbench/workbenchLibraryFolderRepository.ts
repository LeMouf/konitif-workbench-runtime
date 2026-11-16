import {libraryFoldersKey,readLibraryFolders,organizeExperienceLibraryResources,moveLibraryResource,type LibraryFolders} from '@konitif/workbench/workspace-contracts';
let connection:Promise<IDBDatabase>|undefined;
function database(){return connection??=new Promise<IDBDatabase>((resolve,reject)=>{
 if(typeof indexedDB==='undefined'){reject(Error('Le navigateur ne permet pas le stockage des dossiers.'));return;}
 const request=indexedDB.open('konitif.library.organization.v1',1);
 request.onupgradeneeded=()=>request.result.createObjectStore('organization');
 request.onerror=()=>{connection=undefined;reject(request.error??Error('Stockage des dossiers indisponible.'));};
 request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();connection=undefined;};resolve(db);};
});}
/** Atomic changes read the latest committed state, including changes from other tabs. */
async function transact(change?:((current:LibraryFolders)=>LibraryFolders)):Promise<LibraryFolders>{
 const db=await database();return new Promise((resolve,reject)=>{
  const transaction=db.transaction('organization','readwrite'),store=transaction.objectStore('organization'),request=store.get('folders');let result:LibraryFolders;let failure:unknown;
  request.onsuccess=()=>{try{
   // Import the old small-storage value once; keep its original as a backup.
   const current=readLibraryFolders(request.result===undefined?localStorage.getItem(libraryFoldersKey):JSON.stringify(request.result));
   result=change?change(current):current;
   readLibraryFolders(JSON.stringify(result));
   if(change||request.result===undefined)store.put(result,'folders');
  }catch(cause){failure=cause;transaction.abort();}};
  transaction.oncomplete=()=>resolve(result);
  transaction.onabort=()=>reject(failure??transaction.error??request.error??Error('Classement non enregistré.'));
  transaction.onerror=()=>{failure??=transaction.error??request.error;};
 });
}
export const readDurableLibraryFolders=()=>transact();
export const changeDurableLibraryFolders=(change:(current:LibraryFolders)=>LibraryFolders)=>transact(change);
export function describeLibraryFolderError(cause:unknown):string{
 if(cause&&typeof cause==='object'&&'name' in cause&&cause.name==='QuotaExceededError')return 'Le stockage du navigateur est plein. Le dossier ou le déplacement n’a pas été enregistré ; les ressources existantes sont conservées.';
 return cause instanceof Error?cause.message:'Impossible d’enregistrer le classement.';
}

export async function placeExperienceLibraryResources(sources:Parameters<typeof organizeExperienceLibraryResources>[1],explicitExperienceId?:string){if(!sources.some(source=>source.experienceAssets?.length))return;const value=await transact(current=>{
 const organized=organizeExperienceLibraryResources(current,sources);
 if(!explicitExperienceId)return organized;
 return sources.reduce((next,source)=>{
  const folder=next.folders.find(item=>item.experienceId===explicitExperienceId);
  return folder&&source.experienceAssets?.some(asset=>asset.experienceId===explicitExperienceId)?
   moveLibraryResource(next,source.resourceKey??'audio:'+source.id,folder.id):next;
 },organized);
 });if(typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('konitif.library.organization');channel.postMessage('changed');channel.close();}return value;}
