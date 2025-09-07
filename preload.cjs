const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("osuTapAPI", {
  startPowerSaveBlocker: () => ipcRenderer.invoke("psb:start"),
  stopPowerSaveBlocker: () => ipcRenderer.invoke("psb:stop"),
  history: {
    get: () => ipcRenderer.invoke("history:get"),
    append: (entry) => ipcRenderer.invoke("history:append", entry),
    clear: () => ipcRenderer.invoke("history:clear"),
    openFolder: () => ipcRenderer.invoke("history:open-folder"),
  },
});
