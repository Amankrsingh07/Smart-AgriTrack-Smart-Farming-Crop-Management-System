import ts from "typescript";
import {readFileSync,writeFileSync,readdirSync} from "node:fs";
import path from "node:path";
const files:string[]=[];
function walk(dir:string){for(const e of readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(/\.(tsx?|json)$/.test(file))files.push(file);}}
for(const dir of ['src/app/(app)/crop-loss','src/app/api/crop-protection','src/app/api/crop-loss','src/app/api/fertilizer'])walk(dir);
for(const file of readdirSync('src/lib'))if(/^(crop-protection|crop-loss|smart-fertilizer)/.test(file)&&file.endsWith('.ts'))files.push('src/lib/'+file);
files.push('src/app/(app)/app-nav.tsx');
const texts=new Set<string>();
function add(value:string){const v=value.replace(/\s+/g,' ').trim();if(!/[A-Za-z]/.test(v)||v.length<3||v.length>2200||/^https?:|^\/(api|crop)|^image\//.test(v)||(/^[a-z0-9_:.\-/]+$/.test(v)&&!v.includes(' ')))return;texts.add(v);}
for(const file of files){if(file.endsWith('.json'))continue;const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);function visit(node:ts.Node){if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))return;
 if(ts.isJsxText(node))add(node.text);
 if(ts.isStringLiteral(node)&&!(ts.isPropertyAssignment(node.parent)&&node.parent.name===node)&&!ts.isLiteralTypeNode(node.parent))add(node.text);
 if(ts.isTemplateExpression(node)){let text=node.head.text;node.templateSpans.forEach((span,i)=>{text+=`{v${i}}`+span.literal.text;});add(text);}
 ts.forEachChild(node,visit);}visit(source);}
const kb=JSON.parse(readFileSync('src/data/agriculture/releases/2026-11-15.1/knowledge.json','utf8'));
for(const r of kb.records)for(const key of ['name','category','diagnostics','prevention','management','severity','conditions','causes','geographicApplicability','evidenceLimitations'])add(r[key]);
for(const file of ['src/data/agriculture/product-restrictions.json','src/data/agriculture/water-quality-fao.json']){const d=JSON.parse(readFileSync(file,'utf8'));function strings(v:unknown){if(typeof v==='string')add(v);else if(Array.isArray(v))v.forEach(strings);else if(v&&typeof v==='object')Object.values(v).forEach(strings);}strings(d);}
const result=[...texts].sort();writeFileSync('src/i18n/crop-protection/en.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({strings:result.length,characters:result.join('').length}));
