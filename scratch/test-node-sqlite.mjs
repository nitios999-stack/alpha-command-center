import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("CREATE TABLE test (id TEXT PRIMARY KEY, val TEXT)");
const stmt = db.prepare("INSERT INTO test (id, val) VALUES (?, ?)");
const res = stmt.run("1", "hello");
console.log("Run res:", res);

const getStmt = db.prepare("SELECT * FROM test WHERE id = ?");
console.log("Get res:", getStmt.get("1"));

const allStmt = db.prepare("SELECT * FROM test");
console.log("All res:", allStmt.all());

console.log("node:sqlite works 100%!");
