type SqlValue = string | number | null | Uint8Array;
type Row = Record<string, unknown>;

interface SqliteDatabaseAdapter {
  prepare(sql: string): {
    all(...values: unknown[]): unknown[];
    get(...values: unknown[]): unknown;
    run(...values: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
  exec(sql: string): void;
  pragma?(sql: string): void;
  transaction(fn: (...args: any[]) => any): (...args: any[]) => any;
}

class NodeSqliteAdapter implements SqliteDatabaseAdapter {
  private raw: any;

  constructor(rawInstance: any) {
    this.raw = rawInstance;
    try {
      this.raw.exec("PRAGMA journal_mode = WAL;");
    } catch {}
  }

  prepare(sql: string) {
    const stmt = this.raw.prepare(sql);
    return {
      all: (...values: unknown[]) => stmt.all(...values),
      get: (...values: unknown[]) => stmt.get(...values),
      run: (...values: unknown[]) => stmt.run(...values),
    };
  }

  exec(sql: string) {
    return this.raw.exec(sql);
  }

  pragma(sql: string) {
    try {
      return this.raw.exec(`PRAGMA ${sql};`);
    } catch {}
  }

  transaction(fn: (...args: any[]) => any) {
    return (...args: any[]) => {
      this.raw.exec("BEGIN");
      try {
        const result = fn(...args);
        this.raw.exec("COMMIT");
        return result;
      } catch (err) {
        this.raw.exec("ROLLBACK");
        throw err;
      }
    };
  }
}

async function createSqliteInstance(): Promise<SqliteDatabaseAdapter> {
  try {
    const sqliteModule = await import("node:sqlite");
    if (sqliteModule && sqliteModule.DatabaseSync) {
      return new NodeSqliteAdapter(new sqliteModule.DatabaseSync(":memory:"));
    }
  } catch {}

  try {
    const betterSqlite = await import("better-sqlite3");
    const Database = betterSqlite.default || betterSqlite;
    const db = new Database(":memory:");
    try { db.pragma("journal_mode = WAL"); } catch {}
    return db;
  } catch (e) {
    throw new Error("Cannot initialize SQLite database engine: " + String(e));
  }
}

const TABLES = [
  "system_settings",
  "line_groups",
  "line_group_registry",
  "line_webhook_events",
  "operational_sites",
  "shift_templates",
  "coverage_slots",
  "billing_cases",
  "audit_logs",
  "line_auto_reply_configs",
  "line_sticker_presets",
  "line_outbound_audit",
  "line_queued_stickers",
  "line_manual_batch_jobs",
  "guard_profiles",
  "employer_inquiries",
] as const;

type TableName = (typeof TABLES)[number];
type RemoteDocument = { id: string; data: Row };
type RemoteChange = { table: TableName; upserts: Row[]; deletes: string[] };

function firestoreFields(row: Row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, firestoreField(value)]));
}

function firestoreField(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (value instanceof Uint8Array) return { bytesValue: Buffer.from(value).toString("base64") };
  return { stringValue: String(value) };
}

function readFirestoreField(value: unknown): SqlValue {
  if (!value || typeof value !== "object") return null;
  const field = value as Record<string, unknown>;
  if ("nullValue" in field) return null;
  if (typeof field.stringValue === "string") return field.stringValue;
  if (typeof field.booleanValue === "boolean") return field.booleanValue ? 1 : 0;
  if (typeof field.integerValue === "string") return Number(field.integerValue);
  if (typeof field.doubleValue === "number") return field.doubleValue;
  if (typeof field.timestampValue === "string") return field.timestampValue;
  if (typeof field.bytesValue === "string") return Buffer.from(field.bytesValue, "base64");
  return null;
}

function readFirestoreDocument(document: unknown): Row {
  const fields = document && typeof document === "object" && "fields" in document
    ? (document as { fields?: Record<string, unknown> }).fields ?? {}
    : {};
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, readFirestoreField(value)]));
}

class FirestoreRest {
  readonly projectId: string | undefined;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(projectId: string | undefined) {
    this.projectId = projectId;
  }

  isConfigured() {
    return Boolean(this.projectId && this.projectId.trim().length > 0);
  }

