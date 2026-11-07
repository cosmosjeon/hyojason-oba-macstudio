import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
const dir = path.resolve(import.meta.dirname, '../../../data');
fs.mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(path.join(dir, 'hyojason.db'));
db.exec(`
create table if not exists attempts(
  id integer primary key autoincrement, ts integer not null, nick text not null, source text not null default 'web',
  user_msg text not null, reply text not null, audio text, bivia_prob real, bivia_label text,
  fell integer not null default 0, amount_krw integer not null default 0, maws_code text, maws_reason text, blocked_krw integer not null default 0
);
create table if not exists feed(id integer primary key autoincrement, ts integer not null, kind text not null, title text not null, body text, json text);
create table if not exists kv(k text primary key, v text not null);
create table if not exists approvals(id integer primary key autoincrement, ts integer not null, merchant text not null, amount_krw integer not null, note text, status text not null default 'pending', tx_hash text);
`);
export const kvGet = <T>(k: string, d: T): T => { const r: any = db.prepare('select v from kv where k=?').get(k); return r ? JSON.parse(r.v) : d; };
export const kvSet = (k: string, v: unknown) => { db.prepare('insert into kv(k,v) values(?,?) on conflict(k) do update set v=excluded.v').run(k, JSON.stringify(v)); };
