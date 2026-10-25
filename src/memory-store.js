import {Worker} from 'node:worker_threads';
// Async worker facade: persistence/search never runs SQLite on the chat loop.
export function createMemoryStore(options){
 const {onError,...workerData}=options;
 const worker=new Worker(new URL('./memory-worker.js',import.meta.url),{workerData,execArgv:process.execArgv.filter(arg=>!arg.startsWith('--input-type'))});
 let serial=0,failed=null,closed=false;const pending=new Map(),profiles=new Map();
 const fail=e=>{failed=e;for(const p of pending.values()){clearTimeout(p.timer);p.reject(e);}pending.clear();options.onError?.(e);};
 worker.on('error',fail);worker.on('exit',code=>{if(pending.size)fail(Error(`memory worker exited ${code}`));});
 worker.on('message',m=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.result);});
 function call(op,args={}){if(failed || closed)return Promise.reject(failed || Error('memory store closed'));return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>{pending.delete(id);reject(Error('memory operation timed out'));},10000);timer.unref();pending.set(id,{resolve,reject,timer});worker.postMessage({id,op,args});});}
 async function update(op,a){const p=await call(op,a);profiles.set(a.key,p);return p;}
 return {call,archive:a=>call('archive',a),batch:events=>call('batch',{events}),fact:a=>update('fact',a),remove:a=>update('remove',a),profile:key=>update('profile',{key}),core:key=>profiles.get(key)?.text||'',search:a=>call('search',a),get:a=>call('get',a),stats:key=>call('stats',{key}),async close(){try{await call('close');}finally{closed=true;await worker.terminate();}}};
}

// Preserve prose and paths; remove known credentials and credential-shaped fields.
export function sanitizeMemoryText(value,secrets=[]){
 let text=String(value??'');for(const secret of secrets){if(typeof secret==='string'&&secret.length>=6)text=text.split(secret).join('[凭据已隐藏]');}
 return text.replace(/Bearer\s+[^\s"'`]+/gi,'Bearer [凭据已隐藏]')
 .replace(/((?:["']?(?:cookies?|authorization|secret|p_skey|skey|pt4_token|clientkey|access[_-]?token|api[_-]?key|password|密码|token)["']?)\s*[:=：]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s;,}\n]+)/gi,'$1[凭据已隐藏]');
}

export function sanitizeMemoryValue(value,secrets=[]){
 if (typeof value==='string') return sanitizeMemoryText(value,secrets);
 if (Array.isArray(value)) return value.map(v=>sanitizeMemoryValue(v,secrets));
 if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,/^(?:token|accessToken|apiKey|password|p_skey|skey|clientkey|authorization|cookie)$/i.test(k)?'[凭据已隐藏]':sanitizeMemoryValue(v,secrets)]));
 return value;
}
