const https = require('https');
const jwt = require('jsonwebtoken');
const settings = require('./settings');
const SHEET = '경기기록';
const REGISTRY = '플레이어';
const DASH = '통계 대시보드';
const HEADERS = ['recordKey','playerKey','displayName','gameId','championName','result','kills','deaths','assists','damageToChampions','damageTaken','goldEarned','spell1Id','spell2Id','item0','item1','item2','item3','item4','item5','item6','recordedAt','rawJson'];
let tokenCache = { value:'', expires:0 };
function request(hostname, path, method='GET', body, headers={}) {
  return new Promise((resolve,reject)=>{
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = https.request({hostname,path,method,headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)})},timeout:15000},res=>{
      let text='';res.on('data',b=>text+=b);res.on('end',()=>{
        if(res.statusCode<200||res.statusCode>=300) return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0,400)}`));
        try{resolve(text?JSON.parse(text):{});}catch(e){reject(e);}
      });
    });
    req.on('timeout',()=>req.destroy(new Error('request timeout')));req.on('error',reject);if(payload)req.write(payload);req.end();
  });
}
async function token() {
  const now=Math.floor(Date.now()/1000);
  if(tokenCache.value && tokenCache.expires>now+60) return tokenCache.value;
  const {clientEmail:email,privateKey:key}=settings.load();
  if(!email||!key) throw new Error('Google credentials missing in .env');
  const assertion=jwt.sign({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600},key,{algorithm:'RS256'});
  const form='grant_type='+encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')+'&assertion='+encodeURIComponent(assertion);
  const data=await new Promise((resolve,reject)=>{
    const req=https.request({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(form)},timeout:15000},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>{try{const j=JSON.parse(b);if(!j.access_token)return reject(new Error('OAuth failed: '+b.slice(0,250)));resolve(j);}catch(e){reject(e);}})});
    req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('OAuth timeout')));req.end(form);
  });
  tokenCache={value:data.access_token,expires:now+Number(data.expires_in||3600)};return tokenCache.value;
}
async function api(path,method='GET',body){const id=settings.load().spreadsheetId;if(!id)throw new Error('SPREADSHEET_ID missing');return request('sheets.googleapis.com','/v4/spreadsheets/'+encodeURIComponent(id)+path,method,body,{Authorization:'Bearer '+await token()});}
const q=s=>"'"+String(s).replace(/'/g,"''")+"'";
async function values(range){const j=await api('/values/'+encodeURIComponent(range));return j.values||[];}
async function put(range,rows){return api('/values/'+encodeURIComponent(range)+'?valueInputOption=RAW','PUT',{values:rows});}
async function append(range,rows){return api('/values/'+encodeURIComponent(range)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS','POST',{values:rows});}
async function batch(requests){return api(':batchUpdate','POST',{requests});}
async function metadata(){return (await api('?fields=sheets(properties(sheetId,title,gridProperties))')).sheets||[];}
async function ensureSheet(name,headers){const sheets=await metadata();let found=sheets.find(s=>s.properties.title===name);if(!found){await batch([{addSheet:{properties:{title:name,gridProperties:{frozenRowCount:1,rowCount:1000,columnCount:Math.max(26,headers.length)}}}}]);found=(await metadata()).find(s=>s.properties.title===name);}if(headers.length){const current=await values(q(name)+'!A1:'+col(headers.length)+'1');if(!current.length||current[0][0]!==headers[0])await put(q(name)+'!A1:'+col(headers.length)+'1',[headers]);}return found.properties.sheetId;}
function col(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
async function init(){await ensureSheet(SHEET,HEADERS);await ensureSheet(REGISTRY,['playerKey','displayName','rawSheet','registeredAt']);}
function validSheetName(name){let s=String(name||'').replace(/[\\/?*\[\]:]/g,'_').trim().slice(0,85);return s||'Player';}
async function ensurePlayer(player){await init();const reg=await values(q(REGISTRY)+'!A2:D');const existing=reg.find(r=>r[0]===player.key);if(existing){player.sheetName=existing[2];await ensureSheet(player.sheetName,HEADERS);return player.sheetName;}
 const used=new Set((await metadata()).map(s=>s.properties.title));let base=validSheetName(player.displayName),name=base,i=2;while(used.has(name))name=base.slice(0,75)+'_'+i++;
 await ensureSheet(name,HEADERS);await append(q(REGISTRY)+'!A:D',[[player.key,player.displayName,name,new Date().toISOString()]]);player.sheetName=name;await ensureDashboardRow(reg.length+2);return name;
}
async function ensureDashboardRow(registryRow){
 const sheets=await metadata();if(!sheets.some(s=>s.properties.title===DASH))return;
 const row=registryRow+8;
 if(row<=29)return; // Initial template includes 20 formula rows.
 const f=[
 `=IF(플레이어!B${registryRow}="","",플레이어!B${registryRow})`,
 `=IF($A${row}="","",COUNTIF(경기기록!$B$2:$B$2000,플레이어!$A${registryRow}))`,
 `=IF($A${row}="","",COUNTIFS(경기기록!$B$2:$B$2000,플레이어!$A${registryRow},경기기록!$F$2:$F$2000,"승"))`,
 `=IF($A${row}="","",B${row}-C${row})`, `=IFERROR(C${row}/B${row},0)`,
 ...['G','H','I','J'].map(c=>`=IFERROR(AVERAGEIF(경기기록!$B$2:$B$2000,플레이어!$A${registryRow},경기기록!$${c}$2:$${c}$2000),0)`)
 ];
 await api('/values/'+encodeURIComponent(q(DASH)+'!A'+row+':I'+row)+'?valueInputOption=USER_ENTERED','PUT',{values:[f]});
}
function recordKey(gameId,key){return String(gameId)+'|'+String(key).toLowerCase();}
function rowFor(player,data){const st=data.stats||{},items=data.items||[];const n=k=>Number(st[k]||0);return [recordKey(data.gameId,player.key),player.key,player.displayName,String(data.gameId),data.championName||'',n('WIN')===1?'승':'패',n('CHAMPIONS_KILLED'),n('NUM_DEATHS'),n('ASSISTS'),n('TOTAL_DAMAGE_DEALT_TO_CHAMPIONS')||n('TOTAL_DAMAGE_DEALT'),n('TOTAL_DAMAGE_TAKEN'),n('GOLD_EARNED'),data.spell1Id||'',data.spell2Id||'',...Array.from({length:7},(_,i)=>items[i]??''),new Date().toISOString(),JSON.stringify(data)];}
async function hasRecord(sheet,key){const list=await values(q(sheet)+'!A2:A');return list.some(r=>r[0]===key);}
async function writePlayer(player,data){await ensurePlayer(player);const row=rowFor(player,data),key=row[0];
 // Reconcile each destination independently to recover from partial writes.
 if(!await hasRecord(SHEET,key))await append(q(SHEET)+'!A:W',[row]);
 if(!await hasRecord(player.sheetName,key))await append(q(player.sheetName)+'!A:W',[row]);
 return key;
}
function resetAuth(){tokenCache={value:'',expires:0};}
module.exports={init,ensurePlayer,writePlayer,metadata,values,HEADERS,resetAuth};
