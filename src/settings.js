const fs = require('fs');
const path = require('path');
const os = require('os');
const base = process.env.TRACKER_DATA_DIR || path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'LoL-LCU-Sheet-Tracker');
const file = path.join(base, 'google-settings.json');
function load() {
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return {
    clientEmail: stored.clientEmail || process.env.GOOGLE_CLIENT_EMAIL || '',
    privateKey: stored.privateKey || (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    spreadsheetId: stored.spreadsheetId || process.env.SPREADSHEET_ID || ''
  };
}
function publicInfo() {
  const s=load(); return {clientEmail:s.clientEmail, spreadsheetId:s.spreadsheetId, hasPrivateKey:!!s.privateKey, configured:!!(s.clientEmail && s.privateKey && s.spreadsheetId)};
}
function save(input) {
  const current=load();
  const clientEmail=String(input.clientEmail||'').trim();
  const spreadsheetId=String(input.spreadsheetId||'').trim();
  let privateKey=current.privateKey;
  if(input.privateKey !== undefined && String(input.privateKey).trim()) privateKey=String(input.privateKey).replace(/\\n/g,'\n').trim();
  if(!/^[^\s@]+@[^\s@]+$/.test(clientEmail))throw new Error('서비스 계정 이메일 형식이 올바르지 않습니다.');
  if(!/^[a-zA-Z0-9_-]{15,}$/.test(spreadsheetId))throw new Error('스프레드시트 ID를 확인하세요.');
  if(!privateKey.includes('-----BEGIN PRIVATE KEY-----')||!privateKey.includes('-----END PRIVATE KEY-----'))throw new Error('서비스 계정 private_key를 입력하세요.');
  fs.mkdirSync(base,{recursive:true,mode:0o700});
  const temp=file+'.tmp'; fs.writeFileSync(temp,JSON.stringify({clientEmail,spreadsheetId,privateKey},null,2),{mode:0o600});fs.renameSync(temp,file);
  return publicInfo();
}
module.exports={load,save,publicInfo};
