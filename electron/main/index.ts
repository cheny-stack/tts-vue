import { app, BrowserWindow, globalShortcut , shell, ipcMain, dialog } from "electron";
import { release } from "os";
import { join } from "path";
import api from "../utils/api";
import edgeApi from "../utils/edge-api";
import azureApi from "../utils/azure-api";
import logger from "../utils/log";

// Disable GPU Acceleration for Windows 7
//if (release().startsWith("6.1")) app.disableHardwareAcceleration();
app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === "win32") app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// Remove electron security warnings
// This warning only shows in development mode
// Read more on https://www.electronjs.org/docs/latest/tutorial/security
// process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

export const ROOT_PATH = {
  // /dist
  dist: join(__dirname, "../.."),
  // /dist or /public
  public: join(__dirname, app.isPackaged ? "../.." : "../../../public"),
};

let win: BrowserWindow | null = null;
// Here, you can also use other preload
const preload = join(__dirname, "../preload/index.js");
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin
const url = `http://${process.env["VITE_DEV_SERVER_HOST"]}:${process.env["VITE_DEV_SERVER_PORT"]}`;
const indexHtml = join(ROOT_PATH.dist, "index.html");



async function createWindow() {

  win = new BrowserWindow({
    width: 900,
    minWidth: 900,
    minHeight: 650,
    height: 650,

    title: "Main window",
    icon: join(ROOT_PATH.public, "favicon.ico"),
    // useContentSize: true,
    frame: false,
    // maximizable: false,
    // minimizable: false,
    // fullscreenable: false,
    transparent: true,
    hasShadow: false,
    // resizable: false,
    webPreferences: {
      preload,
      webSecurity: false,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  app.commandLine.appendSwitch("disable-features", "OutOfBlinkCors");
  if (app.isPackaged) {
    win.loadFile(indexHtml);
  } else {
    win.loadURL(url);
    win.webContents.openDevTools();
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on("did-finish-load", () => {
    console.log('The window is finished loading.')
    setTimeout(function() {
      // 在这里编写要延迟执行的代码
      console.log('init readAloudShortcut');
      win?.webContents.send("ipc_switchReadAloudShortcut");
    }, 3000);

  });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:")) shell.openExternal(url);
    return { action: "deny" };
  });
}



app.whenReady().then(createWindow);

app.on('ready', () => {
  // 取消注册全局快捷键

});
app.on('will-quit', () => {
  // 取消注册全局快捷键
  globalShortcut.unregisterAll();
});
app.on("window-all-closed", () => {
  win = null;
  if (process.platform !== "darwin") app.quit();
});

app.on("second-instance", () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on("activate", () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow();
  }
});


ipcMain.on("min", (e) => win.minimize());
ipcMain.on("window-maximize", function () {
  if (win.isFullScreen()) {
    win.setFullScreen(false);
  } else if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});
ipcMain.on("close", (e) => win.close());
ipcMain.on("reload", (e) => win.reload());

// new window example arg: new windows url
ipcMain.handle("open-win", (event, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
    },
  });
  if (app.isPackaged) {
    childWindow.loadFile(indexHtml, { hash: arg });
  } else {
    childWindow.loadURL(`${url}/#${arg}`);
    childWindow.webContents.openDevTools({ mode: "undocked", activate: true });
  }
  childWindow.webContents.on('did-finish-load', () => {
    console.log('The window is finished loading.')
    // 你可以在这里执行你的逻辑，例如发送消息到渲染进程等
  })
});
const ElectronStore = require("electron-store");
ElectronStore.initRenderer();

ipcMain.on("log.info", async (event, arg) => {
  logger.info(arg);
});
ipcMain.on("log.error", async (event, arg) => {
  logger.error(arg);
});

ipcMain.on("openLogs", async (event, arg) => {
  shell.openPath(logger.logger.transports.file.getFile().path);
});
ipcMain.on("openLogFolder", async (event, arg) => {
  shell.openPath(logger.logFolder);
});
ipcMain.on("showItemInFolder", async (event, arg) => {
  shell.showItemInFolder(arg);
});
ipcMain.on("openDevTools", async (event, arg) => {
  if (win.webContents.isDevToolsOpened()) {
    win.webContents.closeDevTools();
  } else {
    win.webContents.openDevTools({ mode: "undocked", activate: true });
  }
});

// Get desktop path
ipcMain.on("getDesktopPath", async (event) => {
  event.returnValue = app.getPath("desktop");
});

ipcMain.handle("speech", async (event, ssml) => {
  const res = api.speechApi(ssml);
  return res;
});

ipcMain.handle("voices", async (event) => {
  const res = api.voicesApi();
  return res;
});

ipcMain.handle("edgeApi", async (event, ssml) => {
  const res = edgeApi(ssml)
  return res;
});

ipcMain.handle("azureApi", async (event, ssml, key, region) => {
    const res = azureApi(ssml, key, region)
    return res;
});

ipcMain.handle("openFolderSelector", async (event) => {
  const path = dialog.showOpenDialogSync(win, {
    defaultPath: app.getPath("desktop"),
    properties: ["openDirectory"],
  });
  return path;
});

// 监听来自渲染进程的消息
ipcMain.on('registerShortcut', (event, arg) => {
  const newShortcut = arg;
  console.log("注册快捷键:" + newShortcut);
  // 注册新的快捷键
  globalShortcut.register(newShortcut, () => {
    console.log("触发快捷键:" + newShortcut);
    win?.webContents.send('global-shortcut-triggered');
  });
  // 将结果发送回渲染进程
  // event.sender.send('electron-method-result', result);
});

ipcMain.on('unregisterShortcut', (event, arg) => {
  // 在用户修改快捷键后取消之前的快捷键
  console.log("注销所有快捷键");
  globalShortcut.unregisterAll();
});
