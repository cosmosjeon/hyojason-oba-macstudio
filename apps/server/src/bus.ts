type Fn = (event: string, data: unknown) => void;
const subs = new Set<Fn>();
export const subscribe = (f: Fn) => { subs.add(f); return () => subs.delete(f); };
export const publish = (event: string, data: unknown) => { for (const f of subs) { try { f(event, data); } catch {} } };
export const subscriberCount = () => subs.size;
