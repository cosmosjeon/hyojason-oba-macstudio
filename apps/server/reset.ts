// 행사 시작 전 시도·가족방 기록을 비운다: node --env-file=../../.env reset.ts
import { db } from './src/db.ts';
for (const t of ['attempts', 'feed', 'approvals']) db.exec('delete from ' + t);
db.exec("delete from kv where k = 'briefing'");
db.exec("delete from sqlite_sequence where name in ('attempts','feed','approvals')");
console.log('초기화 완료');
