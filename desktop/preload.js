// Tiny, safe bridge: the web app can tell it's in the desktop app, get hotkey wakes, and show/hide the window.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("adityaDesktop", {
  isDesktop: true,
  onWake: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("aditya:wake", handler);
    return () => ipcRenderer.removeListener("aditya:wake", handler);
  },
  show: () => ipcRenderer.send("aditya:show"),
  hide: () => ipcRenderer.send("aditya:hide"),
});
