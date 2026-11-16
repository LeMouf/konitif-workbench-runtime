const valid=(id:string)=>/^experience\.[a-zA-Z0-9._-]{1,140}$/.test(id);
const validScreen=(id:string)=>/^[a-z0-9][a-z0-9-]{0,79}$/.test(id);

export function experienceTabHref(base:string,id:string,screen?:string){
 if(!valid(id))throw Error('Référence d’expérience invalide.');
 if(screen!==undefined&&!validScreen(screen))throw Error('Référence d’écran invalide.');
 const url=new URL(base);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Adresse Workbench invalide.');
 url.searchParams.set('experience',id);
 if(screen)url.searchParams.set('screen',screen);
 else url.searchParams.delete('screen');
 url.hash='';
 return url.href;
}

export function requestedExperienceFromUrl(base:string){
 const id=new URL(base).searchParams.get('experience');
 return id&&valid(id)?id:null;
}

export function requestedExperienceScreenFromUrl(base:string,experienceId:string){
 const url=new URL(base);
 const screen=url.searchParams.get('screen');
 return url.searchParams.get('experience')===experienceId&&screen&&validScreen(screen)?screen:null;
}

export interface ExperienceScreenNavigationPort {
  readHref(): string;
  pushHref(href: string): void;
  activate(screenId: string): boolean;
}

/** Bind screen navigation to an experience after its workspace has been restored. */
export function createExperienceScreenNavigation(
  experienceId: string,
  primaryScreenId: string,
  port: ExperienceScreenNavigationPort
) {
  function href(screenId: string) {
    return experienceTabHref(port.readHref(), experienceId, screenId);
  }

  return {
    href,
    select(screenId: string) {
      if (!validScreen(screenId)) return false;
      const destination = href(screenId);
      if (!port.activate(screenId)) return false;
      if (destination !== port.readHref()) port.pushHref(destination);
      return true;
    },
    restore() {
      const requested = requestedExperienceScreenFromUrl(port.readHref(), experienceId);
      if (requested && port.activate(requested)) return true;
      return port.activate(primaryScreenId);
    }
  };
}
