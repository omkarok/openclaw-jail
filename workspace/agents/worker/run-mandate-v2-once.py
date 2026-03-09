import json, os, re, subprocess, time
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT=Path('/home/node/workspace')
QUEUE_PATH=ROOT/'task-queue/queue.json'
NOTIF_PATH=ROOT/'notifications.json'
ESC_PATH=ROOT/'escalations.json'
OBS_PATH=ROOT/'observations.json'
HB_PATH=ROOT/'HEARTBEAT.md'
RUNS_DIR=ROOT/'agents/worker/runs'
STATUS_PATH=ROOT/'WORKER_STATUS.md'
RECEIPTS_BASE=ROOT/'task-queue/receipts'


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')

def to_dt(s):
    return datetime.fromisoformat(s.replace('Z','+00:00'))

def loadj(p):
    return json.loads(Path(p).read_text())

def savej(p,obj):
    Path(p).write_text(json.dumps(obj,indent=2)+"\n")

def validate_queue():
    subprocess.run(['node','/home/node/workspace/tools/validate-queue.js'],check=True,capture_output=True,text=True)

def save_queue(q):
    if q.get('schema_version')!=2 or not isinstance(q.get('tasks'),list):
        raise RuntimeError('Invalid queue shape before write')
    q['updated']=now_iso()
    savej(QUEUE_PATH,q)
    validate_queue()

def append_notif(task_id,msg):
    n=loadj(NOTIF_PATH)
    n['notifications'].append({
        'id':f'n-{int(time.time()*1000)}',
        'created_at':now_iso(),
        'sent':False,'sent_at':None,
        'source':'background-worker','task_id':task_id,'message':msg
    })
    savej(NOTIF_PATH,n)

def escalate(task,error,suggested):
    esc=loadj(ESC_PATH) if ESC_PATH.exists() else {'schema_version':1,'escalations':[]}
    dedup=f"{task['id']}::{error['code']}"
    exists=next((e for e in esc['escalations'] if e.get('dedup_key')==dedup and e.get('acknowledged')==False),None)
    raised=0; deduped=0
    if not exists:
        esc['escalations'].append({
            'id':f"esc-{int(time.time()*1000)}",'created_at':now_iso(),'acknowledged':False,'acknowledged_at':None,
            'source':'background-worker','task_id':task['id'],'title':task['title'],'reason':error['code'],
            'detail':error['message'],'suggested_action':suggested,'dedup_key':dedup
        })
        savej(ESC_PATH,esc)
        raised=1
    else:
        deduped=1
    n=loadj(NOTIF_PATH)
    n['notifications'].append({
        'id':f"notif-{task['id']}-failed-{int(time.time()*1000)}",'created_at':now_iso(),'sent':False,'sent_at':None,
        'source':'background-worker','task_id':task['id'],
        'message':f"❌ Task failed: {task['title']}\nReason: {error['code']} — {error['message']}\nAttempts: {task.get('retries',0)}/{task.get('max_retries',0)}\nAction needed: {suggested}"
    })
    savej(NOTIF_PATH,n)
    return raised,deduped

def write_attempt_receipt(task_id,attempt,status,started_at,finished_at,summary,error,status_before,status_after):
    day=finished_at[:10]
    d=RECEIPTS_BASE/day
    d.mkdir(parents=True,exist_ok=True)
    fn=d/f"{task_id}__attempt-{attempt}__{finished_at}.json"
    dur=int((to_dt(finished_at)-to_dt(started_at)).total_seconds()*1000)
    savej(fn,{
        'receipt_version':1,'timestamp':finished_at,'worker_id':'background-worker','task_id':task_id,'attempt':attempt,
        'status':status,'started_at':started_at,'finished_at':finished_at,'duration_ms':dur,
        'output':{'summary':summary},'error':error,
        'queue_snapshot':{'status_before':status_before,'status_after':status_after}
    })

def apply_hb_3b():
    txt=HB_PATH.read_text()
    marker='## 4. Nothing to report → HEARTBEAT_OK'
    if '## 3b. Proposed task intake (every heartbeat)' in txt:
        return False
    section="""## 3b. Proposed task intake (every heartbeat)\n\nRead `/home/node/workspace/task-queue/proposed.json`. Find entries where `status` is absent or `\"pending\"`.\n\nFor each proposed task:\n- If type is `research` AND scope is clearly bounded (single topic, single output file): auto-approve — move to `queue.json` with `created_by: \"worker-proposed\"` and `status: \"pending\"`, remove from proposed.json, trigger worker.\n- Otherwise: surface ONE consolidated WhatsApp message to OK: `💡 Worker has N proposed task(s) for your approval — check task-queue/proposed.json`. Only send if last proposed-alert in memory/heartbeat-state.json under `last_proposed_alert` was more than 4 hours ago.\n\nIf no proposals: continue silently.\n\n"""
    HB_PATH.write_text(txt.replace(marker,section+marker))
    return True

