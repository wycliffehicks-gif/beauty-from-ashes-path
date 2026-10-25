import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConversationService } from '../service/service';
import { seal, unseal, type Envelope } from '../staging/seal.server';

function envelope(expires = Date.now() + 60000): Envelope {
  const service = new ConversationService({ verifiedOwnerId: 'synthetic-owner' });
  service.ensureThread('synthetic-thread', false);
  return { owner: 'synthetic-owner', thread: 'synthetic-thread', revision: 2, expires, authority: service.exportAuthority('synthetic-thread') };
}
const read = (token: string, saved = false) => unseal(token, 'synthetic-owner', 'synthetic-thread', 2, saved);

describe('P3b canonical sealed token parsing', () => {
  beforeEach(() => vi.stubEnv('BFA_P3B_STATE_SECRET', crypto.randomUUID()));
  afterEach(() => vi.unstubAllEnvs());

  it('preserves valid active and saved envelope round trips', async () => {
    const active = envelope();
    expect(await read(await seal(active))).toEqual(active);
    const saved = envelope(0);
    expect(await read(await seal(saved), true)).toEqual(saved);
    await expect(read(await seal(saved))).rejects.toThrow('Unavailable');
  });

  it('rejects an appended segment on an otherwise valid envelope', async () => {
    const value = envelope();
    const token = await seal(value);
    expect(await read(token)).toEqual(value);
    await expect(read(token + '.unexpected')).rejects.toThrow('Unavailable');
    await expect(read(token + '.unexpected', true)).rejects.toThrow('Unavailable');
  });

  it('requires exactly two nonempty canonical base64 segments', async () => {
    const token = await seal(envelope());
    const [iv, data] = token.split('.');
    if (!iv || !data) throw new Error('Synthetic fixture unavailable');
    for (const malformed of [token + '.', '.' + token, iv, `.${data}`, `${iv}.`, `${iv} .${data}`, `${iv}.${data}\n`, `${iv}.${data.slice(0, -1)}!`, `${iv}.${data}=`]) {
      await expect(read(malformed)).rejects.toThrow('Unavailable');
    }
    // Decodable but noncanonical pad bits must not alias a valid IV encoding.
    const paddedIv = btoa(String.fromCharCode(...new Uint8Array(11)));
    await expect(read(`${paddedIv.slice(0, -2)}B=.${data}`)).rejects.toThrow('Unavailable');
  });

  it('requires a 12-byte IV and rejects malformed or truncated ciphertext', async () => {
    const token = await seal(envelope());
    const [iv, data] = token.split('.');
    if (!iv || !data) throw new Error('Synthetic fixture unavailable');
    for (const length of [1, 11, 13, 16]) {
      const wrongIv = btoa(String.fromCharCode(...new Uint8Array(length)));
      await expect(read(`${wrongIv}.${data}`)).rejects.toThrow('Unavailable');
    }
    for (const ciphertext of ['AA==', btoa('short'), data.slice(0, -4)]) {
      await expect(read(`${iv}.${ciphertext}`)).rejects.toThrow('Unavailable');
    }
  });

  it('preserves ownership, thread, revision and authenticated-ciphertext checks', async () => {
    const token = await seal(envelope());
    await expect(unseal(token, 'other-owner', 'synthetic-thread', 2)).rejects.toThrow('Unavailable');
    await expect(unseal(token, 'synthetic-owner', 'other-thread', 2)).rejects.toThrow('Unavailable');
    await expect(unseal(token, 'synthetic-owner', 'synthetic-thread', 3)).rejects.toThrow('Unavailable');
    const [iv, data] = token.split('.');
    if (!iv || !data) throw new Error('Synthetic fixture unavailable');
    const corrupted = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    corrupted[0] = (corrupted[0] ?? 0) ^ 1;
    await expect(read(`${iv}.${btoa(Array.from(corrupted, c => String.fromCharCode(c)).join(''))}`)).rejects.toThrow('Unavailable');
  });

  it('preserves the 350000-character token cap', async () => {
    await expect(read('A'.repeat(350001))).rejects.toThrow('Unavailable');
  });
});