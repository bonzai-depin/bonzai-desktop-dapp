/**
 * Post-install patch for vue-sound.
 *
 * Removes the global window keydown listener that every VueSound instance
 * registers in its created() hook. Without this patch, Space/Enter/Arrow
 * keys toggle play or adjust volume on ALL player instances at once, and
 * interfere with text inputs elsewhere in the app.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const patches = [
  {
    file: join(root, "node_modules/vue-sound/dist/vue-sound.es.js"),
    from: `  created() {
    this.innerLoop = this.loop;
    window.addEventListener("keydown", (event) => {
      switch (event.code) {
        case "Space":
          this.togglePlay();
          break;
        case "Enter":
          this.togglePlay();
          break;
        case "ArrowUp":
          if (this.volume < 100)
            this.volume++;
          break;
        case "ArrowDown":
          if (this.volume > 0)
            this.volume--;
          break;
        case "ArrowLeft":
          this.goBack15();
          break;
        case "ArrowRight":
          this.goAhead15();
          break;
      }
    });
  },`,
    to: `  created() {
    this.innerLoop = this.loop;
  },`,
  },
  {
    file: join(root, "node_modules/vue-sound/dist/vue-sound.umd.js"),
    from: `created(){this.innerLoop=this.loop,window.addEventListener("keydown",l=>{switch(l.code){case"Space":this.togglePlay();break;case"Enter":this.togglePlay();break;case"ArrowUp":this.volume<100&&this.volume++;break;case"ArrowDown":this.volume>0&&this.volume--;break;case"ArrowLeft":this.goBack15();break;case"ArrowRight":this.goAhead15();break}})},`,
    to: `created(){this.innerLoop=this.loop},`,
  },
];

let patched = 0;
for (const { file, from, to } of patches) {
  if (!existsSync(file)) continue;
  const src = readFileSync(file, "utf8");
  if (src.includes(from)) {
    writeFileSync(file, src.replace(from, to), "utf8");
    patched++;
    console.log(`[patch-vue-sound] patched ${file}`);
  } else if (src.includes(to)) {
    console.log(`[patch-vue-sound] already patched ${file}`);
  } else {
    console.warn(`[patch-vue-sound] could not find target in ${file} — skipping`);
  }
}
if (patched > 0) console.log(`[patch-vue-sound] done (${patched} file(s))`);