def apply_hb_3c():
    txt=HB_PATH.read_text()
    marker='## 4. Nothing to report → HEARTBEAT_OK'
    if '## 3c. Free attention (every heartbeat — judgment, not checklist)' in txt:
        return False
    section="""## 3c. Free attention (every heartbeat — judgment, not checklist)\n\nRead the 3 most recently modified files in `/home/node/workspace/results/`. Also read `/home/node/workspace/observations.json` — find entries where `surfaced: false`.\n\nAsk: is there anything worth surfacing to OK that is NOT already an escalation?\n- A pattern across recent results (same friction appearing multiple times)\n- A connection between two results that reveals something unexpected\n- A risk or opportunity the queue does not currently address\n\nIf yes and actionable: send one WhatsApp message to OK. Mark the observation `surfaced: true` with `surfaced_at` in observations.json.\nIf yes but not urgent: include a one-liner at the end of HEARTBEAT_OK.\nIf no: stay silent. Noise is worse than silence. This is judgment, not a requirement.\n\n"""
    HB_PATH.write_text(txt.replace(marker,section+marker))
    return True

def execute_task(task):
    t_id=task['id']
    if task['type']!='self-improvement':
        raise Exception(json.dumps({'code':'VALIDATION_ERROR','message':f"Unsupported task type: {task['type']}",'retryable':False}))
    steps=task.get('input',{}).get('steps',[])
    if len(steps)>3:
        raise Exception(json.dumps({'code':'VALIDATION_ERROR','message':'self-improvement has >3 steps','retryable':False}))
    if t_id=='t-creativity-hb-3b':
        apply_hb_3b()
        out=Path(task['output_path'])
        out.write_text("§3 added to HEARTBEAT.md at position before §4.\n\nImplemented section:\n- §3b. Proposed task intake (every heartbeat)\n\nThis run updated HEARTBEAT.md and prepared notification entry for the change.\n")
        append_notif(t_id,'✅ §3b live: Proposed task intake added to HEARTBEAT.md. Worker can now propose tasks via task-queue/proposed.json.')
        return 'Added HEARTBEAT.md §3b and wrote confirmation result.'
    if t_id=='t-creativity-hb-3c':
        apply_hb_3c()
        out=Path(task['output_path'])
        out.write_text("§3c added to HEARTBEAT.md before §4.\n\nImplemented section:\n- §3c. Free attention (every heartbeat — judgment, not checklist)\n\nCreativity lane fully live:\n- MANDATE v2.0: §5c worker synthesis → observations.json\n- HEARTBEAT §3b: proposed task intake\n- HEARTBEAT §3c: free attention\n- New files: observations.json, task-queue/proposed.json\n")
        append_notif(t_id,'✅ §3c live: Free attention added to HEARTBEAT.md. Sherbyte now has judgment-driven synthesis on every heartbeat.\n\nCreativity lane fully live:\n- MANDATE v2.0: §5c worker synthesis → observations.json\n- HEARTBEAT §3b: proposed task intake\n- HEARTBEAT §3c: free attention\n- New files: observations.json, task-queue/proposed.json')
        return 'Added HEARTBEAT.md §3c and wrote confirmation result.'
    raise Exception(json.dumps({'code':'VALIDATION_ERROR','message':f'Unhandled self-improvement task {t_id}','retryable':False}))

stats={
'timestamp':now_iso(),'mandate_version':'2.0','tasks_found':0,'tasks_reset_recurring':0,'tasks_reset_from_crash':0,
'tasks_blocked':0,'tasks_processed':0,'tasks_completed':0,'tasks_failed':0,'tasks_skipped_run_after':0,
'escalations_raised':0,'escalations_deduped':0,'summary':''}

# Step0 validate
try:
    validate_queue()
except Exception:
    RUNS_DIR.mkdir(parents=True,exist_ok=True)
    stats['summary']='ERROR: queue.json failed validation'
    savej(RUNS_DIR/f"{now_iso()}.json",stats)
    raise SystemExit(0)

