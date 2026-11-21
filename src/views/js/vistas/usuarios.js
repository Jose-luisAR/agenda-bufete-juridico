// Usuarios del sistema: solo el Abogado (DFR 1.1 a 1.5 y 1.10).
(function (App) {
  // Filtros de la lista de usuarios
  let filtros = { texto: '', rol: '', estado: '' };

  // HTML del formulario de usuario; al modificar no se piden contraseñas
  const formulario = (u = {}, conContrasena = true) => `<div class="formulario">
    <div class="fila tres">
      <label>Nombre (s) <input name="nombre" value="${App.esc(u.nombre)}"></label>
      <label>Apellido Paterno <input name="apellido_paterno" value="${App.esc(u.apellido_paterno)}"></label>
      <label>Apellido Materno <span class="opcional">(opcional)</span><input name="apellido_materno" value="${App.esc(u.apellido_materno)}"></label>
    </div>
    <div class="fila">
      <label>Correo electrónico <input name="correo" value="${App.esc(u.correo)}" placeholder="será su nombre de usuario"></label>
      <label>Teléfono <input name="telefono" maxlength="10" value="${App.esc(u.telefono)}"></label>
    </div>
    <label>Rol <select name="rol">${App.opciones(['Abogado', 'Pasante'], u.rol || 'Pasante')}</select></label>
    ${conContrasena ? `<div class="fila"><label>Contraseña <input type="password" name="contrasena"></label>
      <label>Confirmación <input type="password" name="confirmacion"></label></div>
      <p class="ayuda">Mínimo 8 caracteres, con letras y números.</p>` : ''}</div>`;

  // Ventana para registrar un abogado o pasante
  async function registrar() {
    const ok = await App.modal({
      titulo: 'Registrar usuario', ancho: true, html: formulario(),
      alAceptar: async (el) => { App.toast(await App.api('usuarios.registrar', App.datos(el)), 'exito'); },
    });
    if (ok) App.recargar();
  }

  // Botones de cada usuario: modificar, dar de baja (con reasignación de pendientes), reactivar y restablecer contraseña
  async function accion(tipo, u, lista) {
    const nombre = `${u.nombre} ${u.apellido_paterno}`;
    let ok = false;
    if (tipo === 'modificar') {
      ok = await App.modal({
        titulo: 'Modificar usuario', ancho: true, html: formulario(u, false),
        alAceptar: async (el) => { App.toast(await App.api('usuarios.modificar', u.id, App.datos(el)), 'exito'); },
      });
    }
    if (tipo === 'baja') {
      const p = await App.intentar('usuarios.pendientes', u.id);
      if (!p) return;
      const otros = lista.filter((x) => x.id !== u.id && x.estado === 'Activo').map((x) => [x.id, `${x.nombre} ${x.apellido_paterno}`]);
      const tiene = p.actividades || p.plazos;
      ok = await App.modal({
        titulo: 'Dar de baja',
        html: `<p>¿Está seguro de dar de baja a ${App.esc(nombre)}? Su información no se borra.</p>
          ${tiene ? `<label>Tiene ${p.actividades} actividades y ${p.plazos} plazos pendientes. ¿Quién los recibirá?
            <select name="a">${App.opciones(otros, '', 'Seleccione')}</select></label>` : ''}`,
        botones: [{ texto: 'Cancelar', clase: 'secundario', valor: null }, { texto: 'Dar de baja', clase: 'peligro', valor: 'aceptar' }],
        alAceptar: async (el) => { const d = App.datos(el); App.toast(await App.api('usuarios.darDeBaja', u.id, d.a ? Number(d.a) : null), 'exito'); },
      });
    }
    if (tipo === 'reactivar') {
      const m = await App.intentar('usuarios.reactivar', u.id);
      if (m) { App.toast(m, 'exito'); ok = true; }
    }
    if (tipo === 'contrasena') {
      ok = await App.modal({
        titulo: `Restablecer contraseña de ${nombre}`,
        html: `<div class="formulario"><label>Contraseña temporal <input type="password" name="temporal"></label>
          <label>Confirmación <input type="password" name="confirmacion"></label>
          <p class="ayuda">Al entrar, el sistema le pedirá crear su nueva contraseña.</p></div>`,
        alAceptar: async (el) => { App.toast(await App.api('usuarios.restablecer', u.id, App.datos(el)), 'exito'); },
      });
    }
    if (ok) App.recargar();
  }

  App.vistas.usuarios = {
    titulo: 'Usuarios',
    subtitulo: 'Personas del despacho que usan el sistema',
    accion: { texto: 'Registrar usuario', soloAbogado: true, fn: registrar },

    // Dibuja el buscador, los filtros y la tabla de usuarios
    async render(cont) {
      cont.innerHTML = `<div class="filtros">
          <div class="buscar">${App.icono('buscar')}<input id="f-texto" placeholder="Buscar por nombre o correo" value="${App.esc(filtros.texto)}"></div>
          <select id="f-rol">${App.opciones(['Abogado', 'Pasante'], filtros.rol, 'Todos los roles')}</select>
          <select id="f-estado">${App.opciones(['Activo', 'Inactivo'], filtros.estado, 'Todos los estados')}</select>
        </div><div class="tarjeta" id="lista"></div>`;
      const pintar = async () => {
        const lista = await App.intentar('usuarios.listar', filtros);
        if (!lista) return;
        const filas = lista.map((u) => `<tr>
          <td class="fuerte">${App.esc(App.nombre(u))}</td><td>${App.esc(u.correo)}</td><td>${App.esc(u.telefono)}</td>
          <td>${App.etiqueta(u.rol, u.rol === 'Abogado' ? 'azul' : 'gris')}</td><td>${App.etiqueta(u.estado)}</td>
          <td><div class="acciones">
            <button class="icono-btn" title="Modificar" data-a="modificar" data-id="${u.id}">${App.icono('editar')}</button>
            <button class="icono-btn" title="Restablecer contraseña" data-a="contrasena" data-id="${u.id}">${App.icono('llave')}</button>
            ${u.estado === 'Activo'
    ? `<button class="boton chico secundario" data-a="baja" data-id="${u.id}" ${u.id === App.usuario.id ? 'disabled' : ''}>Dar de baja</button>`
    : `<button class="boton chico exito" data-a="reactivar" data-id="${u.id}">Reactivar</button>`}
          </div></td></tr>`);
        document.getElementById('lista').innerHTML = App.tabla(['Nombre', 'Correo', 'Teléfono', 'Rol', 'Estado', ''], filas, 'No se encontraron usuarios');
        cont.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => accion(b.dataset.a, lista.find((x) => x.id === Number(b.dataset.id)), lista); });
      };
      let espera;
      document.getElementById('f-texto').oninput = (e) => { clearTimeout(espera); espera = setTimeout(() => { filtros.texto = e.target.value; pintar(); }, 250); };
      document.getElementById('f-rol').onchange = (e) => { filtros.rol = e.target.value; pintar(); };
      document.getElementById('f-estado').onchange = (e) => { filtros.estado = e.target.value; pintar(); };
      await pintar();
    },
  };
}(window.App));
