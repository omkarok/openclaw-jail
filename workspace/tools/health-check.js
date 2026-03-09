const fs=require('fs'); const path=require('path');
const now=new Date();
const out={timestamp:now.toISOString(),queue:{pending:0,in_progress:0,failed:0,done:0,blocked:0},worker:{last_run_at:null,last_run_age_hours:null,last_run_status:null,last_run_tasks_completed:null},notifications:{unsent:0,dead_letter:0},escalations:{unacknowledged:0,oldest_unacked_hours:null},status:'healthy'};
const readj=(p)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch(e){return null;}};
try{const q=readj('/home/node/workspace/task-queue/queue.json'); if(q&&Array.isArray(q.tasks)){for(const t of q.tasks){const s=t.status||'unknown'; if(out.queue[s]!==undefined) out.queue[s]++;}}}catch{}
try{const d='/home/node/workspace/agents/worker/runs'; const files=fs.existsSync(d)?fs.readdirSync(d).filter(f=>f.endsWith('.json')).map(f=>path.join(d,f)):[]; files.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs); if(files[0]){const r=readj(files[0]); if(r){out.worker.last_run_at=r.timestamp||null; out.worker.last_run_status=(r.summary||'').startsWith('ERROR')?'error':'ok'; out.worker.last_run_tasks_completed=r.tasks_completed??null; if(out.worker.last_run_at){out.worker.last_run_age_hours=(Date.now()-new Date(out.worker.last_run_at).getTime())/3600000;}}}}catch{}
try{const n=readj('/home/node/workspace/notifications.json'); const arr=n&&Array.isArray(n.notifications)?n.notifications:[]; out.notifications.unsent=arr.filter(x=>x.sent===false).length; out.notifications.dead_letter=arr.filter(x=>x.dead_letter===true).length;}catch{}
try{const e=readj('/home/node/workspace/escalations.json'); const arr=e&&Array.isArray(e.escalations)?e.escalations:[]; const un=arr.filter(x=>x.acknowledged===false); out.escalations.unacknowledged=un.length; if(un.length){const oldest=un.map(x=>new Date(x.created_at).getTime()).filter(x=>!Number.isNaN(x)).sort((a,b)=>a-b)[0]; if(oldest) out.escalations.oldest_unacked_hours=(Date.now()-oldest)/3600000;}}catch{}
const age=out.worker.last_run_age_hours;
if((age!==null && age>72) || (out.escalations.unacknowledged>0 && (out.escalations.oldest_unacked_hours||0)>2)) out.status='critical';
else if((age!==null && age>=26) || out.notifications.unsent>5 || out.queue.pending>=10) out.status='degraded';
else out.status='healthy';
process.stdout.write(JSON.stringify(out));
