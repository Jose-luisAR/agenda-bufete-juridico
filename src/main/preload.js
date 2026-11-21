// Puente seguro entre las vistas (HTML/JS) y el proceso principal.
// Las vistas solo pueden llamar a las rutas registradas en src/main/ipc.js.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  llamar: (ruta, ...args) => ipcRenderer.invoke('api', ruta, args),
  // Cuando el usuario da clic en una notificación, el proceso principal avisa a qué pantalla ir
  alNavegar: (fn) => ipcRenderer.on('navegar', (_evento, destino) => fn(destino)),
});