  async list(table: TableName): Promise<RemoteDocument[] | null> {
    if (!this.isConfigured()) return null;
    const documents: RemoteDocument[] = [];
    let pageToken = "";
    do {
      const suffix = pageToken ? `?pageSize=1000&pageToken=${encodeURIComponent(pageToken)}` : "?pageSize=1000";
      const response = await this.request(this.collectionUrl(table) + suffix);
      if (!response) return null;
      const payload = await response.json() as { documents?: unknown[]; nextPageToken?: string };
      for (const document of payload.documents ?? []) {
        const name = typeof document === "object" && document && "name" in document
          ? String((document as { name?: unknown }).name ?? "")
          : "";
        const id = name.split("/").pop() ?? "";
        if (id) documents.push({ id, data: readFirestoreDocument(document) });
      }
      pageToken = payload.nextPageToken ?? "";
    } while (pageToken);
    return documents;
  }

  async set(table: TableName, id: string, row: Row) {
    const response = await this.request(this.documentUrl(table, id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: firestoreFields(row) }),
    });
    return Boolean(response);
  }

  async delete(table: TableName, id: string) {
    const response = await this.request(this.documentUrl(table, id), { method: "DELETE" }, true);
    return Boolean(response);
  }

  private collectionUrl(table: TableName) {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.projectId!)}/databases/(default)/documents/command_center/${table}/rows`;
  }

  private documentUrl(table: TableName, id: string) {
    return `${this.collectionUrl(table)}/${encodeURIComponent(id)}`;
  }

  private async request(url: string, init: RequestInit = {}, allowNotFound = false) {
    const token = await this.accessToken();
    if (!token) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
        signal: controller.signal,
      });
      return response.ok || (allowNotFound && response.status === 404) ? response : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private async accessToken() {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6_000);
    try {
      const response = await fetch(
        "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
        { headers: { "Metadata-Flavor": "Google" }, signal: controller.signal },
      );
      if (!response.ok) return null;
      const payload = await response.json() as { access_token?: string; expires_in?: number };
      if (!payload.access_token) return null;
      this.token = payload.access_token;
      this.tokenExpiresAt = Date.now() + Math.max(60, Number(payload.expires_in ?? 300) - 60) * 1_000;
      return this.token;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

function tableNames(sql: string) {
  const names = new Set<TableName>();
  const pattern = /\b(?:FROM|INTO|UPDATE|TABLE|JOIN)\s+[`"']?([a-z_][a-z0-9_]*)/gi;
  for (const match of sql.matchAll(pattern)) {
    const name = match[1]?.toLowerCase() as TableName | undefined;
    if (name && TABLES.includes(name)) names.add(name);
  }
  return [...names];
}

function documentId(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function rowKey(table: TableName, row: Row) {
  const key = table === "system_settings" ? row.key : row.id;
  return String(key ?? "");
}

function sameRow(left: Row, right: Row | undefined) {
  if (!right) return false;
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  if (leftEntries.length !== rightEntries.length) return false;
  return leftEntries.every(([key, value]) => {
    const candidate = right[key];
    if (value instanceof Uint8Array || candidate instanceof Uint8Array) {
      return value instanceof Uint8Array && candidate instanceof Uint8Array
        && Buffer.from(value).equals(Buffer.from(candidate));
    }
    return value === candidate;
  });
}

function firestoreValue(value: unknown) {
  if (value === undefined) return null;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "bigint") return Number(value);
  return value;
}

function normalizeValue(value: unknown): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (value instanceof Uint8Array) return value;
  if (typeof value === "object" && value && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return String(value);
}

class FirebaseStatement {
  private values: SqlValue[] = [];
  readonly owner: FirebaseD1Database;
  readonly sql: string;

  constructor(owner: FirebaseD1Database, sql: string) {
    this.owner = owner;
    this.sql = sql;
  }

  bind(...values: SqlValue[]) {
    this.values = values;
    return this;
  }

  all<T extends Row = Row>() {
    return this.owner.all<T>(this.sql, this.values);
  }

  first<T extends Row = Row>() {
    return this.owner.first<T>(this.sql, this.values);
  }

  run() {
    return this.owner.run(this.sql, this.values);
  }
}

