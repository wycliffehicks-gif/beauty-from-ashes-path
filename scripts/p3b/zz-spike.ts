import { mock } from 'bun:test';
const real = await import('@/lib/ai/conversation/service/mock-provider');
mock.module('@/lib/ai/conversation/service/mock-provider', () => ({ ...real, createMockProvider: (o: any) => { console.log('WRAPPED'); return real.createMockProvider(o); } }));
const m = await import('@/lib/ai/conversation/service/mock-provider'); m.createMockProvider({});
const s = await import('../../dev-server/src/lib/ai/conversation/service/mock-provider'); s.createMockProvider({});
