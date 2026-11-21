// Expedientes (DFR 2.7 a 2.15).
(function (App) {
  const TIPOS = ['Divorcio voluntario', 'Pensión alimenticia', 'Rectificación de acta', 'Juicio sucesorio intestamentario', 'Cobro de pagaré', 'Otro'];
  const MATERIA = { 'Cobro de pagaré': 'Mercantil' };
  // Filtros de la lista de expedientes
  let filtros = { texto: '', tipoAsunto: '', estado: '' };
  // Pestaña abierta en el detalle del expediente
  let pestana = 'Documentos';

  // Separa abogados y pasantes activos para los selectores del formulario
  async function usuariosPorRol() {
    const u = (await App.intentar('usuarios.activos')) || [];
    const opc = (rol) => u.filter((x) => x.rol === rol).map((x) => [x.id, `${x.nombre} ${x.apellido_paterno}`]);
    return { abogados: opc('Abogado'), pasantes: opc('Pasante'), todos: u.map((x) => [x.id, `${x.nombre} ${x.apellido_paterno} (${x.rol})`]) };
  }

  // HTML del formulario de asunto (registrar y modificar)
  function formularioAsunto(a, u, clientes) {
    return `<div class="formulario">
      ${clientes ? `<label>Cliente o clientes <span class="opcional">(solo clientes confirmados)</span></label>
        <div class="casillas">${clientes.length ? clientes.map((c) => `<label><input type="checkbox" name="clientes" value="${c.id}">${App.esc(c.nombre_completo)}</label>`).join('')
          : '<span class="ayuda">No hay clientes confirmados.</span>'}</div>` : ''}
      <div class="fila">
        <label>Tipo de asunto <select name="tipo_asunto">${App.opciones(TIPOS, a.tipo_asunto, 'Seleccione')}</select></label>
        <label>Materia <select name="materia">${App.opciones(['Familiar', 'Civil', 'Mercantil'], a.materia || 'Familiar')}</select></label>
      </div>
      <label>Descripción del asunto <textarea name="descripcion">${App.esc(a.descripcion)}</textarea></label>
      <label>Contraparte <span class="opcional">(opcional)</span><input name="contraparte" value="${App.esc(a.contraparte)}"></label>
      <div class="fila">
        <label>Abogado responsable <select name="abogado_id">${App.opciones(u.abogados, a.abogado_id || App.usuario.id)}</select></label>
        <label>Pasante asignado <span class="opcional">(opcional)</span><select name="pasante_id">${App.opciones(u.pasantes, a.pasante_id, 'Sin pasante')}</select></label>
      </div></div>`;
  }

  // Ventana para registrar un asunto nuevo
  async function registrar() {
    const [u, clientes] = await Promise.all([usuariosPorRol(), App.intentar('clientes.confirmados')]);
    const ok = await App.modal({
      titulo: 'Registrar asunto', ancho: true, html: formularioAsunto({}, u, clientes || []),
      alAbrir: (el) => { el.querySelector('[name=tipo_asunto]').onchange = (e) => { el.querySelector('[name=materia]').value = MATERIA[e.target.value] || 'Familiar'; }; },
      alAceptar: async (el) => { App.toast(await App.api('expedientes.registrar', App.datos(el)), 'exito'); },
    });
    if (ok) App.recargar();
  }

  // Detalle del expediente
  async function abrir(cont, id) {
    const r = await App.intentar('expedientes.consultar', id);
    if (!r) return;
    const a = r.asunto;
    const abierto = a.estado !== 'Concluido';
    const enTramite = a.estado === 'En trámite';
    document.getElementById('titulo').textContent = a.numero_expediente ? `Expediente ${a.numero_expediente}` : `Asunto ${a.folio}`;
    document.getElementById('subtitulo').textContent = `${a.tipo_asunto} · ${a.clientes || ''}`;
    document.getElementById('accion-principal').innerHTML = '';

    const botones = [];
    if (a.estado === 'En preparación') botones.push('<button class="boton secundario" data-accion="juzgado">Registrar datos del juzgado</button>');
    if (abierto && App.esAbogado()) botones.push('<button class="boton secundario" data-accion="modificar">Modificar asunto</button>');
    if (abierto && App.esAbogado()) botones.push('<button class="boton peligro" data-accion="concluir">Concluir expediente</button>');

    // Contenido de cada pestaña del expediente: Documentos, Actuaciones, Plazos y Agenda
    const pestanas = {
      Documentos: () => {
        const filas = r.documentos.map((d) => `<tr>
          <td class="fuerte">${App.esc(d.nombre_archivo)}${d.descripcion ? `<br><span class="ayuda">${App.esc(d.descripcion)}</span>` : ''}</td>
          <td>${App.esc(d.tipo_documento)}</td><td>${App.esc(d.subido_por_nombre)}</td><td>${App.fecha(d.creado_en)}</td>
          <td>${d.estado === 'Rechazado' ? App.etiqueta(`Rechazado: ${d.motivo_rechazo}`, 'rojo') : App.etiqueta(d.estado)}</td>
          <td><div class="acciones">
            <button class="icono-btn" title="Abrir" data-abrir="${d.id}">${App.icono('abrir')}</button>
            ${App.esAbogado() && d.estado === 'Pendiente' ? `<button class="boton chico exito" data-autorizar="${d.id}">Autorizar</button>
              <button class="boton chico peligro" data-rechazar="${d.id}">Rechazar</button>` : ''}</div></td></tr>`);
        return `${abierto ? `<div class="barra-acciones"><button class="boton" data-accion="subir">${App.icono('subir')}Subir documento</button></div>` : ''}
          <div class="tarjeta">${App.tabla(['Documento', 'Tipo', 'Subió', 'Fecha', 'Estado', ''], filas, 'Aún no hay documentos')}</div>`;
      },
      Actuaciones: () => {
        const filas = r.actuaciones.map((t) => `<tr><td>${App.fecha(t.fecha)}</td><td class="fuerte">${App.esc(t.tipo)}</td>
          <td>${App.esc(t.descripcion)}</td><td>${App.esc(t.registrado_por_nombre)}</td>
          <td>${t.documento_id ? `<button class="icono-btn" data-abrir="${t.documento_id}">${App.icono('abrir')}</button>` : ''}</td></tr>`);
        return `${enTramite ? `<div class="barra-acciones"><button class="boton" data-accion="actuacion">${App.icono('mas')}Registrar actuación</button></div>` : ''}
          <div class="tarjeta">${App.tabla(['Fecha', 'Tipo', 'Descripción', 'Registró', ''], filas, 'Aún no hay actuaciones')}</div>`;
      },
      Plazos: () => {
        const filas = r.plazos.map((p) => `<tr><td class="fuerte">${App.esc(p.actuacion_pendiente)}</td><td>${App.fecha(p.fecha_notificacion)}</td>
          <td>${App.fecha(p.fecha_vencimiento)}</td><td>${App.esc(p.responsable)}</td>
          <td>${p.prioridad ? `${App.etiqueta(p.prioridad.etiqueta)} <span class="ayuda">${p.faltan}</span>` : App.etiqueta(p.estado)}</td>
          <td>${p.estado === 'Pendiente' ? `<button class="boton chico secundario" data-atender="${p.id}">Marcar atendido</button>` : ''}</td></tr>`);
        return `${enTramite ? `<div class="barra-acciones"><button class="boton" data-accion="plazo">${App.icono('mas')}Registrar plazo</button></div>` : ''}
          <div class="tarjeta">${App.tabla(['Actuación pendiente', 'Notificación', 'Vence', 'Responsable', 'Prioridad', ''], filas, 'Aún no hay plazos')}</div>`;
      },
      'Datos del cliente': () => r.clientes.map((c) => `<div class="tarjeta relleno margen"><h2>${App.esc(c.nombre_completo)}</h2><dl class="ficha">
          <dt>Teléfono</dt><dd>${App.esc(c.telefono)}</dd><dt>Correo</dt><dd>${App.esc(c.correo || '—')}</dd>
          <dt>Domicilio</dt><dd>${App.esc(`${c.calle_numero}, ${c.colonia}, ${c.municipio}, ${c.estado_republica}`)}</dd>
          <dt>CURP o RFC</dt><dd>${App.esc(c.curp_rfc || '—')}</dd></dl></div>`).join(''),
    };

    cont.innerHTML = `<button class="volver">${App.icono('izq')}Volver a expedientes</button>
      <div class="tarjeta relleno">
        <div class="encabezado" style="margin-bottom:16px"><div>${App.etiqueta(a.estado)}</div><div class="derecha">${botones.join('')}</div></div>
        <div class="resumen">
          <div class="dato"><small>Número de expediente</small><strong>${App.esc(a.numero_expediente || 'Pendiente')}</strong></div>
          <div class="dato"><small>Folio interno</small><strong>${App.esc(a.folio)}</strong></div>
          <div class="dato"><small>Asunto</small><strong>${App.esc(a.tipo_asunto)} (${App.esc(a.materia)})</strong></div>
          <div class="dato"><small>Clientes</small><strong>${App.esc(a.clientes)}</strong></div>
          <div class="dato"><small>Juzgado</small><strong>${App.esc(a.juzgado || 'Sin presentar')}</strong></div>
          <div class="dato"><small>Responsable</small><strong>${App.esc(a.responsable)}${a.pasante ? ` · ${App.esc(a.pasante)}` : ''}</strong></div>
          <div class="dato"><small>Contraparte</small><strong>${App.esc(a.contraparte || '—')}</strong></div>
          <div class="dato"><small>Próxima actividad</small><strong>${App.esc(a.proxima_actividad || 'Ninguna')}</strong></div>
        </div>
        ${a.estado === 'Concluido' ? `<p class="nota">Concluido el ${App.fecha(a.fecha_conclusion)} por ${App.esc(a.motivo_conclusion)}. ${App.esc(a.observaciones_conclusion || '')}</p>` : ''}
        <p class="nota">${App.esc(a.descripcion)}</p>
      </div>
      <div class="pestanas">${Object.keys(pestanas).map((p) => `<button data-p="${p}" class="${p === pestana ? 'activo' : ''}">${p}</button>`).join('')}</div>
      <div id="pestana"></div>`;

    const recargar = () => abrir(cont, id);
    const conectar = () => {
      cont.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => App.intentar('expedientes.abrirDocumento', Number(b.dataset.abrir)); });
      cont.querySelectorAll('[data-autorizar]').forEach((b) => {
        b.onclick = async () => { const m = await App.intentar('expedientes.autorizarDocumento', Number(b.dataset.autorizar)); if (m) { App.toast(m, 'exito'); recargar(); } };
      });
      cont.querySelectorAll('[data-rechazar]').forEach((b) => {
        b.onclick = async () => {
          const motivo = await App.pedirTexto('Rechazar documento', 'Motivo del rechazo', 'Rechazar');
          if (!motivo) return;
          const m = await App.intentar('expedientes.rechazarDocumento', Number(b.dataset.rechazar), motivo);
          if (m) { App.toast(m); recargar(); }
        };
      });
      cont.querySelectorAll('[data-atender]').forEach((b) => { b.onclick = async () => { if (await App.vistas.radar.atender(Number(b.dataset.atender))) recargar(); }; });
      cont.querySelectorAll('[data-accion]').forEach((b) => { b.onclick = () => acciones[b.dataset.accion](); });
    };
    const verPestana = (p) => {
      pestana = p;
      cont.querySelectorAll('[data-p]').forEach((b) => b.classList.toggle('activo', b.dataset.p === p));
      document.getElementById('pestana').innerHTML = pestanas[p]();
      conectar();
    };

    // Acciones de los botones del expediente
    const acciones = {
      // Registrar datos del juzgado (número de expediente, juzgado y fecha de presentación)
      juzgado: async () => {
        const ok = await App.modal({
          titulo: 'Registrar datos del juzgado',
          html: `<div class="formulario"><label>Número de expediente <input name="numero_expediente" placeholder="Ejemplo: 245/2026"></label>
            <label>Juzgado <input name="juzgado" placeholder="Ejemplo: Juzgado Familiar de Jojutla"></label>
            <label>Fecha de presentación <input type="date" name="fecha_presentacion" max="${App.hoy()}"></label></div>`,
          alAceptar: async (el) => { App.toast(await App.api('expedientes.registrarJuzgado', id, App.datos(el)), 'exito'); },
        });
        if (ok) recargar();
      },
      // Modificar los datos generales del asunto
      modificar: async () => {
        const u = await usuariosPorRol();
        const ok = await App.modal({
          titulo: 'Modificar asunto', ancho: true, html: formularioAsunto(a, u, null),
          alAceptar: async (el) => { App.toast(await App.api('expedientes.modificar', id, App.datos(el)), 'exito'); },
        });
        if (ok) recargar();
      },
      // Concluir el expediente con fecha, motivo y resultado
      concluir: async () => {
        const ok = await App.modal({
          titulo: `Concluir expediente ${a.numero_expediente || a.folio}`,
          html: `<div class="formulario"><p>Un expediente concluido ya no podrá modificarse.</p>
            <div class="fila"><label>Fecha de conclusión <input type="date" name="fecha_conclusion" value="${App.hoy()}"></label>
            <label>Motivo <select name="motivo_conclusion">${App.opciones(['Sentencia', 'Convenio', 'Desistimiento', 'Otro'], '', 'Seleccione')}</select></label></div>
            <label>Observaciones <span class="opcional">(opcional)</span><textarea name="observaciones"></textarea></label></div>`,
          botones: [{ texto: 'Cancelar', clase: 'secundario', valor: null }, { texto: 'Concluir', clase: 'peligro', valor: 'aceptar' }],
          alAceptar: async (el) => { App.toast(await App.api('expedientes.concluir', id, App.datos(el)), 'exito'); },
        });
        if (ok) recargar();
      },
      // Subir documento: se elige el archivo del equipo y se copia a la carpeta del expediente
      subir: async () => {
        let ruta = null;
        const ok = await App.modal({
          titulo: 'Subir documento',
          html: `<div class="formulario"><div class="fila" style="grid-template-columns:auto 1fr;align-items:center">
              <button class="boton secundario" type="button" data-elegir>${App.icono('subir')}Elegir archivo</button><span class="ayuda" data-archivo>PDF, Word, JPG o PNG de hasta 20 MB</span></div>
            <label>Tipo de documento <select name="tipo_documento">${App.opciones(['Evidencia', 'Escrito', 'Acuse', 'Resolución'], '', 'Seleccione')}</select></label>
            <label>Descripción <span class="opcional">(opcional)</span><input name="descripcion"></label></div>`,
          alAbrir: (el) => {
            el.querySelector('[data-elegir]').onclick = async () => {
              ruta = await App.intentar('sistema.elegirArchivo');
              if (ruta) el.querySelector('[data-archivo]').textContent = ruta.split(/[\\/]/).pop();
            };
          },
          alAceptar: async (el) => { App.toast(await App.api('expedientes.subirDocumento', id, { ...App.datos(el), ruta }), 'exito'); },
        });
        if (ok) recargar();
      },
      // Registrar una actuación del juicio
      actuacion: async () => {
        let archivo = null;
        const ok = await App.modal({
          titulo: 'Registrar actuación',
          html: `<div class="formulario"><div class="fila">
              <label>Fecha de la actuación <input type="date" name="fecha" value="${App.hoy()}" max="${App.hoy()}"></label>
              <label>Tipo de actuación <select name="tipo">${App.opciones(['Notificación', 'Acuerdo', 'Audiencia celebrada', 'Sentencia', 'Otra'], '', 'Seleccione')}</select></label></div>
            <label>Descripción <textarea name="descripcion"></textarea></label>
            <div class="fila" style="grid-template-columns:auto 1fr;align-items:center">
              <button class="boton secundario" type="button" data-elegir>Archivo de soporte</button><span class="ayuda" data-archivo>Opcional</span></div>
            <label>¿Genera un plazo? <select name="genera">${App.opciones(['No', 'Sí'], 'No')}</select></label></div>`,
          alAbrir: (el) => {
            el.querySelector('[data-elegir]').onclick = async () => {
              archivo = await App.intentar('sistema.elegirArchivo');
              if (archivo) el.querySelector('[data-archivo]').textContent = archivo.split(/[\\/]/).pop();
            };
          },
          alAceptar: async (el) => {
            const d = App.datos(el);
            App.toast(await App.api('expedientes.registrarActuacion', id, { ...d, archivo }), 'exito');
            return d;
          },
        });
        if (ok && ok.genera === 'Sí') await App.vistas.radar.registrarPlazo({ asunto_id: id, fecha_notificacion: ok.fecha });
        if (ok) recargar();
      },
      plazo: async () => { if (await App.vistas.radar.registrarPlazo({ asunto_id: id })) recargar(); },
    };

    cont.querySelector('.volver').onclick = () => App.ir('expedientes');
    cont.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => verPestana(b.dataset.p); });
    verPestana(pestana);
  }

  App.vistas.expedientes = {
    titulo: 'Expedientes',
    subtitulo: 'Asuntos del despacho, del más reciente al más antiguo',
    accion: { texto: 'Registrar asunto', fn: registrar },

    // Dibuja la lista de expedientes; si llega params.abrir se abre directo ese expediente
    async render(cont, params = {}) {
      if (params.abrir) { pestana = 'Documentos'; return abrir(cont, params.abrir); }
      const u = await usuariosPorRol();
      cont.innerHTML = `<div class="filtros">
          <div class="buscar">${App.icono('buscar')}<input id="f-texto" placeholder="Número de expediente, folio o nombre del cliente" value="${App.esc(filtros.texto)}"></div>
          <select id="f-tipo">${App.opciones(TIPOS, filtros.tipoAsunto, 'Todos los asuntos')}</select>
          <select id="f-estado">${App.opciones(['En preparación', 'En trámite', 'Concluido'], filtros.estado, 'Activos')}</select>
          <select id="f-abogado">${App.opciones(u.abogados, filtros.abogadoId, 'Todos los responsables')}</select>
        </div><div class="tarjeta" id="lista"></div>`;
      const pintar = async () => {
        const lista = await App.intentar('expedientes.listar', { ...filtros, mios: params.mios });
        if (!lista) return;
        const filas = lista.map((a) => `<tr class="clic" data-id="${a.id}">
          <td class="fuerte">${App.esc(a.numero_expediente || a.folio)}</td><td>${App.esc(a.clientes)}</td>
          <td>${App.esc(a.tipo_asunto)}</td><td>${App.esc(a.juzgado || '—')}</td><td>${App.esc(a.responsable)}</td><td>${App.etiqueta(a.estado)}</td></tr>`);
        document.getElementById('lista').innerHTML = App.tabla(['Expediente', 'Cliente', 'Asunto', 'Juzgado', 'Responsable', 'Estado'], filas, 'No se encontraron expedientes');
        cont.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => { pestana = 'Documentos'; abrir(cont, Number(tr.dataset.id)); }; });
      };
      let espera;
      document.getElementById('f-texto').oninput = (e) => { clearTimeout(espera); espera = setTimeout(() => { filtros.texto = e.target.value; pintar(); }, 250); };
      document.getElementById('f-tipo').onchange = (e) => { filtros.tipoAsunto = e.target.value; pintar(); };
      document.getElementById('f-estado').onchange = (e) => { filtros.estado = e.target.value; pintar(); };
      document.getElementById('f-abogado').onchange = (e) => { filtros.abogadoId = e.target.value; pintar(); };
      await pintar();
    },
  };
}(window.App));