export class FirebaseD1Database {
  private remote: FirestoreRest | null = null;
  private sqlite: SqliteDatabaseAdapter | null = null;
  private hydrated = false;
  private initialized: Promise<void> | null = null;
  private lastHydratedAt = 0;
  private writeQueue: Promise<void> = Promise.resolve();
  private pendingRemote = new Map<TableName, Map<string, Row | null>>();
  private remoteAvailable = true;
  private remoteHydration: Promise<void> | null = null;

  prepare(sql: string) {
    return new FirebaseStatement(this, sql);
  }

  async batch(statements: FirebaseStatement[]) {
    await this.ensureSqlite();
    const isSchemaBatch = statements.length > 0 && statements.every((statement) =>
      /^\s*(?:(?:CREATE\s+(?:(?:UNIQUE|TEMPORARY)\s+)?(?:TABLE|INDEX)\b)|(?:ALTER\s+TABLE\b)|PRAGMA\b)/i
        .test((statement as unknown as { sql: string }).sql),
    );
    if (!this.hydrated && !isSchemaBatch) await this.ensureReady();

    const touchedTables = [...new Set(statements.flatMap((statement) =>
      tableNames((statement as unknown as { sql: string }).sql),
    ))];
    const before = isSchemaBatch ? new Map<TableName, Map<string, Row>>() : this.snapshotTables(touchedTables);
    const affected = new Set<TableName>();
    const runBatch = this.sqlite!.transaction(() => {
      for (const statement of statements) {
        const raw = statement as unknown as { sql: string; values: SqlValue[] };
        try {
          this.sqlite!.prepare(raw.sql).run(...raw.values);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (!/duplicate column name|already exists/i.test(message)) throw error;
        }
        tableNames(raw.sql).forEach((table) => affected.add(table));
      }
    });
    runBatch();

    if (isSchemaBatch) {
      this.markReady();
      await this.hydrateRemote();
    } else if (affected.size) {
      await this.persist(this.diffSnapshots(before, this.snapshotTables([...affected])));
    }
    return { success: true, meta: { changes: statements.length } };
  }

  async all<T extends Row>(sql: string, values: SqlValue[]) {
    await this.ensureReady();
    const rows = this.sqlite!.prepare(sql).all(...values) as T[];
    return { results: rows };
  }

  async first<T extends Row>(sql: string, values: SqlValue[]) {
    await this.ensureReady();
    return (this.sqlite!.prepare(sql).get(...values) as T | undefined) ?? null;
  }

  async run(sql: string, values: SqlValue[]) {
    await this.ensureReady();
    const affected = tableNames(sql);
    const before = affected.length ? this.snapshotTables(affected) : new Map<TableName, Map<string, Row>>();
    const result = this.sqlite!.prepare(sql).run(...values);
    if (affected.length && result?.changes > 0) await this.persist(this.diffSnapshots(before, this.snapshotTables(affected)));
    const changesCount = Number(result?.changes ?? 0);
    return { success: true, changes: changesCount, meta: { changes: changesCount, last_row_id: Number(result?.lastInsertRowid ?? 0) } };
  }

  async refreshIfStale(maxAgeMs = 3000) {
    if (!this.hydrated) return;
    if (this.remoteHydration) {
      await this.remoteHydration;
      return;
    }
    if (Date.now() - this.lastHydratedAt < maxAgeMs) return;
    await this.hydrateRemote();
  }

  private async ensureSqlite() {
    if (this.sqlite) return;
    if (!this.initialized) {
      this.initialized = createSqliteInstance().then((instance) => {
        this.sqlite = instance;
      });
    }
    await this.initialized;
  }

  private async ensureReady() {
    await this.ensureSqlite();
    if (!this.hydrated) {
      this.markReady();
      await this.hydrateRemote();
      return;
    }
    if (this.remoteHydration) await this.remoteHydration;
  }

  private getRemote() {
    this.remote ??= new FirestoreRest(
      process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID,
    );
    return this.remote;
  }

  private async withTimeout<T>(operation: Promise<T>, timeoutMs = 12_000): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private markReady() {
    this.hydrated = true;
    this.lastHydratedAt = Date.now();
  }

