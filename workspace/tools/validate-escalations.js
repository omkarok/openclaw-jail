#!/usr/bin/env node
const fs=require('fs');
const p='/home/node/workspace/escalations.json';
function fail(m){console.error(m);process.exit(1)}
let j;try{j=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){fail('invalid JSON: '+e.message)}
if (!Array.isArray(j.escalations)) fail('missing escalations array');
for (const [i,e] of j.escalations.entries()){
  for (const k of ['id','created_at','acknowledged','source','task_id','dedup_key']){ if (typeof e[k]==='undefined') fail(`missing ${k} at index ${i}`) }
}
console.log('escalations.json OK');
