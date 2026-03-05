#!/usr/bin/env node
const fs=require('fs');
const p=process.argv[2];
if(!p){console.error('usage: validate-receipt.js <path>');process.exit(1)}
function fail(m){console.error(m);process.exit(1)}
let j; try{j=JSON.parse(fs.readFileSync(p,'utf8'))}catch(e){fail('invalid JSON: '+e.message)}
for (const k of ['timestamp','mandate_version','tasks_found','tasks_completed','tasks_failed','summary']){ if (typeof j[k]==='undefined') fail('missing '+k) }
for (const k of ['tasks_found','tasks_completed','tasks_failed','tasks_reset_recurring','tasks_reset_from_crash','tasks_blocked','tasks_processed','tasks_skipped_run_after','escalations_raised','escalations_deduped']){
  if (typeof j[k] !== 'number' || j[k] < 0) fail('invalid count '+k)
}
console.log('receipt OK:', p)
