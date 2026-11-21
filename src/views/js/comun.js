// Utilidades compartidas por todas las vistas.
// Todo el texto que viene de la base de datos pasa por esc() antes de mostrarse.
window.App = window.App || { vistas: {} };

(function (App) {
  // Comunicación con el sistema
  // Devuelve los datos o lanza un Error con el mensaje para el usuario.
  App.api = async (ruta, ...args) => {
    const r = await window.api.llamar(ruta, ...args);
    if (!r.ok) throw new Error(r.mensaje);
    return r.datos;
  };
  // Igual que api() pero muestra el error en un aviso y devuelve undefined.
  App.intentar = async (ruta, ...args) => {
    try { return await App.api(ruta, ...args); } catch (e) { App.toast(e.message, 'error'); return undefined; }
  };

  // Escapa el texto para que no se pueda inyectar HTML en la pantalla
  App.esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Formatos de fecha para mostrar: DD/MM/AAAA y DD/MM/AAAA HH:MM
  App.fecha = (t) => (t ? String(t).slice(0, 10).split('-').reverse().join('/') : '');
  App.fechaHora = (t) => (t ? `${App.fecha(t)} ${String(t).slice(11, 16)}` : '');
  // Fecha de hoy como AAAA-MM-DD
  App.hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  // Iniciales y nombre completo de un usuario
  App.iniciales = (u) => `${(u.nombre || '?')[0]}${(u.apellido_paterno || '')[0] || ''}`.toUpperCase();
  App.nombre = (u) => `${u.nombre} ${u.apellido_paterno}${u.apellido_materno ? ` ${u.apellido_materno}` : ''}`;

  const COLOR_ESTADO = {
    Confirmado: 'verde', 'Por confirmar': 'naranja', Devuelto: 'rojo',
    'En preparación': 'azul', 'En trámite': 'verde', Concluido: 'gris',
    Pendiente: 'naranja', Autorizado: 'verde', Rechazado: 'rojo',
    Programada: 'azul', Realizada: 'verde', Cancelada: 'gris',
    Atendido: 'verde', 'Atendido fuera de tiempo': 'naranja',
    Activo: 'verde', Inactivo: 'gris',
    Urgente: 'rojo', Próximo: 'naranja', 'En tiempo': 'verde',
  };
  // Etiqueta de color para estados (Confirmado, Urgente, En trámite, etc.)
  App.etiqueta = (texto, color) => `<span class="etiqueta ${color || COLOR_ESTADO[texto] || 'gris'}">${App.esc(texto)}</span>`;

  // Íconos (trazos estilo Lucide)
  const P = {
    inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18.5 14.8c1.6.8 2.6 2.5 3 5.2"/>',
    expedientes: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
    agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/><path d="m12 12 6-6"/>',
    usuarios: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    respaldo: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    reportes: '<path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    campana: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
    ver: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    editar: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    borrar: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    salir: '<path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
    subir: '<path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    izq: '<path d="m15 18-6-6 6-6"/>',
    der: '<path d="m9 18 6-6-6-6"/>',
    alerta: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>',
    reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    abrir: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  };
  // Dibuja un ícono SVG por su nombre
  App.icono = (n) => `<svg class="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;

  // Mensaje flotante abajo de la pantalla (éxito o error)
  App.toast = (texto, tipo = '') => {
    let zona = document.querySelector('.toast-zona');
    if (!zona) { zona = document.createElement('div'); zona.className = 'toast-zona'; document.body.appendChild(zona); }
    const t = document.createElement('div');
    t.className = `toast ${tipo}`;
    t.textContent = texto;
    zona.appendChild(t);
    setTimeout(() => t.remove(), tipo === 'error' ? 5500 : 3500);
  };

  // Ventanas emergentes
  // Ventana emergente. Devuelve una promesa que se resuelve al cerrar; alAceptar se ejecuta al presionar Guardar y si lanza error lo muestra sin cerrar la ventana
  App.modal = ({ titulo, html, ancho = false, botones, alAbrir, alAceptar }) => new Promise((resolve) => {
    const fondo = document.createElement('div');
    fondo.className = 'fondo-modal';
    const bs = botones || [{ texto: 'Cancelar', clase: 'secundario', valor: null }, { texto: 'Guardar', valor: 'aceptar' }];
    fondo.innerHTML = `<div class="modal ${ancho ? 'ancho' : ''}" role="dialog">
      <div class="cabecera"><h2>${App.esc(titulo)}</h2><button class="icono-btn" data-cerrar>${App.icono('cerrar')}</button></div>
      <div class="cuerpo">${html}<p class="mensaje" data-msg></p></div>
      <div class="pie">${bs.map((b, i) => `<button class="boton ${b.clase || ''}" data-i="${i}">${App.esc(b.texto)}</button>`).join('')}</div></div>`;
    document.body.appendChild(fondo);
    const el = fondo.querySelector('.modal');
    const cerrar = (v) => { fondo.remove(); resolve(v); };
    el.mostrarError = (m) => { el.querySelector('[data-msg]').textContent = m; };
    fondo.querySelector('[data-cerrar]').onclick = () => cerrar(null);
    fondo.querySelectorAll('.pie button').forEach((btn) => {
      btn.onclick = async () => {
        const b = bs[Number(btn.dataset.i)];
        if (b.valor !== 'aceptar' || !alAceptar) return cerrar(b.valor);
        btn.disabled = true;
        try {
          const r = await alAceptar(el);
          if (r !== false) cerrar(r === undefined ? true : r);
        } catch (e) { el.mostrarError(e.message); } finally { btn.disabled = false; }
      };
    });
    const primero = el.querySelector('input, select, textarea');
    if (primero) primero.focus();
    if (alAbrir) alAbrir(el);
  });

  // Ventana de Sí / Cancelar
  App.confirmar = (texto, aceptar = 'Aceptar') => App.modal({
    titulo: 'Confirmar', html: `<p>${App.esc(texto)}</p>`,
    botones: [{ texto: 'Cancelar', clase: 'secundario', valor: false }, { texto: aceptar, valor: true }],
  });

  // Ventana que pide un texto (por ejemplo el motivo de una cancelación)
  App.pedirTexto = (titulo, etiqueta, aceptar = 'Aceptar') => App.modal({
    titulo, html: `<label>${App.esc(etiqueta)}<textarea name="texto"></textarea></label>`,
    botones: [{ texto: 'Cancelar', clase: 'secundario', valor: null }, { texto: aceptar, valor: 'aceptar' }],
    alAceptar: (el) => {
      const v = el.querySelector('[name=texto]').value.trim();
      if (!v) { el.mostrarError('Este campo es obligatorio.'); return false; }
      return v;
    },
  });

  // Lee todos los campos de un formulario y los regresa como objeto { nombre: valor }
  App.datos = (el) => {
    const d = {};
    el.querySelectorAll('input[name], select[name], textarea[name]').forEach((c) => {
      if (c.type === 'checkbox') { (d[c.name] = d[c.name] || []); if (c.checked) d[c.name].push(c.value); } else d[c.name] = c.value;
    });
    return d;
  };

  // Genera las opciones de un <select>
  App.opciones = (lista, valor, vacio) =>
    (vacio !== undefined ? `<option value="">${App.esc(vacio)}</option>` : '')
    + lista.map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${App.esc(v)}" ${String(v) === String(valor ?? '') ? 'selected' : ''}>${App.esc(t)}</option>`;
    }).join('');

  // Genera una tabla HTML con encabezados, filas y un mensaje si está vacía
  App.tabla = (columnas, filas, vacio) => `<table class="tabla"><thead><tr>${columnas.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${filas.length ? filas.join('') : `<tr><td colspan="${columnas.length}" class="vacio">${App.esc(vacio)}</td></tr>`}</tbody></table>`;
}(window.App));
