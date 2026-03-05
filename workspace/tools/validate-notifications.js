#!/usr/bin/env node
const fs=require('fs');
const p='/home/node/workspace/notifications.json';
function fail(m){console.error(m);process.exit(1)}
let j;try{j=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){fail('invalid JSON: '+e.message)}
if (typeof j.schema_version==='undefined') fail('missing schema_version');
if (!Array.isArray(j.notifications)) fail('missing notifications array');
for (const [i,n] of j.notifications.entries()){
  if(!n.id||!n.created_at||typeof n.sent!=='boolean'||!n.message) fail(`invalid notification at index ${i}`)
}
console.log('notifications.json OK');
