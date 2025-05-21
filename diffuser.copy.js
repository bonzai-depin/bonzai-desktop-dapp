import { copyFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Derive __dirname in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = path.resolve(__dirname, "src/server/diffuser.py");
const destDir = path.resolve(__dirname, ".vite/build");

mkdirSync(destDir, { recursive: true });
copyFileSync(source, path.join(destDir, "diffuser.py"));

console.log("Copied diffuser.py to .vite/build/");
