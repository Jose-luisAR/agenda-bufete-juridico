// Respaldo y restauración: solo el Abogado (DFR 1.11 a 1.13).
(function (App) {
  App.vistas.respaldo = {
    titulo: 'Respaldo',
    subtitulo: 'Copias de seguridad de la información del despacho',

    // Muestra la fecha del último respaldo y los botones para generar o restaurar
    async render(cont) {
      const e = await App.intentar('respaldo.estado');
      if (!e) return;
      const fmt = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short', hour12: false }) : 'Nunca');
      cont.innerHTML = `<div class="rejilla dos">
        <div class="tarjeta relleno">
          <h2>Respaldo manual</h2>
          <p class="nota" style="margin-top:0">Guarde una copia de toda la información (base de datos y documentos) en una memoria USB o disco externo.</p>
          <dl class="ficha margen"><dt>Último respaldo manual</dt><dd>${fmt(e.ultimoManual)}</dd></dl>
          <button class="boton" id="manual">${App.icono('respaldo')}Generar respaldo</button>
        </div>
        <div class="tarjeta relleno">
          <h2>Respaldo automático</h2>
          <p class="nota" style="margin-top:0">El sistema hace una copia cada día al primer inicio de sesión del Abogado y conserva las últimas 7.</p>
          <dl class="ficha"><dt>Último automático</dt><dd>${fmt(e.ultimoAutomatico)}</dd>
            <dt>Carpeta</dt><dd style="word-break:break-all">${App.esc(e.carpetaAutomaticos)}</dd></dl>
        </div>
        <div class="tarjeta relleno">
          <h2>Restaurar información</h2>
          <div class="alerta naranja">${App.icono('alerta')}La restauración reemplaza toda la información actual por la del respaldo.</div>
          <button class="boton peligro" id="restaurar">Elegir carpeta de respaldo</button>
        </div></div>`;

      cont.querySelector('#manual').onclick = async () => {
        const carpeta = await App.intentar('sistema.elegirCarpeta');
        if (!carpeta) return;
        App.toast('Generando respaldo…');
        const m = await App.intentar('respaldo.manual', carpeta);
        if (m) { App.toast(m, 'exito'); App.recargar(); }
      };
      cont.querySelector('#restaurar').onclick = async () => {
        const carpeta = await App.intentar('sistema.elegirCarpeta');
        if (!carpeta) return;
        if (!(await App.confirmar('Se reemplazará toda la información actual por la del respaldo. ¿Desea continuar?', 'Restaurar'))) return;
        const m = await App.intentar('respaldo.restaurar', carpeta);
        if (m) { App.toast(m, 'exito'); setTimeout(() => { location.href = 'login.html'; }, 1500); }
      };
    },
  };
}(window.App));
