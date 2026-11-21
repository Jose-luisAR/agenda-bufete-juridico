// Vista de acceso: inicio de sesión, primera cuenta del Abogado y contraseña temporal.
(function (App) {
  const $ = (id) => document.getElementById(id);
  // En la misma pantalla hay tres formularios y solo se muestra uno a la vez
  const formularios = ['form-login', 'form-primer', 'form-nueva'];
  const mostrar = (id) => formularios.forEach((f) => { $(f).hidden = f !== id; });
  // Muestra un mensaje de error o de éxito debajo del formulario
  const mensaje = (form, texto, exito = false) => {
    const m = form.querySelector('[data-msg]');
    m.textContent = texto || '';
    m.classList.toggle('exito', exito);
  };

  document.querySelectorAll('[data-icono]').forEach((el) => el.insertAdjacentHTML('afterbegin', App.icono(el.dataset.icono)));

  // Guarda los plazos urgentes y actividades del día para la ventana "Para hoy" y abre el sistema
  const entrar = (datos) => {
    try { sessionStorage.setItem('alEntrar', JSON.stringify({ urgentes: datos.urgentes || [], actividadesHoy: datos.actividadesHoy || [] })); } catch (e) { /* opcional */ }
    location.href = 'app.html';
  };

  // Si no hay usuarios se pide crear la primera cuenta del Abogado; si la sesión se cerró por inactividad se avisa
  async function iniciar() {
    const hay = await App.intentar('auth.hayUsuarios');
    mostrar(hay ? 'form-login' : 'form-primer');
    const motivo = new URLSearchParams(location.search).get('motivo');
    if (motivo === 'inactividad') mensaje($('form-login'), 'Su sesión se cerró por inactividad.');
  }

  $('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = App.datos(e.target);
    try {
      const r = await App.api('auth.iniciarSesion', d.correo, d.contrasena, d.tipo);
      if (r.usuario.debe_cambiar_contrasena) return mostrar('form-nueva');
      entrar(r);
    } catch (err) { mensaje(e.target, err.message); }
  });

  $('form-primer').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await App.api('auth.crearPrimerAbogado', App.datos(e.target));
      e.target.reset();
      mostrar('form-login');
      mensaje($('form-login'), 'El usuario se registró exitosamente. Ya puede iniciar sesión.', true);
    } catch (err) { mensaje(e.target, err.message); }
  });

  $('form-nueva').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = App.datos(e.target);
    try {
      await App.api('auth.cambiarContrasena', { nueva: d.nueva, confirmacion: d.confirmacion });
      entrar({});
    } catch (err) { mensaje(e.target, err.message); }
  });

  // DFR 1.10: la contraseña no se restablece por correo
  $('olvide').addEventListener('click', () => mensaje($('form-login'), 'Pida al Abogado del despacho que restablezca su contraseña.'));

  iniciar();
}(window.App));
