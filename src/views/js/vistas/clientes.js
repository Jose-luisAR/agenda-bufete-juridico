// Clientes (DFR 2.1 a 2.6).
(function (App) {
  // Tipos de asunto que maneja el despacho (se usan en el filtro)
  const TIPOS_ASUNTO = ['Divorcio voluntario', 'Pensión alimenticia', 'Rectificación de acta', 'Juicio sucesorio intestamentario', 'Cobro de pagaré', 'Otro'];
  // Filtros actuales de la lista; limite crece de 20 en 20 con el botón Ver más
  let filtros = { texto: '', tipoAsunto: '', estado: '', limite: 20 };

  // HTML del formulario de cliente; sirve para registrar y para modificar
  function formulario(c = {}) {
    const fisica = (c.tipo_persona || 'Física') === 'Física';
    return `<div class="formulario">
      <label>Tipo de persona <select name="tipo_persona">${App.opciones(['Física', 'Moral'], c.tipo_persona || 'Física')}</select></label>
      <div class="fila tres" data-fisica ${fisica ? '' : 'hidden'}>
        <label>Nombre (s) <input name="nombre" value="${App.esc(c.nombre)}"></label>
        <label>Apellido Paterno <input name="apellido_paterno" value="${App.esc(c.apellido_paterno)}"></label>
        <label>Apellido Materno <span class="opcional">(opcional)</span><input name="apellido_materno" value="${App.esc(c.apellido_materno)}"></label>
      </div>
      <label data-moral ${fisica ? 'hidden' : ''}>Razón social <input name="razon_social" value="${App.esc(c.razon_social)}"></label>
      <div class="fila">
        <label>Teléfono <input name="telefono" maxlength="10" inputmode="numeric" value="${App.esc(c.telefono)}" placeholder="10 dígitos"></label>
        <label>Correo electrónico <span class="opcional">(opcional)</span><input name="correo" value="${App.esc(c.correo)}"></label>
      </div>
      <div class="fila">
        <label>Calle y número <input name="calle_numero" value="${App.esc(c.calle_numero)}"></label>
        <label>Colonia <input name="colonia" value="${App.esc(c.colonia)}"></label>
      </div>
      <div class="fila tres">
        <label>Municipio <input name="municipio" value="${App.esc(c.municipio)}"></label>
        <label>Estado <input name="estado_republica" value="${App.esc(c.estado_republica || 'Morelos')}"></label>
        <label>Código postal <input name="codigo_postal" maxlength="5" value="${App.esc(c.codigo_postal)}"></label>
      </div>
      <label>CURP o RFC <span class="opcional">(opcional)</span><input name="curp_rfc" maxlength="18" value="${App.esc(c.curp_rfc)}"></label>
      <label>Observaciones <span class="opcional">(opcional)</span><textarea name="observaciones">${App.esc(c.observaciones)}</textarea></label>
    </div>`;
  }

  // Muestra nombre y apellidos para persona física, o razón social para persona moral
  const alternarTipo = (el) => {
    const sel = el.querySelector('[name=tipo_persona]');
    sel.onchange = () => {
      el.querySelector('[data-fisica]').hidden = sel.value !== 'Física';
      el.querySelector('[data-moral]').hidden = sel.value !== 'Moral';
    };
  };

  // Ventana para registrar un cliente. Si ya existe uno con el mismo nombre, pregunta antes de guardar
  async function registrar() {
    const ok = await App.modal({
      titulo: 'Registrar cliente', ancho: true, html: formulario(), alAbrir: alternarTipo,
      alAceptar: async (el) => {
        let r = await App.api('clientes.registrar', App.datos(el), false);
        if (r.confirmar) {
          if (!(await App.confirmar(r.confirmar, 'Registrar'))) return false;
          r = await App.api('clientes.registrar', App.datos(el), true);
        }
        App.toast(r.mensaje, 'exito');
      },
    });
    if (ok) App.recargar();
  }

  // Ventana para modificar un cliente
  async function modificar(id) {
    const c = await App.intentar('clientes.consultar', id);
    if (!c) return;
    const ok = await App.modal({
      titulo: 'Modificar cliente', ancho: true, html: formulario(c), alAbrir: alternarTipo,
      alAceptar: async (el) => { App.toast(await App.api('clientes.modificar', id, App.datos(el)), 'exito'); },
    });
    if (ok) App.recargar();
  }

  // Pide confirmación y elimina el cliente (solo si no tiene asuntos)
  async function eliminar(id, nombre) {
    if (!(await App.confirmar(`¿Está seguro de eliminar a ${nombre}?`))) return;
    const m = await App.intentar('clientes.eliminar', id);
    if (m) { App.toast(m, 'exito'); App.recargar(); }
  }

  // Ficha del cliente con sus datos y asuntos; el Abogado puede confirmarlo o devolverlo al Pasante
  async function consultar(id) {
    const c = await App.intentar('clientes.consultar', id);
    if (!c) return;
    const domicilio = `${c.calle_numero}, ${c.colonia}, ${c.municipio}, ${c.estado_republica}, C.P. ${c.codigo_postal}`;
    const asuntos = c.asuntos.length ? c.asuntos.map((a) => `<div class="elemento"><div class="info">
        <strong>${App.esc(a.numero_expediente || a.folio)} · ${App.esc(a.tipo_asunto)}</strong>
        <span>${App.esc(a.juzgado || 'Sin juzgado aún')}</span></div>${App.etiqueta(a.estado)}</div>`).join('')
      : '<div class="vacio">Sin asuntos registrados</div>';
    const revisar = App.esAbogado() && c.estado === 'Por confirmar';
    const botones = revisar
      ? [{ texto: 'Devolver para corrección', clase: 'secundario', valor: 'devolver' }, { texto: 'Confirmar datos', clase: 'exito', valor: 'confirmar' }]
      : [{ texto: 'Cerrar', valor: null }];
    const r = await App.modal({
      titulo: c.nombre_completo, ancho: true, botones,
      html: `<div class="margen">${App.etiqueta(c.estado)}</div>
        ${c.estado === 'Devuelto' && c.observaciones_devolucion ? `<div class="alerta naranja">${App.icono('alerta')}Corregir: ${App.esc(c.observaciones_devolucion)}</div>` : ''}
        <dl class="ficha">
          <dt>Tipo de persona</dt><dd>${App.esc(c.tipo_persona)}</dd>
          <dt>Teléfono</dt><dd>${App.esc(c.telefono)}</dd>
          <dt>Correo</dt><dd>${App.esc(c.correo || '—')}</dd>
          <dt>Domicilio</dt><dd>${App.esc(domicilio)}</dd>
          <dt>CURP o RFC</dt><dd>${App.esc(c.curp_rfc || '—')}</dd>
          <dt>Observaciones</dt><dd>${App.esc(c.observaciones || '—')}</dd>
        </dl><h3 style="margin:20px 0 6px">Asuntos</h3><div class="lista-simple">${asuntos}</div>`,
    });
    if (r === 'confirmar') {
      const m = await App.intentar('clientes.confirmar', id);
      if (m) App.toast(m, 'exito');
    } else if (r === 'devolver') {
      const obs = await App.pedirTexto('Devolver para corrección', 'Observaciones (qué datos debe corregir el Pasante)', 'Devolver');
      if (!obs) return;
      const m = await App.intentar('clientes.devolver', id, obs);
      if (m) App.toast(m);
    }
    if (r) App.recargar();
  }

  App.vistas.clientes = {
    titulo: 'Clientes',
    subtitulo: 'Directorio de clientes del despacho',
    accion: { texto: 'Registrar cliente', fn: registrar },
    consultar,

    // Dibuja la pantalla: buscador, filtros y tabla de clientes
    async render(cont) {
      cont.innerHTML = `<div class="filtros">
          <div class="buscar">${App.icono('buscar')}<input id="f-texto" placeholder="Buscar por nombre, apellido o número de expediente" value="${App.esc(filtros.texto)}"></div>
          <select id="f-asunto">${App.opciones(TIPOS_ASUNTO, filtros.tipoAsunto, 'Todos los asuntos')}</select>
          <select id="f-estado">${App.opciones(['Confirmado', 'Por confirmar', 'Devuelto'], filtros.estado, 'Todos los estados')}</select>
        </div><div class="tarjeta" id="lista"></div>`;
      const pintar = async () => {
        const lista = await App.intentar('clientes.listar', filtros);
        if (!lista) return;
        const filas = lista.map((c) => {
          const moral = c.tipo_persona === 'Moral';
          return `<tr>
            <td class="fuerte">${App.esc(moral ? c.razon_social : c.nombre)}</td>
            <td>${App.esc(moral ? '—' : c.apellido_paterno)}</td><td>${App.esc(moral ? '—' : c.apellido_materno || '')}</td>
            <td>${App.esc(c.telefono)}</td><td>${App.esc(c.asuntos || 'Sin asunto')}</td><td>${App.etiqueta(c.estado)}</td>
            <td><div class="acciones">
              <button class="icono-btn" title="Consultar" data-c="${c.id}">${App.icono('ver')}</button>
              <button class="icono-btn" title="Modificar" data-m="${c.id}">${App.icono('editar')}</button>
              <button class="icono-btn rojo" title="Eliminar" data-x="${c.id}" data-n="${App.esc(c.nombre_completo)}" ${App.esAbogado() ? '' : 'disabled'}>${App.icono('borrar')}</button>
            </div></td></tr>`;
        });
        const hayMas = lista.length >= filtros.limite;
        document.getElementById('lista').innerHTML = App.tabla(['Nombre', 'Apellido paterno', 'Apellido materno', 'Teléfono', 'Asunto', 'Estado', ''],
          filas, filtros.texto ? 'No se encontraron clientes con ese dato' : 'Aún no hay clientes registrados')
          + (hayMas ? '<div style="padding:12px;text-align:center"><button class="boton secundario chico" id="mas">Ver más</button></div>' : '');
        cont.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => consultar(Number(b.dataset.c)); });
        cont.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => modificar(Number(b.dataset.m)); });
        cont.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => eliminar(Number(b.dataset.x), b.dataset.n); });
        if (hayMas) document.getElementById('mas').onclick = () => { filtros.limite += 20; pintar(); };
      };
      let espera;
      document.getElementById('f-texto').oninput = (e) => { clearTimeout(espera); espera = setTimeout(() => { filtros.texto = e.target.value; filtros.limite = 20; pintar(); }, 250); };
      document.getElementById('f-asunto').onchange = (e) => { filtros.tipoAsunto = e.target.value; pintar(); };
      document.getElementById('f-estado').onchange = (e) => { filtros.estado = e.target.value; pintar(); };
      await pintar();
    },
  };
}(window.App));
