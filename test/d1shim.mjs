// D1 de mentira em cima do node:sqlite (Node 22+), pra testar o Worker de verdade sem rede.
import { DatabaseSync } from 'node:sqlite';
class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...a) { return new Stmt(this.db, this.sql, a); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { return this._run(); }
  _run() { const r = this.db.prepare(this.sql).run(...this.args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  _exec() { return /^\s*(SELECT|WITH)/i.test(this.sql) ? { results: this.db.prepare(this.sql).all(...this.args), meta: {} } : this._run(); }
}
export function makeD1(path = ':memory:') {
  const db = new DatabaseSync(path);
  return { raw: db, prepare: (sql) => new Stmt(db, sql), exec: async (sql) => db.exec(sql),
    async batch(list) { db.exec('BEGIN'); try { const out = list.map((s) => s._exec()); db.exec('COMMIT'); return out; } catch (e) { db.exec('ROLLBACK'); throw e; } } };
}
