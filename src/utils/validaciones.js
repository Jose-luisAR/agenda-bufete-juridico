// Validaciones que se repiten en todo el sistema (DFR, Reusabilidad).
// Cada función regresa un mensaje de error o null si el dato es válido.

// Error con un mensaje que sí se le muestra al usuario (los demás errores se muestran como "error inesperado")
class ErrorDeUsuario extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.esDeUsuario = true;
  }
}

// Expresiones regulares para revisar el formato de correo, teléfono, contraseña, CURP y RFC
const REGEX = {
  correo: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  telefono: /^\d{10}$/,
  contrasena: /^(?=.*[A-Za-zÁÉÍÓÚÑáéíóúñ])(?=.*\d).{8,}$/,
  curp: /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z\d]\d$/,
  rfc: /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/,
};

// Funciones de validación: si el dato está bien regresan null, si no, el mensaje de error
const validar = {
  obligatorio: (v, campo) => (v === undefined || v === null || String(v).trim() === '' ? `El campo ${campo} es obligatorio.` : null),
  correo: (v) => (REGEX.correo.test(String(v || '').trim()) ? null : 'El correo electrónico no es válido.'),
  telefono: (v) => (REGEX.telefono.test(String(v || '')) ? null : 'El teléfono debe tener exactamente 10 dígitos.'),
  contrasena: (v) => (REGEX.contrasena.test(String(v || '')) ? null : 'La contraseña debe tener al menos 8 caracteres e incluir letras y números.'),
  curp: (v) => (REGEX.curp.test(String(v || '').toUpperCase()) ? null : 'La CURP no es válida.'),
  rfc: (v) => (REGEX.rfc.test(String(v || '').toUpperCase()) ? null : 'El RFC no es válido.'),
  fecha: (v, campo = 'fecha') => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? null : `Escriba una ${campo} válida.`),
  hora: (v, campo = 'hora') => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? null : `Escriba una ${campo} válida (formato de 24 horas).`),
  opcion: (v, opciones, campo) => (opciones.includes(v) ? null : `Seleccione ${campo}.`),
};

// Limpia espacios de todos los textos de un formulario.
const limpiar = (obj = {}) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));

// Lanza el primer error encontrado en una lista de resultados de validación.
function exigir(...resultados) {
  const error = resultados.find((r) => r);
  if (error) throw new ErrorDeUsuario(error);
}

module.exports = { validar, exigir, limpiar, ErrorDeUsuario };