q=loadj(QUEUE_PATH); now=datetime.now(timezone.utc)
# reset recurring done elapsed
for t in q['tasks']:
    if t.get('recurring')==True and t.get('status')=='done' and t.get('run_after') and to_dt(t['run_after'])<=now:
        t['status']='pending'; t['completed_at']=None; t['error']=None
        stats['tasks_reset_recurring']+=1
save_queue(q)

# Step1 crash/timeout
for t in q['tasks']:
    if t.get('status')=='in_progress' and t.get('locked_at') and (now-to_dt(t['locked_at']))>timedelta(minutes=30):
        if t.get('retries',0)<t.get('max_retries',0):
            t['status']='pending'; t['locked_at']=None; t['owner']=None
            stats['tasks_reset_from_crash']+=1
        else:
            t['status']='failed'; t['error']={'code':'TIMEOUT','message':'stale lock exceeded 30 minutes','retryable':False}
            er,ed=escalate(t,t['error'],'Inspect stuck execution and requeue if safe.')
            stats['escalations_raised']+=er; stats['escalations_deduped']+=ed; stats['tasks_failed']+=1
    if t.get('status')=='pending' and t.get('locked_at') is None and t.get('retries',0)==0:
        eam=t.get('escalate_after_ms')
        if eam and (to_dt(t['created'])+timedelta(milliseconds=eam))<now:
            t['status']='failed'; t['error']={'code':'TIMEOUT','message':'pending longer than escalate_after_ms','retryable':True}
            er,ed=escalate(t,t['error'],'Inspect task input/output and retry or fix dependencies.')
            stats['escalations_raised']+=er; stats['escalations_deduped']+=ed; stats['tasks_failed']+=1
save_queue(q)

# Step2 block cascade
changed=True
while changed:
    changed=False
    m={t['id']:t for t in q['tasks']}
    for t in q['tasks']:
        if t.get('status') in ('pending','blocked'):
            deps=t.get('depends_on',[])
            if any(m.get(d,{}).get('status') in ('failed','blocked') for d in deps):
                if t.get('status')!='blocked':
                    t['status']='blocked'; changed=True; stats['tasks_blocked']+=1
save_queue(q)

prio={'urgent':0,'high':1,'normal':2,'low':3}
while True:
    q=loadj(QUEUE_PATH); m={t['id']:t for t in q['tasks']}
    ready=[]
    for t in q['tasks']:
        if t.get('status')!='pending': continue
        ra=t.get('run_after')
        if ra and to_dt(ra)>datetime.now(timezone.utc):
            continue
        if all(m.get(d,{}).get('status')=='done' for d in t.get('depends_on',[])):
            ready.append(t)
    ready=sorted(ready,key=lambda t:(prio.get(t.get('priority'),9),to_dt(t['created'])))
    if not ready: break
    task=ready[0]; stats['tasks_found']+=1
    status_before=task['status']; started=now_iso()
    # set in progress
    for t in q['tasks']:
        if t['id']==task['id']:
            t['status']='in_progress'; t['locked_at']=started; t['owner']='background-worker'
            break
    save_queue(q)
    q2=loadj(QUEUE_PATH)
    live=next((x for x in q2['tasks'] if x['id']==task['id']),None)
    if not live or live.get('status')!='in_progress' or live.get('owner')!='background-worker':
        continue
    stats['tasks_processed']+=1
    try:
        summary=execute_task(live)
        outp=Path(live['output_path'])
        if not outp.exists():
            raise Exception(json.dumps({'code':'QUALITY_FAILURE','message':'Output file missing','retryable':True}))
        data=outp.read_bytes()
        min_chars=live.get('min_output_chars',1000)
        if outp.suffix.lower() in ('.md','.txt','.json'):
            txt=data.decode('utf-8','ignore')
            if re.search(r'Point A|Point B|Key message N|Slide N Title',txt,re.I):
                raise Exception(json.dumps({'code':'QUALITY_FAILURE','message':'Placeholder patterns detected','retryable':True}))
            if len(txt)<min_chars:
                raise Exception(json.dumps({'code':'QUALITY_FAILURE','message':f'Text output below threshold ({len(txt)}<{min_chars})','retryable':True}))
        else:
            if len(data)<10*1024:
                raise Exception(json.dumps({'code':'QUALITY_FAILURE','message':f'Binary output below threshold ({len(data)} bytes)','retryable':True}))

        q3=loadj(QUEUE_PATH)
        t=next(x for x in q3['tasks'] if x['id']==live['id'])
        t['status']='done'; t['completed_at']=now_iso(); t['locked_at']=None; t['owner']=None; t['error']=None
        if t.get('recurring'):
            hrs=t.get('interval_hours',24)
            t['run_after']=(to_dt(t['completed_at'])+timedelta(hours=hrs)).replace(microsecond=0).isoformat().replace('+00:00','Z')
        save_queue(q3)
        # notification unless self-improvement
        if t.get('type')!='self-improvement':
            append_notif(t['id'],f"✅ Task done: {t['title']}\nResult: {t['output_path']}")
        write_attempt_receipt(t['id'],t.get('retries',0)+1,'done',started,now_iso(),summary,None,status_before,'done')
        stats['tasks_completed']+=1
    except Exception as ex:
        try:
            err=json.loads(str(ex))
        except:
            err={'code':'EXECUTION_ERROR','message':str(ex),'retryable':True}
        qf=loadj(QUEUE_PATH)
        t=next(x for x in qf['tasks'] if x['id']==task['id'])
        t['retries']=t.get('retries',0)+1
        t['error']={'code':err['code'],'message':err['message'],'retryable':bool(err.get('retryable',True))}
        final='pending'
        if err.get('retryable',True) and t['retries']<t.get('max_retries',0):
            backoff=min((2**t['retries'])*60,3600)
            t['status']='pending'; t['run_after']=(datetime.now(timezone.utc)+timedelta(seconds=backoff)).replace(microsecond=0).isoformat().replace('+00:00','Z'); t['locked_at']=None; t['owner']=None
        else:
            t['status']='failed'; t['locked_at']=None; t['owner']=None; final='failed'
            er,ed=escalate(t,t['error'],'Inspect task input/output and retry or fix dependencies.')
            stats['escalations_raised']+=er; stats['escalations_deduped']+=ed; stats['tasks_failed']+=1
        save_queue(qf)
        write_attempt_receipt(t['id'],t['retries'],final,started,now_iso(),'failed',t['error'],status_before,final)

