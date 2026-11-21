// Controlador de autenticación (DFR Módulo 1: 1.1, 1.6 a 1.10).
const bcrypt = require('bcryptjs');
const UsuarioModel = require('../models/UsuarioModel');
const BitacoraModel = require('../models/BitacoraModel');
const { validar, exigir, limpiar, ErrorDeUsuario } = require('../utils/validaciones');

// Configuración de seguridad: vueltas de cifrado, intentos permitidos y minutos de bloqueo
const RONDAS_BCRYPT = 10;
const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;
let sesion = null; // usuario con la sesión abierta en este equipo

// Cifra una contraseña con bcrypt (en la base de datos nunca se guarda la contraseña en texto)
const hash = (texto) => bcrypt.hashSync(texto, RONDAS_BCRYPT);

// Revisa que los datos de un usuario estén completos y bien escritos; si algo falla lanza un mensaje para el usuario
function validarUsuario(d, { conContrasena }) {
  exigir(
    validar.obligatorio(d.nombre, 'Nombre (s)'),
    validar.obligatorio(d.apellido_paterno, 'Apellido Paterno'),
    validar.obligatorio(d.correo, 'Correo electrónico'),
    validar.correo(d.correo),
    validar.telefono(d.telefono),
    conContrasena ? validar.contrasena(d.contrasena) : null,
    conContrasena && d.contrasena !== d.confirmacion ? 'Las contraseñas no coinciden.' : null,
  );
}

const AuthController = {
  hash,
  validarUsuario,

  // Dice si ya existe al menos un usuario (si no, la pantalla de inicio pide crear la primera cuenta)
  hayUsuarios: () => UsuarioModel.contar() > 0,

  // La primera cuenta de Abogado se crea al instalar el sistema (DFR 1.1).
  crearPrimerAbogado(datos = {}) {
    if (UsuarioModel.contar() > 0) throw new ErrorDeUsuario('Ya existe una cuenta de Abogado.');
    const d = limpiar(datos);
    validarUsuario(d, { conContrasena: true });
    const id = UsuarioModel.crear({ ...d, correo: d.correo.toLowerCase(), rol: 'Abogado', contrasena_hash: hash(d.contrasena) });
    BitacoraModel.registrar(id, 'Alta de usuario', 'Primera cuenta de Abogado (instalación)');
    return { id };
  },

  // DFR 1.6 Iniciar sesión: valida correo, contraseña y tipo de usuario, y bloquea la cuenta tras 5 intentos fallidos
  iniciarSesion(correo, contrasena, tipo) {
    exigir(
      validar.obligatorio(correo, 'Correo electrónico'),
      validar.obligatorio(contrasena, 'Contraseña'),
      validar.opcion(tipo, ['Abogado', 'Pasante'], 'el tipo de usuario'),
    );
    const u = UsuarioModel.buscarPorCorreo(String(correo).trim().toLowerCase());
    const incorrecto = 'Correo, contraseña o tipo de usuario incorrectos.';
    if (!u) throw new ErrorDeUsuario(incorrecto);

    if (u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date()) {
      throw new ErrorDeUsuario(`Cuenta bloqueada por intentos fallidos. Intente de nuevo en ${MINUTOS_BLOQUEO} minutos.`);
    }
    if (!bcrypt.compareSync(contrasena, u.contrasena_hash) || u.rol !== tipo) {
      // Al quinto intento fallido seguido, la cuenta se bloquea 15 minutos (DFR 1.6)
      const bloquear = u.intentos_fallidos + 1 >= MAX_INTENTOS;
      if (bloquear) UsuarioModel.bloquear(u.id, new Date(Date.now() + MINUTOS_BLOQUEO * 60000).toISOString());
      else UsuarioModel.registrarIntentoFallido(u.id);
      throw new ErrorDeUsuario(bloquear
        ? `Cuenta bloqueada por intentos fallidos. Intente de nuevo en ${MINUTOS_BLOQUEO} minutos.` : incorrecto);
    }
    if (u.estado !== 'Activo') throw new ErrorDeUsuario('Su cuenta está dada de baja; comuníquese con el Abogado.');

    UsuarioModel.reiniciarIntentos(u.id);
    sesion = UsuarioModel.buscarPorId(u.id);
    BitacoraModel.registrar(u.id, 'Inicio de sesión');
    return sesion;
  },

  // DFR 1.7 Cerrar sesión: deja registro en la bitácora y olvida al usuario
  cerrarSesion(motivo = 'Cierre de sesión') {
    if (sesion) BitacoraModel.registrar(sesion.id, motivo);
    sesion = null;
    return true;
  },

  // Devuelve el usuario que tiene la sesión abierta (o null)
  sesionActual: () => sesion,

  // DFR 1.9: cambiar la propia contraseña
  cambiarContrasena({ actual, nueva, confirmacion } = {}) {
    const s = AuthController.exigirSesion();
    const u = UsuarioModel.buscarConHash(s.id);
    if (!u.debe_cambiar_contrasena) {
      exigir(validar.obligatorio(actual, 'Contraseña actual'));
      if (!bcrypt.compareSync(actual, u.contrasena_hash)) throw new ErrorDeUsuario('La contraseña actual no es correcta.');
    }
    exigir(validar.contrasena(nueva), nueva !== confirmacion ? 'Las contraseñas no coinciden.' : null);
    if (bcrypt.compareSync(nueva, u.contrasena_hash)) throw new ErrorDeUsuario('La contraseña nueva debe ser distinta de la actual.');
    UsuarioModel.cambiarContrasena(s.id, hash(nueva));
    sesion = UsuarioModel.buscarPorId(s.id);
    BitacoraModel.registrar(s.id, 'Cambio de contraseña');
    return 'La contraseña se cambió exitosamente.';
  },

  // Se usa al inicio de cada operación: si no hay sesión, no deja continuar
  exigirSesion() {
    if (!sesion) throw new ErrorDeUsuario('Tu sesión terminó. Inicia sesión de nuevo.');
    if (sesion.debe_cambiar_contrasena) throw new ErrorDeUsuario('Cree su nueva contraseña para continuar.');
    return sesion;
  },

  // Igual que exigirSesion pero además revisa el rol; así un Pasante no puede hacer cosas del Abogado aunque lo intente (DFR, Confiabilidad)
  exigirRol(...roles) {
    const s = sesion;
    if (!s) throw new ErrorDeUsuario('Tu sesión terminó. Inicia sesión de nuevo.');
    if (s.debe_cambiar_contrasena) throw new ErrorDeUsuario('Cree su nueva contraseña para continuar.');
    if (!roles.includes(s.rol)) throw new ErrorDeUsuario('No tienes permiso para realizar esta acción.');
    return s;
  },
};

module.exports = AuthController;
