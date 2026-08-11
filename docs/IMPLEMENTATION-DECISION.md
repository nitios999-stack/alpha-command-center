# Implementation decision

The original plan permitted Firebase or another simple platform. The first web-app implementation uses the Sites Cloudflare Worker plus D1 binding so it can provide durable structured data immediately without waiting for a Firebase project, billing account, or credentials.

Business rules do not change:

- required staffing slots determine coverage;
- coverage and lateness are independent;
- managers can verify manually;
- audit records are append-only at the application layer;
- document, submission, and payment states are separate.

Before a production operational rollout, implement the next planned milestones: manager role/site scopes, real roster import, private LINE OA identity linking, signed webhook endpoint, scheduled alerts, backup/restore rehearsal, and real billing document workflows.
