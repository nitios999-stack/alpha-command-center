import vinext from "vinext";
import { defineConfig } from "vite";

/** Node.js build used by Firebase App Hosting. */
export default defineConfig({
  plugins: [vinext()],
  ssr: {
    external: ["@google-cloud/firestore", "better-sqlite3"],
  },
});
