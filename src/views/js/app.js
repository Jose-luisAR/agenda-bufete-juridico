// Estructura principal: menú según el rol, navegación, campana de avisos y sesión.
(function (App) {
  const $ = (id) => document.getElementById(id);

  // Menú lateral. Usuarios, Respaldo y Reportes solo los ve el Abogado
  const MENU = [
    { id: 'panel', texto: 'Panel de control', icono: 'inicio' },
    { id: 'clientes', texto: 'Clientes', icono: 'clientes' },
    { id: 'expedientes', texto: 'Expedientes', icono: 'expedientes' },
    { id: 'agenda', texto: 'Agenda', icono: 'agenda' },
    { id: 'radar', texto: 'Radar de vencimientos', icono: 'radar' },
    { separador: 'ADMINISTRACIÓN', soloAbogado: true },
    { id: 'usuarios', texto: 'Usuarios', icono: 'usuarios', soloAbogado: true },
    { id: 'respaldo', texto: 'Respaldo', icono: 'respaldo', soloAbogado: true },
    { id: 'reportes', texto: 'Reportes', icono: 'reportes', soloAbogado: true },
  ];

  // Pantalla que se está viendo, para poder recargarla
  let actual = null;
  App.cambiosSinGuardar = false;

  // Cambia de pantalla. Cada vista define titulo, subtitulo, un botón de acción y render(contenedor, params)
  App.ir = async (id, params = {}) => {
    if (!App.esAbogado() && MENU.some((m) => m.id === id && m.soloAbogado)) id = 'panel'; // pantallas solo del Abogado
    const vista = App.vistas[id];
    if (!vista) return;
    actual = { id, params };
    document.querySelectorAll('#navegacion button').forEach((b) => b.classList.toggle('activo', b.dataset.id === id));
    $('titulo').textContent = vista.titulo;
    $('subtitulo').textContent = vista.subtitulo || '';
    const acc = vista.accion && (!vista.accion.soloAbogado || App.esAbogado()) ? vista.accion : null;
    $('accion-principal').innerHTML = acc ? `<button class="boton">${App.icono(acc.icono || 'mas')}${App.esc(acc.texto)}</button>` : '';
    if (acc) $('accion-principal').firstChild.onclick = () => acc.fn();
    $('panel-avisos').hidden = true;
    const cont = $('contenido');
    cont.innerHTML = '';
    $('principal').scrollTop = 0;
    await vista.render(cont, params);
    App.actualizarCampana();
  };
  App.recargar = () => (actual ? App.ir(actual.id, actual.params) : null);
  App.esAbogado = () => App.usuario && App.usuario.rol === 'Abogado';

  // Dibuja el menú según el rol del usuario
  function pintarMenu() {
    $('navegacion').innerHTML = MENU.filter((m) => !m.soloAbogado || App.esAbogado()).map((m) => (m.separador
      ? `<div class="separador">${m.separador}</div>`
      : `<button data-id="${m.id}">${App.icono(m.icono)}<span>${m.texto}</span></button>`)).join('');
    document.querySelectorAll('#navegacion button').forEach((b) => { b.onclick = () => App.ir(b.dataset.id); });
  }

  // DFR 5.5 Actualiza el número de avisos sin leer de la campana
  App.actualizarCampana = async () => {
    const r = await App.intentar('panel.avisos');
    if (!r) return;
    $('campana').innerHTML = App.icono('campana') + (r.noLeidos ? `<span class="contador">${r.noLeidos}</span>` : '');
    App.avisos = r.lista;
  };

  // Al dar clic en la campana se muestra la lista de avisos; cada aviso abre la pantalla relacionada
  $('campana').onclick = () => {
    const p = $('panel-avisos');
    if (!p.hidden) { p.hidden = true; return; }
    const lista = App.avisos || [];
    p.innerHTML = `<h3>Avisos</h3>${lista.length ? lista.map((a) => `<div class="aviso ${a.leido ? '' : 'nuevo'}" data-id="${a.id}"
        data-pantalla="${App.esc(a.pantalla || '')}" data-ref="${a.referencia || ''}">${App.esc(a.texto)}<small>${App.fechaHora(a.creado_en)}</small></div>`).join('')
      : '<div class="vacio">No tiene avisos nuevos</div>'}`;
    p.hidden = false;
    p.querySelectorAll('.aviso').forEach((el) => {
      el.onclick = async () => {
        await App.intentar('panel.marcarAvisoLeido', Number(el.dataset.id));
        const pantalla = el.dataset.pantalla;
        if (pantalla === 'expediente' && el.dataset.ref) App.ir('expedientes', { abrir: Number(el.dataset.ref) });
        else if (pantalla && App.vistas[pantalla]) App.ir(pantalla);
        else App.actualizarCampana();
        p.hidden = true;
      };
    });
  };

  // DFR 1.7 Cerrar sesión (pregunta antes, salvo que sea por inactividad)
  async function cerrarSesion(motivo) {
    if (!motivo) {
      const texto = App.cambiosSinGuardar ? 'Tiene cambios sin guardar. Si cierra sesión se perderán.' : '¿Desea cerrar sesión?';
      if (!(await App.confirmar(texto))) return;
    }
    await App.intentar('auth.cerrarSesion', motivo === 'inactividad' ? 'Cierre de sesión por inactividad' : undefined);
    location.href = motivo ? `login.html?motivo=${motivo}` : 'login.html';
  }
  $('btn-salir').innerHTML = App.icono('salir');
  $('btn-salir').onclick = () => cerrarSesion();

  // DFR 1.9: cambiar la propia contraseña
  $('btn-contrasena').innerHTML = App.icono('llave');
  $('btn-contrasena').onclick = () => App.modal({
    titulo: 'Cambiar contraseña',
    html: `<div class="formulario">
      <label>Contraseña actual <input type="password" name="actual"></label>
      <label>Contraseña nueva <input type="password" name="nueva"></label>
      <label>Confirmación <input type="password" name="confirmacion"></label>
      <p class="ayuda">Mínimo 8 caracteres, con letras y números.</p></div>`,
    alAceptar: async (el) => { App.toast(await App.api('auth.cambiarContrasena', App.datos(el)), 'exito'); },
  });

  // DFR 1.8 Cierre por 15 minutos sin usar teclado o ratón; al minuto 14 aparece el aviso con el botón Continuar
  let ultimoUso = Date.now();
  let avisoInactividad = null;
  ['mousemove', 'keydown', 'mousedown', 'wheel'].forEach((ev) => document.addEventListener(ev, () => { ultimoUso = Date.now(); }, { passive: true }));
  setInterval(() => {
    const minutos = (Date.now() - ultimoUso) / 60000;
    if (minutos >= 15) cerrarSesion('inactividad');
    else if (minutos >= 14 && !avisoInactividad) {
      avisoInactividad = App.modal({
        titulo: 'Sesión inactiva', html: '<p>Su sesión se cerrará en 1 minuto por inactividad.</p>',
        botones: [{ texto: 'Continuar', valor: true }],
      }).then(() => { ultimoUso = Date.now(); avisoInactividad = null; });
    }
  }, 15000);

  // Ventana "Para hoy" con plazos urgentes y actividades del día al iniciar sesión (DFR 3.6 y 4.10)
  function ventanaAlEntrar() {
    let info = null;
    try { info = JSON.parse(sessionStorage.getItem('alEntrar') || 'null'); sessionStorage.removeItem('alEntrar'); } catch (e) { info = null; }
    if (!info || (!info.urgentes.length && !info.actividadesHoy.length)) return;
    const urg = info.urgentes.map((p) => `<div class="elemento"><div class="barra Vencimiento"></div><div class="info">
      <strong>${App.esc(p.actuacion_pendiente)}</strong><span>Expediente ${App.esc(p.expediente)} · vence ${App.fecha(p.fecha_vencimiento)}</span></div>
      ${App.etiqueta(p.faltan, 'rojo')}</div>`).join('');
    const act = info.actividadesHoy.map((t) => `<div class="elemento"><div class="hora">${App.esc(t.hora_inicio)}</div>
      <div class="barra ${t.tipo.split(' ')[0]}"></div><div class="info"><strong>${App.esc(t.titulo)}</strong>
      <span>${App.esc(t.tipo)} · ${App.esc(t.lugar)}</span></div></div>`).join('');
    App.modal({
      titulo: 'Para hoy',
      html: `${urg ? `<h3>Plazos urgentes</h3><div class="lista-simple margen">${urg}</div>` : ''}
        ${act ? `<h3>Actividades de hoy</h3><div class="lista-simple">${act}</div>` : ''}`,
      botones: [{ texto: 'Entendido', valor: true }],
    });
  }

  // Al abrir el sistema: revisa la sesión, pinta el menú y muestra el Panel de control
  async function iniciar() {
    App.usuario = await App.intentar('auth.sesionActual');
    if (!App.usuario) { location.href = 'login.html'; return; }
    $('avatar').textContent = App.iniciales(App.usuario);
    $('usuario-nombre').textContent = `${App.usuario.nombre} ${App.usuario.apellido_paterno}`;
    $('usuario-rol').textContent = App.esAbogado() ? 'Abogado · Administrador' : 'Pasante';
    pintarMenu();
    await App.ir('panel');
    ventanaAlEntrar();
    // Clic en una notificación de Windows: abre la actividad en la agenda o resalta el plazo en el radar
    window.api.alNavegar((destino) => {
      if (destino.pantalla === 'agenda') App.ir('agenda', { abrir: destino.id });
      if (destino.pantalla === 'radar') App.ir('radar', { resaltar: destino.id });
    });
  }

  iniciar();
}(window.App));
