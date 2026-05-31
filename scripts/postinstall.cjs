// Copy variant .rhai files to public/variants/ for static serving.
// In dev mode the symlink suffices; this ensures production builds have real files.
const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "..", "variants");
const dest = path.resolve(__dirname, "..", "public", "variants");

// Remove symlink if it exists, create real directory
try { fs.unlinkSync(dest); } catch (_) {}
fs.mkdirSync(dest, { recursive: true });

for (const f of fs.readdirSync(src)) {
  if (f.endsWith(".rhai")) {
    fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
}