  private async hydrateRemote() {
    const remote = this.getRemote();
    if (!remote.isConfigured()) {
      this.lastHydratedAt = Date.now();
      return;
    }

    if (!this.remoteAvailable) {
      throw new Error("Firestore ยังไม่พร้อมสำหรับการกู้ข้อมูล");
    }
    if (this.remoteHydration) return this.remoteHydration;
    this.remoteHydration = (async () => {
      await this.ensureSqlite();
      for (const table of TABLES) {
        const exists = this.sqlite!.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
        if (!exists) continue;
        const columns = (this.sqlite!.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name);
        const snapshot = await this.withTimeout(remote.list(table));
        if (!snapshot) continue;
        if (snapshot.length && columns.length) {
          const localCount = Number((this.sqlite!.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count?: number } | undefined)?.count ?? 0);
          if (localCount > 0) continue;
          const allowed = new Set(columns);
          const insert = this.sqlite!.prepare(`INSERT OR REPLACE INTO ${table} (${columns.map((column) => `\"${column}\"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`);
          const transaction = this.sqlite!.transaction((docs: Row[]) => {
            for (const document of docs) {
              const data = document;
              insert.run(...columns.map((column) => allowed.has(column) ? normalizeValue(data[column]) : null));
            }
          });
          transaction(snapshot.map((document) => document.data));
        }
      }
      this.lastHydratedAt = Date.now();
    })();
    try {
      await this.remoteHydration;
    } finally {
      this.remoteHydration = null;
    }
  }

  private snapshotTables(tables: TableName[]) {
    const snapshots = new Map<TableName, Map<string, Row>>();
    for (const table of tables) {
      const rows = this.sqlite!.prepare(`SELECT * FROM ${table}`).all() as Row[];
      snapshots.set(table, new Map(rows.map((row) => [rowKey(table, row), row])));
    }
    return snapshots;
  }

  private diffSnapshots(before: Map<TableName, Map<string, Row>>, after: Map<TableName, Map<string, Row>>): RemoteChange[] {
    const changes: RemoteChange[] = [];
    for (const [table, current] of after) {
      const prior = before.get(table) ?? new Map<string, Row>();
      const upserts = [...current.entries()]
        .filter(([key, row]) => key && !sameRow(row, prior.get(key)))
        .map(([, row]) => row);
      const deletes = [...prior.keys()].filter((key) => key && !current.has(key));
      if (upserts.length || deletes.length) changes.push({ table, upserts, deletes });
    }
    return changes;
  }

  private enqueueRemote(changes: RemoteChange[]) {
    for (const change of changes) {
      const pending = this.pendingRemote.get(change.table) ?? new Map<string, Row | null>();
      for (const key of change.deletes) pending.set(key, null);
      for (const row of change.upserts) {
        const key = rowKey(change.table, row);
        if (key) pending.set(key, row);
      }
      if (pending.size) this.pendingRemote.set(change.table, pending);
    }
  }

  private async persist(changes: RemoteChange[]) {
    if (!changes.length) return;
    const remote = this.getRemote();
    if (!remote.isConfigured()) return;

    if (!this.remoteAvailable) {
      throw new Error("Firestore ยังไม่พร้อมบันทึกข้อมูล");
    }
    this.enqueueRemote(changes);
    this.writeQueue = this.writeQueue.catch(() => undefined).then(async () => {
      await this.ensureReady();
      if (!this.remoteAvailable) {
        throw new Error("Firestore ยังไม่พร้อมบันทึกข้อมูล");
      }
      try {
        for (const [table, pending] of [...this.pendingRemote.entries()]) {
          for (const [key, row] of [...pending.entries()]) {
            const written = row === null
              ? await remote.delete(table, documentId(key))
              : await remote.set(table, documentId(key), {
                ...Object.fromEntries(Object.entries(row).map(([name, value]) => [name, firestoreValue(value)])),
                row_key: key,
              });
            if (!written) throw new Error("Firestore ไม่ยืนยันการบันทึกข้อมูล");
            if (pending.get(key) === row) pending.delete(key);
          }
          if (!pending.size) this.pendingRemote.delete(table);
        }
      } finally {
        this.lastHydratedAt = Date.now();
      }
    });
    await this.writeQueue;
  }
}

let singleton: FirebaseD1Database | null = null;

export function getFirebaseD1Database() {
  singleton ??= new FirebaseD1Database();
  return singleton;
}
