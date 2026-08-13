import { getFirebaseD1Database } from "../lib/firebase-d1";

/** Firebase-backed SQL compatibility entry point for the command center. */
export function getDb() {
  return getFirebaseD1Database();
}
