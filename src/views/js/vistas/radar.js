// Radar de vencimientos y días inhábiles (DFR 4.1 a 4.9).
(function (App) {
  // Filtros de prioridad y responsable
  let filtros = { prioridad: '', responsableId: '' };
  // Pestaña abierta: plazos pendientes o días inhábiles
  let vista = 'plazos';
  let resaltar = null; // id del plazo que se marca al llegar desde una notificación

  // Registrar plazo (DFR 4.4): muestra la fecha calculada antes de guardar
  async function registrarPlazo(previo = {}) {
    const [usuarios, asuntos] = await Promise.all([App.intentar('usuarios.activos'), App.intentar('expedientes.activos')]);
    const enTramite = (asuntos || []).filter((a) => a.estado === 'En trámite')
      .map((a) => [a.id, `${a.numero_expediente || a.folio} · ${a.clientes || ''}`]);
    return App.modal({
      titulo: 'Registrar plazo',
      html: `<div class="formulario">
        <label>Expediente <select name="asunto_id">${App.opciones(enTramite, previo.asunto_id, 'Seleccione un expediente en trámite')}</select></label>
        <label>Actuación pendiente <input name="actuacion_pendiente" placeholder="Ejemplo: Contestar la demanda"></label>
        <div class="fila">
          <label>Fecha de notificación <input type="date" name="fecha_notificacion" value="${previo.fecha_notificacion || App.hoy()}"></label>
          <label>Responsable <select name="responsable_id">${App.opciones((usuarios || []).map((u) => [u.id, `${u.nombre} ${u.apellido_paterno}`]), App.usuario.id)}</select></label>
        </div>
        <div class="fila">
          <label>Días hábiles del plazo <input type="number" min="1" name="dias_habiles" placeholder="Ejemplo: 9"></label>
          <label>o fecha exacta de vencimiento <input type="date" name="fecha_vencimiento"></label>
        </div>
        <p class="ayuda">Llene los días hábiles o la fecha exacta (cuando el juzgado la señala), no los dos.</p>
        <div class="calculo" data-calculo hidden></div>
        <label>Notas <span class="opcional">(opcional)</span><textarea name="notas"></textarea></label></div>`,
      alAbrir: (el) => {
        const calc = async () => {
          const d = App.datos(el);
          const caja = el.querySelector('[data-calculo]');
          if (!d.dias_habiles || !d.fecha_notificacion) { caja.hidden = true; return; }
          const f = await App.intentar('radar.calcular', d.fecha_notificacion, d.dias_habiles);
          caja.hidden = !f;
          if (f) caja.textContent = `Vencimiento calculado: ${App.fecha(f)} (contando solo días hábiles). Verifíquelo antes de guardar.`;
        };
        el.querySelector('[name=dias_habiles]').oninput = calc;
        el.querySelector('[name=fecha_notificacion]').onchange = calc;
      },
      alAceptar: async (el) => { App.toast(await App.api('radar.registrar', App.datos(el)), 'exito'); },
    });
  }

  // Marcar plazo como atendido (DFR 4.9)
  async function atender(id) {
    let archivo = null;
    return App.modal({
      titulo: 'Marcar plazo como atendido',
      html: `<div class="formulario"><label>Fecha en que se atendió <input type="date" name="fecha_atendido" value="${App.hoy()}" max="${App.hoy()}"></label>
        <div class="fila" style="grid-template-columns:auto 1fr;align-items:center">
          <button class="boton secundario" type="button" data-elegir>Archivo de soporte</button><span class="ayuda" data-archivo>Opcional (por ejemplo, el acuse)</span></div></div>`,
      alAbrir: (el) => {
        el.querySelector('[data-elegir]').onclick = async () => {
          archivo = await App.intentar('sistema.elegirArchivo');
          if (archivo) el.querySelector('[data-archivo]').textContent = archivo.split(/[\\/]/).pop();
        };
      },
      alAceptar: async (el) => { App.toast(await App.api('radar.atender', id, { ...App.datos(el), archivo }), 'exito'); },
    });
  }

  // Dibuja las tres tarjetas del semáforo y la tabla de plazos ordenada por urgencia
  async function pintarPlazos(cont) {
    const r = await App.intentar('radar.listar', filtros);
    if (!r) return;
    const tarjeta = (et, color, detalle) => `<div class="tarjeta indicador ${color}" data-prioridad="${et}">
      <div class="numero">${r.resumen[et]}</div><div><div class="titulo">${et === 'Próximo' ? 'Próximos' : et}</div><div class="detalle">${detalle}</div></div></div>`;
    const filas = r.plazos.map((p) => `<tr class="clic ${p.id === resaltar ? 'resaltado' : ''}" data-asunto="${p.asunto_id}">
      <td class="fuerte">${App.esc(p.expediente)}</td><td>${App.esc(p.clientes)}</td><td>${App.esc(p.actuacion_pendiente)}</td>
      <td>${App.fecha(p.fecha_vencimiento)}</td><td>${p.faltan}</td><td>${App.etiqueta(p.prioridad.etiqueta)}</td>
      <td><button class="boton chico secundario" data-atender="${p.id}">Atendido</button></td></tr>`);
    cont.querySelector('#zona').innerHTML = `
      <div class="rejilla tres margen">
        ${tarjeta('Urgente', 'rojo', 'Vencidos o vencen en 0 a 2 días hábiles')}
        ${tarjeta('Próximo', 'naranja', 'Vencen en 3 a 7 días hábiles')}
        ${tarjeta('En tiempo', 'verde', 'Faltan más de 7 días hábiles')}
      </div>
      <div class="tarjeta">${App.tabla(['Expediente', 'Cliente', 'Actuación pendiente', 'Vence', 'Faltan', 'Prioridad', ''], filas, 'No hay plazos pendientes')}</div>
      <p class="nota">Los días se cuentan como días hábiles: el sistema descuenta fines de semana y días inhábiles del tribunal. La lista se ordena sola, de lo más urgente a lo menos urgente.</p>`;
    cont.querySelectorAll('[data-prioridad]').forEach((t) => {
      t.onclick = () => { filtros.prioridad = filtros.prioridad === t.dataset.prioridad ? '' : t.dataset.prioridad; cont.querySelector('#f-prioridad').value = filtros.prioridad; pintarPlazos(cont); };
    });
    cont.querySelectorAll('tr[data-asunto]').forEach((tr) => { tr.onclick = (e) => { if (!e.target.closest('button')) App.ir('expedientes', { abrir: Number(tr.dataset.asunto) }); }; });
    cont.querySelectorAll('[data-atender]').forEach((b) => { b.onclick = async () => { if (await atender(Number(b.dataset.atender))) pintarPlazos(cont); }; });
    const marcado = cont.querySelector('tr.resaltado');
    if (marcado) marcado.scrollIntoView({ block: 'center' });
  }

  // Dibuja la lista de días inhábiles del año; el Abogado puede agregar o eliminar
  async function pintarInhabiles(cont, anio = new Date().getFullYear()) {
    const lista = await App.intentar('radar.inhabiles', anio);
    if (!lista) return;
    const filas = lista.map((d) => `<tr><td class="fuerte">${App.fecha(d.fecha_inicio)}${d.fecha_fin ? ` al ${App.fecha(d.fecha_fin)}` : ''}</td>
      <td>${App.esc(d.descripcion)}</td><td>${d.oficial ? App.etiqueta('Oficial', 'azul') : App.etiqueta('Tribunal', 'naranja')}</td>
      <td>${App.esAbogado() ? `<button class="icono-btn rojo" data-borrar="${d.id}" data-desc="${App.esc(d.descripcion)}">${App.icono('borrar')}</button>` : ''}</td></tr>`);
    cont.querySelector('#zona').innerHTML = `<div class="filtros">
        <select id="f-anio">${App.opciones([anio - 1, anio, anio + 1], anio)}</select>
        ${App.esAbogado() ? `<button class="boton" id="nuevo-inhabil">${App.icono('mas')}Registrar días inhábiles</button>` : ''}</div>
      <div class="tarjeta">${App.tabla(['Fecha o periodo', 'Descripción', 'Origen', ''], filas, 'No hay días inhábiles registrados para este año')}</div>`;
    cont.querySelector('#f-anio').onchange = (e) => pintarInhabiles(cont, Number(e.target.value));
    const nuevo = cont.querySelector('#nuevo-inhabil');
    if (nuevo) {
      nuevo.onclick = async () => {
        const ok = await App.modal({
          titulo: 'Registrar días inhábiles',
          html: `<div class="formulario"><div class="fila">
              <label>Fecha de inicio <input type="date" name="fecha_inicio"></label>
              <label>Fecha de fin <span class="opcional">(si es un periodo)</span><input type="date" name="fecha_fin"></label></div>
            <label>Descripción <input name="descripcion" placeholder="Ejemplo: Vacaciones de diciembre del tribunal"></label></div>`,
          alAceptar: async (el) => { App.toast(await App.api('radar.registrarInhabil', App.datos(el)), 'exito'); },
        });
        if (ok) pintarInhabiles(cont, anio);
      };
    }
    cont.querySelectorAll('[data-borrar]').forEach((b) => {
      b.onclick = async () => {
        if (!(await App.confirmar(`¿Desea eliminar ${b.dataset.desc}?`))) return;
        const m = await App.intentar('radar.eliminarInhabil', Number(b.dataset.borrar));
        if (m) { App.toast(m, 'exito'); pintarInhabiles(cont, anio); }
      };
    });
  }

  App.vistas.radar = {
    titulo: 'Radar de vencimientos',
    subtitulo: 'Plazos legales ordenados automáticamente por urgencia',
    accion: { texto: 'Registrar plazo', fn: async () => { if (await registrarPlazo()) App.recargar(); } },
    registrarPlazo,
    atender,

    // Dibuja la pantalla del Radar
    async render(cont, params = {}) {
      // Desde una notificación: se muestran todos los plazos y se resalta el indicado
      resaltar = params.resaltar || null;
      if (resaltar) { vista = 'plazos'; filtros = { prioridad: '', responsableId: '' }; delete params.resaltar; }
      const usuarios = (await App.intentar('usuarios.activos')) || [];
      cont.innerHTML = `<div class="filtros">
          <div class="pestanas" style="margin:0;border:0">
            <button data-v="plazos" class="${vista === 'plazos' ? 'activo' : ''}">Plazos pendientes</button>
            <button data-v="inhabiles" class="${vista === 'inhabiles' ? 'activo' : ''}">Días inhábiles</button></div>
          <div style="margin-left:auto;display:flex;gap:12px" id="filtros-plazos" ${vista === 'plazos' ? '' : 'hidden'}>
            <select id="f-prioridad">${App.opciones(['Urgente', 'Próximo', 'En tiempo'], filtros.prioridad, 'Todas las prioridades')}</select>
            <select id="f-responsable">${App.opciones(usuarios.map((u) => [u.id, `${u.nombre} ${u.apellido_paterno}`]), filtros.responsableId, 'Todos los responsables')}</select>
          </div></div><div id="zona"></div>`;
      cont.querySelector('#f-prioridad').onchange = (e) => { filtros.prioridad = e.target.value; pintarPlazos(cont); };
      cont.querySelector('#f-responsable').onchange = (e) => { filtros.responsableId = e.target.value; pintarPlazos(cont); };
      cont.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { vista = b.dataset.v; App.recargar(); }; });
      if (vista === 'plazos') await pintarPlazos(cont); else await pintarInhabiles(cont);
    },
  };
}(window.App));
