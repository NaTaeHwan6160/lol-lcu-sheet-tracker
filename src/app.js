const fs=require('fs');const path=require('path');const http=require('http');const {authenticate,createWebSocketConnection}=require('league-connect');const sheets=require('./sheets');const settings=require('./settings');
const root=path.resolve(__dirname,'..'),configFile=path.join(root,'config.json'),stateFile=path.join(root,'runtime-state.json');
const defaults={players:[],autoDiscover:true,includeLeavers:true,excludeEarlySurrender:true};
const state={connection:'waiting',pending:[],lastGame:'',lastError:'',logs:[]};
let config=defaults,ws=null,busy=false,lastEog=null,lastPhase='';
const log=(m)=>{state.logs.unshift(new Date().toLocaleTimeString('ko-KR')+' '+m);state.logs=state.logs.slice(0,40);console.log(m);};
function save(){fs.writeFileSync(configFile,JSON.stringify(config,null,2),'utf8');}
function load(){if(fs.existsSync(configFile))config={...defaults,...JSON.parse(fs.readFileSync(configFile,'utf8'))};else save();if(fs.existsSync(stateFile)){try{state.pending=JSON.parse(fs.readFileSync(stateFile,'utf8')).pending||[];}catch{}}}
function persistPending(){fs.writeFileSync(stateFile,JSON.stringify({pending:state.pending},null,2));}
function norm(k){return String(k||'').trim().toLowerCase();}
function riotKey(p){const name=p?.riotIdGameName||'',tag=p?.riotIdTagLine||'';return tag?name+'#'+tag:name;}
function playerFor(p){const full=norm(riotKey(p));return config.players.find(x=>(x.matchKeys||[]).some(k=>norm(k)===full))||null;}
function discover(players){if(!config.autoDiscover)return;for(const p of players){const key=riotKey(p);if(!key||playerFor(p)||state.pending.some(x=>norm(x.key)===norm(key)))continue;state.pending.push({key,displayName:p.riotIdGameName||key,detectedAt:new Date().toISOString()});log('미등록 플레이어 발견: '+key);}persistPending();}
function playersOf(data){return Array.isArray(data?.teams)?data.teams.flatMap(t=>Array.isArray(t?.players)?t.players:[]):[];}
function early(players){return players.some(p=>Number(p?.stats?.GAME_ENDED_IN_EARLY_SURRENDER||0)>0);}
function leaver(players){return players.some(p=>Object.entries(p?.stats||{}).some(([k,v])=>/(AFK|LEAVE|LEAVER)/i.test(k)&&Number(v)>0));}
async function processGame(data){if(!data?.gameId)return;const players=playersOf(data);if(!players.length)return;discover(players);
 if(config.excludeEarlySurrender&&early(players)){log('조기 항복 게임 제외');return;}
 if(!config.includeLeavers&&leaver(players)){log('탈주 포함 게임 제외');return;}
 for(const p of players){const target=playerFor(p);if(!target)continue;await sheets.writePlayer(target,p);log('기록 완료: '+target.displayName+' / '+data.gameId);}
 state.lastGame=String(data.gameId);
}
async function flush(){if(busy)return;busy=true;try{for(let i=0;i<10&&(!lastEog?.gameId||!playersOf(lastEog).length);i++)await new Promise(r=>setTimeout(r,1000));if(lastEog?.gameId)await processGame(lastEog);}catch(e){state.lastError=e.message;log('기록 실패: '+e.message);}finally{busy=false;}}
function json(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',b=>{s+=b;if(s.length>32768){reject(new Error('body too large'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(s||'{}'));}catch{reject(new Error('invalid JSON'));}});req.on('error',reject);});}
function validPlayer(p){const displayName=String(p.displayName||'').trim(),key=String(p.key||'').trim();if(!displayName||!key.includes('#')||displayName.length>80||key.length>160)throw new Error('표시명과 Riot ID(닉네임#태그)를 확인하세요');return {key,displayName,matchKeys:[key]};}
function ui(){const html=fs.readFileSync(path.join(root,'public','index.html'));return http.createServer(async(req,res)=>{
 res.setHeader('X-LoL-Tracker','1');const url=new URL(req.url,'http://localhost');try{
 if(req.method==='GET'&&url.pathname==='/favicon.ico'){res.writeHead(200,{'Content-Type':'image/x-icon','Cache-Control':'public, max-age=86400'});return res.end(fs.readFileSync(path.join(root,'assets','icon.ico')));}
 if(req.method==='GET'&&url.pathname==='/assets/icon.png'){res.writeHead(200,{'Content-Type':'image/png'});return res.end(fs.readFileSync(path.join(root,'assets','icon.png')));}
 if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(html);}
 if(req.method==='GET'&&url.pathname==='/api/status')return json(res,200,{config,state:{...state,pending:state.pending},google:settings.publicInfo()});
 if(req.method==='POST'&&url.pathname==='/api/google-settings'){const b=await readBody(req);const result=settings.save(b);sheets.resetAuth();return json(res,200,{ok:true,google:result});}
 if(req.method==='POST'&&url.pathname==='/api/google-test'){const sheetsList=await sheets.metadata();return json(res,200,{ok:true,sheetCount:sheetsList.length});}
 if(req.method==='POST'&&url.pathname==='/api/player'){const p=validPlayer(await readBody(req));if(config.players.some(x=>norm(x.key)===norm(p.key)))throw new Error('이미 등록된 Riot ID');await sheets.ensurePlayer(p);config.players.push(p);save();state.pending=state.pending.filter(x=>norm(x.key)!==norm(p.key));persistPending();return json(res,200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/player/update'){const b=await readBody(req);const p=config.players.find(x=>norm(x.key)===norm(b.key));if(!p)throw new Error('대상 없음');p.displayName=String(b.displayName||'').trim();if(!p.displayName)throw new Error('표시명 필수');save();return json(res,200,{ok:true,note:'기존 원본 시트명은 유지됩니다.'});}
 if(req.method==='POST'&&url.pathname==='/api/player/remove'){const b=await readBody(req);config.players=config.players.filter(x=>norm(x.key)!==norm(b.key));save();return json(res,200,{ok:true,note:'Google Sheets의 기존 데이터는 삭제하지 않습니다.'});}
 if(req.method==='POST'&&url.pathname==='/api/pending/reject'){const b=await readBody(req);state.pending=state.pending.filter(x=>norm(x.key)!==norm(b.key));persistPending();return json(res,200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/options'){const b=await readBody(req);for(const k of ['autoDiscover','includeLeavers','excludeEarlySurrender'])if(typeof b[k]==='boolean')config[k]=b[k];save();return json(res,200,{ok:true});}
 if(req.method==='POST'&&url.pathname==='/api/initialize'){await sheets.init();return json(res,200,{ok:true});}
 return json(res,404,{error:'not found'});
 }catch(e){state.lastError=e.message;return json(res,400,{error:e.message});}
 });}
async function connectLoop(){for(;;){try{state.connection='waiting';await authenticate({awaitConnection:true});ws=await createWebSocketConnection({authenticationOptions:{awaitConnection:true}});state.connection='connected';log('LCU 연결됨');
 ws.subscribe('/lol-end-of-game/v1/eog-stats-block',data=>{lastEog=data;if(lastPhase==='EndOfGame')void flush();});
 ws.subscribe('/lol-gameflow/v1/gameflow-phase',phase=>{lastPhase=phase;if(phase==='EndOfGame')void flush();else if(phase==='InProgress'||phase==='ChampSelect')lastEog=null;});
 await new Promise(resolve=>{ws.on('close',resolve);ws.on('error',resolve);});log('LCU 연결 끊김. 재연결 시도');
 }catch(e){state.lastError=e.message;log('LCU 연결 대기: '+e.message);}state.connection='disconnected';await new Promise(r=>setTimeout(r,4000));}}
async function start(){load();const port=Number(process.env.UI_PORT||3784);const server=ui();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});log('설정 UI: http://127.0.0.1:'+port);connectLoop().catch(e=>log(e.message));return {server,url:'http://127.0.0.1:'+port};}
module.exports={start};
