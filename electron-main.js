const { app, Tray, Menu, shell, dialog, nativeImage } = require('electron');
const path = require('path');
const http = require('http');
const PORT = Number(process.env.UI_PORT || 3784);
const URL = `http://127.0.0.1:${PORT}`;
let tray = null;
let server = null;
let quitting = false;

function openUI() { shell.openExternal(URL).catch(e => dialog.showErrorBox('설정 화면', e.message)); }
function probeExisting() {
  return new Promise(resolve => {
    const req = http.get(URL + '/api/status', { timeout: 1500 }, res => {
      const tracker = res.headers['x-lol-tracker'] === '1';
      res.resume(); resolve(tracker);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(false));
  });
}
const locked = app.requestSingleInstanceLock();
if (!locked) {
  app.quit();
} else {
  app.on('second-instance', () => openUI());
  app.whenReady().then(async () => {
    try {
      // An independently started `npm start` may already own the port.
      if (await probeExisting()) {
        dialog.showMessageBoxSync({type:'info',title:'LoL Match Tracker',message:'이미 실행 중인 서버가 있습니다.',detail:'기존 설정 화면을 엽니다. 트레이 기능을 사용하려면 기존 서버를 종료한 뒤 데스크톱 앱을 실행하세요.'});
        openUI(); app.quit(); return;
      }
      const result = await require('./src/app').start();
      server = result.server;
      const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
      tray = new Tray(icon);
      tray.setToolTip('LoL Match Tracker - 실행 중');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: '설정 화면 열기', click: openUI },
        { label: 'LCU 연결 및 전적 기록 실행 중', enabled: false },
        { type: 'separator' },
        { label: '종료', click: () => { quitting = true; app.quit(); } }
      ]));
      tray.on('double-click', openUI);
      openUI();
    } catch (err) {
      if (err.code === 'EADDRINUSE') {
        dialog.showErrorBox('포트 충돌', `${PORT} 포트를 다른 프로그램이 사용 중입니다. 해당 프로그램을 종료하고 다시 실행하세요.`);
      } else dialog.showErrorBox('LoL Match Tracker 시작 실패', err.message);
      app.quit();
    }
  });
  app.on('before-quit', () => { if (server) server.close(); });
}
