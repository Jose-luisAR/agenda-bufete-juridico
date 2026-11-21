// Agenda y actividades (DFR 3.1 a 3.5).
(function (App) {
  const TIPOS = ['Audiencia', 'Cita con cliente', 'Diligencia'];
  const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  let vista = 'Mes'; // Mes, Semana o Día (DFR 3.2: la agenda abre en la vista Mes)
  let fechaBase = null; // día que se está viendo
  let filtros = { tipo: '', responsableId: '' };
  const clave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const css = (tipo) => tipo.split(' ')[0]; // Audiencia | Cita | Diligencia | Vencimiento

  // HTML del formulario de actividad con los expedientes activos y los usuarios para elegir responsable
  async function formulario(t = {}) {
    const [usuarios, asuntos] = await Promise.all([App.intentar('usuarios.activos'), App.intentar('expedientes.activos')]);
    return `<div class="formulario">
      <div class="fila">
        <label>Tipo de actividad <select name="tipo">${App.opciones(TIPOS, t.tipo, 'Seleccione')}</select></label>
        <label>Título <input name="titulo" value="${App.esc(t.titulo)}"></label>
      </div>
      <div class="fila tres">
        <label>Fecha <input type="date" name="fecha" min="${App.hoy()}" value="${App.esc(t.fecha)}"></label>
        <label>Hora de inicio <input type="time" name="hora_inicio" value="${App.esc(t.hora_inicio)}"></label>
        <label>Hora de término <span class="opcional">(opcional)</span><input type="time" name="hora_fin" value="${App.esc(t.hora_fin)}"></label>
      </div>
      <label>Lugar <input name="lugar" value="${App.esc(t.lugar)}"></label>
      <div class="fila">
        <label>Expediente <span class="opcional">(opcional en citas)</span>
          <select name="asunto_id">${App.opciones((asuntos || []).map((a) => [a.id, `${a.numero_expediente || a.folio} · ${a.clientes || ''}`]), t.asunto_id, 'Sin expediente')}</select></label>
        <label>Responsable <select name="responsable_id">${App.opciones((usuarios || []).map((u) => [u.id, `${u.nombre} ${u.apellido_paterno}`]), t.responsable_id || App.usuario.id)}</select></label>
      </div>
      <label>Notas <span class="opcional">(opcional)</span><textarea name="notas">${App.esc(t.notas)}</textarea></label></div>`;
  }

  // Guarda y, si el responsable tiene otra actividad a esa hora, pregunta antes (DFR 3.1)
  const guardar = (ruta, ...previos) => async (el) => {
    let r = await App.api(ruta, ...previos, App.datos(el), false);
    if (r.confirmar) {
      if (!(await App.confirmar(r.confirmar, 'Guardar'))) return false;
      r = await App.api(ruta, ...previos, App.datos(el), true);
    }
    App.toast(r.mensaje, 'exito');
  };

  // Ventana para registrar una actividad nueva en la fecha indicada
  async function nueva(fecha) {
    const ok = await App.modal({ titulo: 'Nueva actividad', ancho: true, html: await formulario({ fecha }), alAceptar: guardar('agenda.registrar') });
    if (ok) App.recargar();
  }

  // Ventana con el detalle de la actividad y sus botones: abrir expediente, modificar, cancelar o registrar resultado
  async function detalle(id) {
    const t = await App.intentar('agenda.detalle', id);
    if (!t) return;
    const pasada = `${t.fecha} ${t.hora_inicio}` < `${App.hoy()} ${new Date().toTimeString().slice(0, 5)}`;
    const botones = [];
    if (t.asunto_id) botones.push({ texto: 'Abrir expediente', clase: 'secundario', valor: 'expediente' });
    if (t.estado === 'Programada' && App.esAbogado()) {
      botones.push({ texto: 'Cancelar actividad', clase: 'secundario', valor: 'cancelar' });
      if (!pasada) botones.push({ texto: 'Modificar', clase: 'secundario', valor: 'modificar' });
    }
    if (t.estado === 'Programada' && pasada && (App.esAbogado() || t.responsable_id === App.usuario.id)) {
      botones.push({ texto: 'Registrar resultado', valor: 'resultado' });
    }
    botones.push({ texto: 'Cerrar', clase: botones.length ? 'secundario' : '', valor: null });
    const r = await App.modal({
      titulo: t.titulo, botones, ancho: true,
      html: `<div class="margen">${App.etiqueta(t.tipo, t.tipo === 'Audiencia' ? 'azul' : t.tipo === 'Diligencia' ? 'naranja' : 'azul')}
          ${App.etiqueta(t.estado)} ${t.estado === 'Programada' && pasada ? App.etiqueta('Sin resultado', 'rojo') : ''}</div>
        <dl class="ficha">
          <dt>Fecha</dt><dd>${App.fecha(t.fecha)}</dd>
          <dt>Horario</dt><dd>${App.esc(t.hora_inicio)}${t.hora_fin ? ` a ${App.esc(t.hora_fin)}` : ''}</dd>
          <dt>Lugar</dt><dd>${App.esc(t.lugar)}</dd>
          <dt>Expediente</dt><dd>${App.esc(t.expediente ? `${t.expediente} · ${t.clientes || ''}` : '—')}</dd>
          <dt>Responsable</dt><dd>${App.esc(t.responsable)}</dd>
          <dt>Notas</dt><dd>${App.esc(t.notas || '—')}</dd>
          ${t.resultado ? `<dt>Resultado</dt><dd>${App.esc(t.resultado)}</dd>` : ''}
          ${t.motivo_cancelacion ? `<dt>Motivo de cancelación</dt><dd>${App.esc(t.motivo_cancelacion)}</dd>` : ''}
        </dl>`,
    });
    if (r === 'expediente') App.ir('expedientes', { abrir: t.asunto_id });
    if (r === 'modificar') {
      const ok = await App.modal({ titulo: 'Modificar actividad', ancho: true, html: await formulario(t), alAceptar: guardar('agenda.modificar', id) });
      if (ok) App.recargar();
    }
    if (r === 'cancelar') {
      const motivo = await App.pedirTexto(`¿Desea cancelar ${t.titulo}?`, 'Motivo de la cancelación', 'Cancelar actividad');
      if (motivo) { const m = await App.intentar('agenda.cancelar', id, motivo); if (m) { App.toast(m); App.recargar(); } }
    }
    if (r === 'resultado') {
      const res = await App.pedirTexto('Registrar resultado', 'Resultado (ejemplo: "Se celebró la audiencia; el juez citó para sentencia")', 'Guardar');
      if (res) { const m = await App.intentar('agenda.registrarResultado', id, res); if (m) { App.toast(m, 'exito'); App.recargar(); } }
    }
  }

  // Primer lunes de la semana de una fecha (la agenda empieza en lunes)
  const lunesDe = (f) => { const d = new Date(f); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
  const sumarDias = (f, n) => { const d = new Date(f); d.setDate(d.getDate() + n); return d; };
  const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // Título que se ve arriba del calendario según la vista
  function tituloDe(inicio) {
    if (vista === 'Mes') return mayuscula(fechaBase.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }));
    if (vista === 'Día') return mayuscula(fechaBase.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    const fin = sumarDias(inicio, 6);
    return `${inicio.getDate()} al ${fin.getDate()} de ${fin.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}`;
  }

  App.vistas.agenda = {
    titulo: 'Agenda',
    subtitulo: 'Audiencias, citas con clientes, diligencias y vencimientos',
    accion: { texto: 'Nueva actividad', soloAbogado: true, fn: () => nueva(App.hoy()) },

    async render(cont, params = {}) {
      if (!fechaBase) fechaBase = new Date();
      const usuarios = (await App.intentar('usuarios.activos')) || [];

      // Días que se dibujan: Mes = 6 semanas desde el lunes, Semana = 7 días, Día = 1 día
      let inicio; let totalDias;
      if (vista === 'Mes') { inicio = lunesDe(new Date(fechaBase.getFullYear(), fechaBase.getMonth(), 1)); totalDias = 42; }
      else if (vista === 'Semana') { inicio = lunesDe(fechaBase); totalDias = 7; }
      else { inicio = new Date(fechaBase); totalDias = 1; }
      const fin = sumarDias(inicio, totalDias - 1);

      const r = await App.intentar('agenda.rango', clave(inicio), clave(fin), filtros);
      if (!r) return;

      // Se agrupan actividades y vencimientos por fecha
      const porDia = {};
      r.actividades.forEach((t) => { (porDia[t.fecha] = porDia[t.fecha] || []).push({ ...t, tipoCss: css(t.tipo) }); });
      r.vencimientos.forEach((p) => {
        (porDia[p.fecha_vencimiento] = porDia[p.fecha_vencimiento] || []).push({ vencimiento: true, asunto_id: p.asunto_id,
          titulo: `Vence: ${p.actuacion_pendiente}`, tipoCss: 'Vencimiento', hora_inicio: '' });
      });

      // Encabezado de los días (en la vista Día solo se muestra el nombre de ese día)
      let celdas = vista === 'Día'
        ? `<div class="dia-semana">${DIAS[(fechaBase.getDay() + 6) % 7]}</div>`
        : DIAS.map((d) => `<div class="dia-semana">${d}</div>`).join('');
      for (let i = 0; i < totalDias; i++) {
        const d = sumarDias(inicio, i);
        const k = clave(d);
        const eventos = (porDia[k] || []).map((e) => (e.vencimiento
          ? `<button class="evento Vencimiento" data-asunto="${e.asunto_id}" title="${App.esc(e.titulo)}">${App.esc(e.titulo)}</button>`
          : `<button class="evento ${e.tipoCss} ${e.estado === 'Realizada' ? 'realizada' : ''}" data-id="${e.id}" title="${App.esc(e.titulo)}">
              ${App.esc(e.hora_inicio)} ${App.esc(e.titulo)}${vista === 'Día' ? ` · ${App.esc(e.lugar)} · ${App.esc(e.responsable)}` : ''}${e.sin_resultado ? '<span class="sin">Sin resultado</span>' : ''}</button>`)).join('');
        const fuera = vista === 'Mes' && d.getMonth() !== fechaBase.getMonth();
        const clases = ['dia', fuera ? 'fuera' : '', k === App.hoy() ? 'hoy' : '', d.getDay() % 6 === 0 ? 'inhabil' : ''].join(' ');
        celdas += `<div class="${clases}" data-fecha="${k}"><span class="numero-dia">${d.getDate()}</span>${eventos}</div>`;
      }

      const claseCalendario = vista === 'Semana' ? 'semana' : vista === 'Día' ? 'dia-unico' : '';
      cont.innerHTML = `<div class="agenda-cabecera">
          <button class="icono-btn" id="ant">${App.icono('izq')}</button><h2>${tituloDe(inicio)}</h2><button class="icono-btn" id="sig">${App.icono('der')}</button>
          <button class="boton secundario chico" id="hoy">Hoy</button>
          <div class="selector-vista">${['Mes', 'Semana', 'Día'].map((v) => `<button data-vista="${v}" class="${v === vista ? 'activo' : ''}">${v}</button>`).join('')}</div>
          <select id="f-tipo">${App.opciones([...TIPOS, 'Vencimiento'], filtros.tipo, 'Todos los tipos')}</select>
          <select id="f-resp">${App.opciones(usuarios.map((u) => [u.id, `${u.nombre} ${u.apellido_paterno}`]), filtros.responsableId, 'Todos los responsables')}</select>
          <div class="leyenda"><span><i></i>Audiencia</span><span><i class="Cita"></i>Cita con cliente</span>
            <span><i class="Diligencia"></i>Diligencia</span><span><i class="Vencimiento"></i>Vencimiento</span></div>
        </div><div class="tarjeta"><div class="calendario ${claseCalendario}">${celdas}</div></div>`;

      // Flechas: avanzan un mes, una semana o un día según la vista
      const mover = (n) => {
        if (vista === 'Mes') fechaBase = new Date(fechaBase.getFullYear(), fechaBase.getMonth() + n, 1);
        else fechaBase = sumarDias(fechaBase, vista === 'Semana' ? 7 * n : n);
        App.recargar();
      };
      cont.querySelector('#ant').onclick = () => mover(-1);
      cont.querySelector('#sig').onclick = () => mover(1);
      cont.querySelector('#hoy').onclick = () => { fechaBase = new Date(); App.recargar(); };
      cont.querySelectorAll('[data-vista]').forEach((b) => { b.onclick = () => { vista = b.dataset.vista; App.recargar(); }; });
      cont.querySelector('#f-tipo').onchange = (e) => { filtros.tipo = e.target.value; App.recargar(); };
      cont.querySelector('#f-resp').onchange = (e) => { filtros.responsableId = e.target.value; App.recargar(); };
      cont.querySelectorAll('.evento[data-id]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); detalle(Number(b.dataset.id)); }; });
      cont.querySelectorAll('.evento[data-asunto]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); App.ir('expedientes', { abrir: Number(b.dataset.asunto) }); }; });
      // Doble clic en un día (de hoy en adelante) para registrar una actividad en esa fecha
      if (App.esAbogado()) {
        cont.querySelectorAll('.dia[data-fecha]').forEach((c) => { c.ondblclick = () => { if (c.dataset.fecha >= App.hoy()) nueva(c.dataset.fecha); }; });
      }

      // Si se llegó desde una notificación, se abre el detalle de esa actividad
      if (params.abrir) { const id = params.abrir; delete params.abrir; detalle(id); }
    },
  };
}(window.App));
