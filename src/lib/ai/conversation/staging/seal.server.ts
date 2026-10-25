import { ConversationService } from '../service/service';
export type Authority = ReturnType<ConversationService['exportAuthority']>;
export interface Envelope { owner: string; thread: string; revision: number; expires: number; authority: Authority }
function bytes(s: string) { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }
function base64(b: Uint8Array) { return btoa(Array.from(b, c => String.fromCharCode(c)).join('')); }
async function key() {
  const secret = process.env['BFA_P3B_STATE_SECRET'];
  if (!secret) throw new Error('Staging unavailable');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(value: Envelope): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(JSON.stringify(value)));
  return `${base64(iv)}.${base64(new Uint8Array(data))}`;
}
export async function unseal(token: string, owner: string, thread: string, revision: number, saved = false): Promise<Envelope> {
  try {
    if (token.length > 350000) throw new Error();
    const [iv, data] = token.split('.');
    if (!iv || !data) throw new Error();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(iv) }, await key(), bytes(data));
    const value = JSON.parse(new TextDecoder().decode(plain)) as Envelope;
    if (value.owner !== owner || value.thread !== thread || value.revision !== revision || (!saved && value.expires <= Date.now())) throw new Error();
    return value;
  } catch { throw new Error('Unavailable'); }
}
