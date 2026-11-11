// Tiny, safe bridge: the web app can tell it's in the desktop app, get hotkey wakes, and show/hide the window.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("adityaDesktop", {
  isDesktop: true,
  onWake: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("aditya:wake", handler);
    return () => ipcRenderer.removeListener("aditya:wake", handler);
  },
  onCapture: (cb) => {
    const handler = (_e, text) => cb(text);
    ipcRenderer.on("aditya:capture", handler);
    return () => ipcRenderer.removeListener("aditya:capture", handler);
  },
  onScreen: (cb) => {
    const handler = (_e, dataUrl) => cb(dataUrl);
    ipcRenderer.on("aditya:screen", handler);
    return () => ipcRenderer.removeListener("aditya:screen", handler);
  },
  notify: (title, body) => ipcRenderer.send("aditya:notify", title, body),
  show: () => ipcRenderer.send("aditya:show"),
  hide: () => ipcRenderer.send("aditya:hide"),
});
