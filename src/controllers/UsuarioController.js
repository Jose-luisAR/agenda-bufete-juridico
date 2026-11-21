// Administración de usuarios: solo el Abogado (DFR 1.1 a 1.5 y 1.10).
const UsuarioModel = require('../models/UsuarioModel');
const BitacoraModel = require('../models/BitacoraModel');
const Auth = require('./AuthController');
const { validar, exigir, limpiar, ErrorDeUsuario } = require('../utils/validaciones');
const { transaccion } = require('../database/connection');

// Nombre corto del usuario para mensajes y bitácora
const nombreDe = (u) => `${u.nombre} ${u.apellido_paterno}`;

const UsuarioController = {
  // DFR 1.2 Consultar usuarios, con filtros de texto, rol y estado
  listar(filtros = {}) {
    Auth.exigirRol('Abogado');
    return UsuarioModel.listar(filtros);
  },

  // Para los selectores de responsable (Abogado y Pasante pueden consultarlos)
  activos() {
    Auth.exigirSesion();
    return UsuarioModel.activos();
  },

  // DFR 1.1 Registrar usuarios: valida, revisa que el correo no esté repetido y guarda la contraseña cifrada
  registrar(datos) {
    const s = Auth.exigirRol('Abogado');
    const d = limpiar(datos);
    Auth.validarUsuario(d, { conContrasena: true });
    exigir(validar.opcion(d.rol, ['Abogado', 'Pasante'], 'el rol'));
    d.correo = d.correo.toLowerCase();
    if (UsuarioModel.correoEnUso(d.correo)) throw new ErrorDeUsuario('Ese correo electrónico ya está registrado en otro usuario.');
    const id = UsuarioModel.crear({ ...d, contrasena_hash: Auth.hash(d.contrasena) });
    BitacoraModel.registrar(s.id, 'Alta de usuario', `${nombreDe(d)} (${d.rol})`);
    return 'El usuario se registró exitosamente.';
  },

  // DFR 1.3 Modificar usuarios: no permite dejar al despacho sin ningún Abogado activo
  modificar(id, datos) {
    const s = Auth.exigirRol('Abogado');
    const d = limpiar(datos);
    Auth.validarUsuario(d, { conContrasena: false });
    exigir(validar.opcion(d.rol, ['Abogado', 'Pasante'], 'el rol'));
    d.correo = d.correo.toLowerCase();
    const actual = UsuarioModel.buscarPorId(id);
    if (!actual) throw new ErrorDeUsuario('El usuario no existe.');
    if (UsuarioModel.correoEnUso(d.correo, id)) throw new ErrorDeUsuario('Ese correo electrónico ya está registrado en otro usuario.');
    if (actual.rol === 'Abogado' && d.rol === 'Pasante' && actual.estado === 'Activo' && UsuarioModel.abogadosActivos().length === 1) {
      throw new ErrorDeUsuario('Debe existir al menos un Abogado activo.');
    }
    UsuarioModel.modificar(id, d);
    if (actual.rol !== d.rol) BitacoraModel.registrar(s.id, 'Cambio de rol', `${nombreDe(d)}: ${actual.rol} → ${d.rol}`);
    return 'Los datos del usuario se modificaron exitosamente.';
  },

  // DFR 1.4 Dar de baja: el usuario no se borra, queda Inactivo; sus pendientes pasan a otra persona
  darDeBaja(id, reasignarA = null) {
    const s = Auth.exigirRol('Abogado');
    if (Number(id) === s.id) throw new ErrorDeUsuario('No puede darse de baja a sí mismo.');
    const u = UsuarioModel.buscarPorId(id);
    if (!u || u.estado === 'Inactivo') throw new ErrorDeUsuario('El usuario ya está dado de baja.');
    if (u.rol === 'Abogado' && UsuarioModel.abogadosActivos().length === 1) throw new ErrorDeUsuario('Debe existir al menos un Abogado activo.');
    const p = UsuarioModel.pendientes(id);
    if ((p.actividades || p.plazos) && !reasignarA) {
      throw new ErrorDeUsuario(`Tiene ${p.actividades} actividades y ${p.plazos} plazos pendientes: elija quién los recibirá.`);
    }
    transaccion(() => {
      if (reasignarA) UsuarioModel.reasignarPendientes(id, reasignarA);
      UsuarioModel.cambiarEstado(id, 'Inactivo');
      BitacoraModel.registrar(s.id, 'Baja de usuario', nombreDe(u));
    });
    return 'El usuario se dio de baja exitosamente.';
  },

  // DFR 1.5 Reactivar usuarios dados de baja
  reactivar(id) {
    const s = Auth.exigirRol('Abogado');
    const u = UsuarioModel.buscarPorId(id);
    UsuarioModel.cambiarEstado(id, 'Activo');
    BitacoraModel.registrar(s.id, 'Reactivación de usuario', nombreDe(u));
    return 'El usuario se reactivó exitosamente.';
  },

  // DFR 1.10: el Abogado asigna una contraseña temporal
  restablecerContrasena(id, { temporal, confirmacion } = {}) {
    const s = Auth.exigirRol('Abogado');
    exigir(validar.contrasena(temporal), temporal !== confirmacion ? 'Las contraseñas no coinciden.' : null);
    const u = UsuarioModel.buscarPorId(id);
    UsuarioModel.cambiarContrasena(id, Auth.hash(temporal), true);
    BitacoraModel.registrar(s.id, 'Restablecimiento de contraseña', nombreDe(u));
    return `Se asignó una contraseña temporal a ${nombreDe(u)}.`;
  },

  // Cuenta las actividades y plazos pendientes de un usuario (antes de darlo de baja)
  pendientes(id) {
    Auth.exigirRol('Abogado');
    return UsuarioModel.pendientes(id);
  },
};

module.exports = UsuarioController;
