import type { IncomingMessage, ServerResponse } from 'node:http';

export interface LocalPresenceContext {
  experienceId: string;
  revision: string;
}

export interface LocalPresenceIdentity extends LocalPresenceContext {
  name: string;
  code?: string;
  actorKind?: 'human' | 'assistant';
}

export interface LocalPresenceCredentials {
  id: string;
  token: string;
  code: string;
  identityId: string;
  name: string;
  actorKind: 'human' | 'assistant';
}

export interface LocalPresencePerson {
  identityId: string;
  name: string;
  actorKind: 'human' | 'assistant';
  self: boolean;
  connections: number;
  here: number;
  revisions: string[];
}

export interface LocalPresenceFrame {
  schema: 'konitif.local-presence.v1';
  experienceId: string;
  identities: LocalPresencePerson[];
  capabilities: { presence: true; spectator: false; independent: false; coedit: false };
}

export interface LocalPresenceStore {
  onChange(listener: () => void): void;
  join(identity: LocalPresenceIdentity): LocalPresenceCredentials;
  touch(id: string, token: string, context: LocalPresenceContext): void;
  attach(id: string, token: string): void;
  heartbeat(id: string, token: string): void;
  leave(id: string, token: string): void;
  snapshot(id: string, token: string): LocalPresenceFrame;
  prune(): void;
}

export function createPresenceStore(options?: { now?: () => number; ttl?: number }): LocalPresenceStore;
export function createPresenceRoutes(options: {
  cors(request: IncomingMessage): Record<string, string>;
}): (request: IncomingMessage, response: ServerResponse, url: URL) => Promise<void>;
