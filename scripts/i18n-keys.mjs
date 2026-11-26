// Lists every English sentence the app can show, and checks that Hindi and Gujarati have each one.
//   node scripts/i18n-keys.mjs          -> check (exit 1 if a translation is missing or its {values} differ)
//   node scripts/i18n-keys.mjs --list   -> print the sentences as JSON
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Label tables written in English at the top of a file and translated where they are shown.
const TABLES = new Set(["STATUSES", "LABEL", "ROLES", "ENTITY", "ACTION", "ROLE_LABEL", "KIND", "EXPENSE_MODES", "TABS", "GOOGLE_MESSAGE", "PAYMENT_NOTE", "ADJ_LABEL", "KINDS", "KIND_LABEL", "SALE_MODE_LABEL", "UNIT_LABEL", "PAY_MODE_LABEL", "SLOT_LABEL", "BOOKING_STATUS_LABEL", "CLOSED", "RULES_AT_A_GLANCE"]);
const NOT_TEXT = new Set(["tone", "value", "key", "icon", "href", "sign", "v"]);
const MESSAGE_CALLS = new Set(["ok", "fail", "UserError", "Forbidden", "owned", "checkPlanLimit"]);
// Shown through a variable, so no t("...") call names them.
const EXTRA = ["Save", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "On credit", "employees", "logins", "admin", "manager", "cashier", "partner", "viewer", "employee", "superadmin"];

const SKIP = ["src/app/welcome/", "src/app/terms/", "src/i18n/hi.ts", "src/i18n/gu.ts"];
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const keys = new Map();
const add = (s, file) => {
  if (/[A-Za-z]{2,}/.test(s) && !keys.has(s)) keys.set(s, file);
};
const strings = (node, file, cb) => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) cb(node.text);
  else if (ts.isConditionalExpression(node)) [node.whenTrue, node.whenFalse].forEach((n) => strings(n, file, cb));
  else if (ts.isParenthesizedExpression(node)) strings(node.expression, file, cb);
};
for (const abs of walk(path.join(ROOT, "src"))) {
  const file = path.relative(ROOT, abs);
  if (SKIP.some((s) => file.startsWith(s))) continue;
  const sf = ts.createSourceFile(abs, fs.readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && ts.isIdentifier(node.expression)) {
      const name = node.expression.text;
      const args = node.arguments ?? [];
      if (name === "t" && args[0]) strings(args[0], file, (s) => add(s, file));
      if (MESSAGE_CALLS.has(name)) args.forEach((a) => strings(a, file, (s) => add(s, file)));
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && TABLES.has(node.name.text) && node.initializer && ts.isSourceFile(node.parent.parent.parent)) {
      const inner = (n) => {
        if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !(ts.isPropertyAssignment(n.parent) && (n.parent.name === n || NOT_TEXT.has(n.parent.name.getText(sf))))) add(n.text, file);
        ts.forEachChild(n, inner);
      };
      inner(node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
EXTRA.forEach((s) => add(s, "(extra)"));

if (process.argv.includes("--list")) {
  console.log(JSON.stringify([...keys.keys()], null, 0));
  process.exit(0);
}
const load = (name) => {
  const src = fs.readFileSync(path.join(ROOT, `src/i18n/${name}.ts`), "utf8");
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const m = { exports: {} };
  new Function("module", "exports", js)(m, m.exports);
  return m.exports[name];
};
const holes = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
let bad = 0;
for (const lang of ["hi", "gu"]) {
  const dict = load(lang);
  for (const [k, file] of keys) {
    if (!(k in dict)) {
      bad++;
      console.log(`${lang}: missing  ${JSON.stringify(k)}  (${file})`);
    } else if (holes(k) !== holes(dict[k])) {
      bad++;
      console.log(`${lang}: {values} differ  ${JSON.stringify(k)} -> ${JSON.stringify(dict[k])}`);
    }
  }
  const unused = Object.keys(dict).filter((k) => !keys.has(k));
  if (unused.length) console.log(`${lang}: ${unused.length} unused, e.g. ${JSON.stringify(unused.slice(0, 5))}`);
}
console.log(`${keys.size} sentences, ${bad} problems`);
process.exit(bad ? 1 : 0);
