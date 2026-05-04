/**
 * Turbopack (Next.js 16) incorrectly simplifies \x00 → \0 inside template
 * literals. When \x00 is immediately followed by a decimal digit, the result
 * is an illegal legacy octal escape (\00–\09), causing a SyntaxError in the
 * browser before the chunk can even be evaluated.
 *
 * This script replaces every \x00digit occurrence in binaryen's index.js with
 * the semantically identical \u0000digit. Unicode escapes are not simplified
 * by Turbopack, so the output chunk stays valid.
 *
 * Run automatically via the "postinstall" npm script.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, "../node_modules/binaryen/index.js");

const original = readFileSync(target, "utf8");
const patched = original.replace(/\\x00([0-9])/g, "\\u0000$1");
const count = (original.match(/\\x00[0-9]/g) ?? []).length;

if (count === 0) {
  console.log("fix-binaryen: nothing to patch");
} else {
  writeFileSync(target, patched, "utf8");
  console.log(`fix-binaryen: replaced ${count} \\x00<digit> → \\u0000<digit> in binaryen/index.js`);
}