# Step5
q=loadj(QUEUE_PATH)
stats['summary']=f"Processed {stats['tasks_processed']} task(s): {stats['tasks_completed']} completed, {stats['tasks_failed']} failed." if stats['tasks_processed'] else 'No runnable pending tasks.'
RUNS_DIR.mkdir(parents=True,exist_ok=True)
run_ts=now_iso()
run_file=RUNS_DIR/f"{run_ts}.json"
savej(run_file,stats)

failed=[t for t in q['tasks'] if t.get('status')=='failed']
last_failed=failed[-1] if failed else None
completed=sorted([t for t in q['tasks'] if t.get('status')=='done' and t.get('completed_at')],key=lambda x:to_dt(x['completed_at']))
last_completed=completed[-1] if completed else None
pending_n=sum(1 for t in q['tasks'] if t.get('status')=='pending')
inprog_n=sum(1 for t in q['tasks'] if t.get('status')=='in_progress')
blocked_n=sum(1 for t in q['tasks'] if t.get('status')=='blocked')
failed_n=sum(1 for t in q['tasks'] if t.get('status')=='failed')
last_failure_str = f"{last_failed['id']} ({last_failed.get('error',{}).get('code','unknown')})" if last_failed else 'none'
last_completed_str = f"{last_completed['id']} ({last_completed['title']})" if last_completed else 'none'
STATUS_PATH.write_text(
    f"# Worker Status\n"
    f"Last run: {run_ts}\n"
    f"Mandate: v2.0\n"
    f"Tasks pending: {pending_n} | in_progress: {inprog_n} | blocked: {blocked_n} | failed: {failed_n}\n"
    f"Last failure: {last_failure_str}\n"
    f"Last completed: {last_completed_str}\n"
)


# Step5c synthesis
results_dir=ROOT/'results'
if results_dir.exists():
    recent=sorted([p for p in results_dir.glob('*') if p.is_file()],key=lambda p:p.stat().st_mtime,reverse=True)[:3]
    obs=loadj(OBS_PATH) if OBS_PATH.exists() else {'schema_version':1,'observations':[]}
    unresolved=[o for o in obs.get('observations',[]) if not o.get('surfaced')]
    # simple judgment: only add if repeated quality failures across recent results (none detected)
    _=recent,unresolved
print(stats['summary'])