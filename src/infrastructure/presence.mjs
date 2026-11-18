import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
const secret=()=>randomBytes(24).toString('hex');
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode});};
const text=(value,max)=>typeof value==='string'&&value.length<=max?value:null;
/** Ephemeral, self-declared identities on one local host. */
export function createPresenceStore({now=Date.now,ttl=45000}={}){
 const connections=new Map();let changed=()=>{};
 const credential=(id,token)=>{const c=connections.get(id);if(!c||typeof token!=='string'||token.length!==c.token.length||!timingSafeEqual(Buffer.from(token),Buffer.from(c.token)))fail('Connexion de présence inconnue.',403);return c;};
 function scope(value){const experienceId=text(value.experienceId,200),revision=text(value.revision,100);if(experienceId===null||revision===null)fail('Contexte de présence invalide.');return {experienceId,revision};}
 function prune(){let dirty=false;for(const [id,c] of connections)if(c.seen+ttl<now()){connections.delete(id);dirty=true;}if(dirty)changed();}
 return {
  onChange(fn){changed=fn;},
  join(value){prune();const name=text(value.name,64)?.trim();if(!name||/[\x00-\x1f]/.test(name))fail('Un pseudo de 1 à 64 caractères est requis.');const code=value.code??secret();if(typeof code!=='string'||!/^([a-f0-9]{48})$/.test(code))fail('Code d’association invalide.');const identityId=createHash('sha256').update(code).digest('hex');const actorKind=value.actorKind??'human';if(!['human','assistant'].includes(actorKind))fail('Type d’acteur invalide.');const existing=[...connections.values()].find(c=>c.identityId===identityId);if(existing&&(existing.name!==name||existing.actorKind!==actorKind))fail('Ce code est déjà associé à un autre pseudo connecté.',409);if(connections.size>=256)fail('Limite locale de connexions atteinte.',503);const id=secret(),token=secret();connections.set(id,{id,token,identityId,name,actorKind,...scope(value),seen:now(),connected:false});changed();return {id,token,code,identityId,name,actorKind};},
  touch(id,token,value){const c=credential(id,token);Object.assign(c,scope(value),{seen:now()});changed();},
  attach(id,token){const c=credential(id,token);c.connected=true;c.seen=now();changed();},
  heartbeat(id,token){credential(id,token).seen=now();},
  leave(id,token){credential(id,token);connections.delete(id);changed();},
  snapshot(id,token){prune();const self=credential(id,token),groups=new Map();for(const c of connections.values()){if(!c.connected)continue;let group=groups.get(c.identityId);if(!group){group={identityId:c.identityId,name:c.name,actorKind:c.actorKind,self:c.identityId===self.identityId,connections:0,here:0,revisions:[]};groups.set(c.identityId,group);}group.connections++;if(self.experienceId&&c.experienceId===self.experienceId){group.here++;if(c.revision&&!group.revisions.includes(c.revision))group.revisions.push(c.revision);}}return {schema:'konitif.local-presence.v1',experienceId:self.experienceId,identities:[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name)),capabilities:{presence:true,spectator:false,independent:false,coedit:false}};},
  prune
 };
}
export function createPresenceRoutes({cors}){
 const store=createPresenceStore(),streams=new Map();
 const json=(request,response,status,value)=>{response.writeHead(status,{...cors(request),'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(value));};
 const send=(entry)=>{try{entry.response.write('event: presence\ndata: '+JSON.stringify(store.snapshot(entry.id,entry.token))+'\n\n');}catch{entry.response.end();}};
 store.onChange(()=>{for(const stream of streams.values())send(stream);});
 async function body(request){let size=0,parts=[];for await(const part of request){size+=part.length;if(size>4096)fail('Demande trop volumineuse.',413);parts.push(part);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{fail('Demande JSON invalide.');}}
 return async function handle(request,response,url){try{
  if(url.pathname==='/api/presence/join'&&request.method==='POST'){json(request,response,200,store.join(await body(request)));return;}
  const id=url.searchParams.get('id'),token=url.searchParams.get('token');
  if(url.pathname==='/api/presence/events'&&request.method==='GET'){
   store.snapshot(id,token);if(streams.has(id))fail('Connexion déjà observée.',409);
   response.writeHead(200,{...cors(request),'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer',connection:'keep-alive'});
   const entry={id,token,response};streams.set(id,entry);store.attach(id,token);
   const heartbeat=setInterval(()=>{try{store.heartbeat(id,token);store.prune();response.write(': heartbeat\n\n');}catch{response.end();}},15000);
   request.on('close',()=>{clearInterval(heartbeat);if(streams.get(id)===entry){streams.delete(id);try{store.leave(id,token);}catch{}}});return;
  }
  if(url.pathname==='/api/presence/context'&&request.method==='POST'){store.touch(id,token,await body(request));json(request,response,200,{ok:true});return;}
  if(url.pathname==='/api/presence/leave'&&request.method==='POST'){store.leave(id,token);streams.get(id)?.response.end();json(request,response,200,{ok:true});return;}
  fail('Action de présence inconnue.',404);
 }catch(error){if(!response.headersSent)json(request,response,error.statusCode??400,{message:error.message});else response.end();}};
}
