// Panel de Control (DFR 5.1 a 5.4).
(function (App) {
  // Color de la barra de cada tarjeta de indicador
  const COLORES = ['', 'rojo', 'naranja', 'verde'];

  App.vistas.panel = {
    titulo: 'Panel de control',
    subtitulo: '',

    // Pide al sistema el resumen del día y dibuja tarjetas, actividades de hoy, plazos próximos y pendientes por revisar
    async render(cont) {
      const r = await App.intentar('panel.resumen');
      if (!r) return;
      const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      document.getElementById('titulo').textContent = `Hola, ${r.usuario.nombre}`;
      document.getElementById('subtitulo').textContent = fecha.charAt(0).toUpperCase() + fecha.slice(1);

      const indicadores = r.indicadores.map((i, n) => `<div class="tarjeta indicador ${i.color || COLORES[n] || ''}" data-ir="${i.ir}" data-clave="${i.clave}">
        <div class="numero">${i.valor}</div><div><div class="titulo">${App.esc(i.titulo)}</div><div class="detalle">Ver detalle</div></div></div>`).join('');

      const actividades = r.actividades.length ? r.actividades.map((t) => `<div class="elemento">
          <div class="hora">${App.esc(t.hora_inicio)}</div><div class="barra ${t.tipo.split(' ')[0]}"></div>
          <div class="info"><strong>${App.esc(t.titulo)}</strong>
          <span>${App.esc(t.tipo)} · ${App.esc(t.expediente || t.clientes || 'Sin expediente')} · ${App.esc(t.lugar)}</span></div></div>`).join('')
        : '<div class="vacio">No hay actividades programadas para hoy</div>';

      const plazos = r.plazos.length ? r.plazos.map((p) => `<div class="elemento clic" data-ir="radar">
          <div class="barra Vencimiento"></div>
          <div class="info"><strong>${App.esc(p.actuacion_pendiente)}</strong>
          <span>Exp. ${App.esc(p.expediente)} · ${App.esc(p.tipo_asunto)} · ${p.faltan}</span></div>
          ${App.etiqueta(p.prioridad.etiqueta)}</div>`).join('')
        : '<div class="vacio">No hay plazos pendientes</div>';

      let pendientes = '';
      if (r.pendientes) {
        const docs = r.pendientes.documentos.map((d) => `<div class="elemento">
            <div class="info"><strong>${App.esc(d.nombre_archivo)}</strong>
            <span>${App.esc(d.tipo_documento)} · Exp. ${App.esc(d.expediente)} · subió ${App.esc(d.subido_por_nombre)}</span></div>
            <button class="boton chico exito" data-autorizar="${d.id}">Autorizar</button>
            <button class="boton chico peligro" data-rechazar="${d.id}">Rechazar</button></div>`).join('');
        const clientes = r.pendientes.clientes.map((c) => `<div class="elemento">
            <div class="info"><strong>${App.esc(c.nombre_completo)}</strong>
            <span>Cliente por confirmar · registró ${App.esc(c.registrado_por_nombre)}</span></div>
            <button class="boton chico secundario" data-revisar="${c.id}">Revisar</button></div>`).join('');
        pendientes = `<div class="tarjeta relleno"><h2>Pendientes por revisar</h2><div class="lista-simple">
          ${docs + clientes || '<div class="vacio">No hay pendientes por revisar</div>'}</div></div>`;
      }

      cont.innerHTML = `
        ${r.avisoRespaldo ? `<div class="alerta naranja">${App.icono('alerta')}${App.esc(r.avisoRespaldo)}
          <button class="boton chico secundario" data-ir="respaldo">Generar respaldo</button></div>` : ''}
        <div class="rejilla cuatro margen">${indicadores}</div>
        <div class="rejilla dos margen">
          <div class="tarjeta relleno"><h2>Actividades de hoy</h2><div class="lista-simple">${actividades}</div></div>
          <div class="tarjeta relleno"><h2>Plazos próximos a vencer</h2><div class="lista-simple">${plazos}</div></div>
        </div>
        ${pendientes}`;

      cont.querySelectorAll('[data-ir]').forEach((el) => {
        el.style.cursor = 'pointer';
        el.onclick = () => {
          if (el.dataset.clave === 'documentos' && App.esAbogado()) return;
          App.ir(el.dataset.ir, el.dataset.clave === 'expedientes' && !App.esAbogado() ? { mios: true } : {});
        };
      });
      cont.querySelectorAll('[data-autorizar]').forEach((b) => {
        b.onclick = async () => {
          const m = await App.intentar('expedientes.autorizarDocumento', Number(b.dataset.autorizar));
          if (m) { App.toast(m, 'exito'); App.recargar(); }
        };
      });
      cont.querySelectorAll('[data-rechazar]').forEach((b) => {
        b.onclick = async () => {
          const motivo = await App.pedirTexto('Rechazar documento', 'Motivo del rechazo', 'Rechazar');
          if (!motivo) return;
          const m = await App.intentar('expedientes.rechazarDocumento', Number(b.dataset.rechazar), motivo);
          if (m) { App.toast(m); App.recargar(); }
        };
      });
      cont.querySelectorAll('[data-revisar]').forEach((b) => { b.onclick = () => App.vistas.clientes.consultar(Number(b.dataset.revisar)); });
    },
  };
}(window.App));
