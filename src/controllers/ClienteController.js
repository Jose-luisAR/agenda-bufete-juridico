// Clientes (DFR 2.1 a 2.6).
const ClienteModel = require('../models/ClienteModel');
const AsuntoModel = require('../models/AsuntoModel');
const AvisoModel = require('../models/AvisoModel');
const BitacoraModel = require('../models/BitacoraModel');
const Auth = require('./AuthController');
const { validar, exigir, limpiar, ErrorDeUsuario } = require('../utils/validaciones');

// Revisa los datos del cliente según sea persona física o moral, y que la CURP o el RFC sean válidos y no estén repetidos
function validarCliente(d, excluirId = 0) {
  exigir(validar.opcion(d.tipo_persona, ['Física', 'Moral'], 'el tipo de persona'));
  if (d.tipo_persona === 'Física') {
    exigir(validar.obligatorio(d.nombre, 'Nombre (s)'), validar.obligatorio(d.apellido_paterno, 'Apellido Paterno'));
  } else {
    exigir(validar.obligatorio(d.razon_social, 'Razón social'));
  }
  exigir(
    validar.telefono(d.telefono),
    d.correo ? validar.correo(d.correo) : null,
    validar.obligatorio(d.calle_numero, 'Calle y número'),
    validar.obligatorio(d.colonia, 'Colonia'),
    validar.obligatorio(d.municipio, 'Municipio'),
    validar.obligatorio(d.estado_republica, 'Estado'),
    /^\d{5}$/.test(d.codigo_postal || '') ? null : 'El código postal debe tener 5 dígitos.',
  );
  if (d.curp_rfc) {
    d.curp_rfc = d.curp_rfc.toUpperCase();
    const largo = d.curp_rfc.length;
    if (largo === 18) exigir(validar.curp(d.curp_rfc));
    else if ((d.tipo_persona === 'Moral' && largo === 12) || (d.tipo_persona === 'Física' && largo === 13)) exigir(validar.rfc(d.curp_rfc));
    else throw new ErrorDeUsuario('La CURP debe tener 18 caracteres; el RFC, 12 (persona moral) o 13 (persona física).');
    if (ClienteModel.curpRfcEnUso(d.curp_rfc, excluirId)) throw new ErrorDeUsuario('Esa CURP o RFC ya está registrada en otro cliente.');
  }
  if (d.tipo_persona === 'Moral') { d.nombre = null; d.apellido_paterno = null; d.apellido_materno = null; } else d.razon_social = null;
}

// Nombre completo del cliente: razón social si es persona moral, o nombre y apellidos si es persona física
const nombreDe = (d) => (d.tipo_persona === 'Moral' ? d.razon_social : [d.nombre, d.apellido_paterno, d.apellido_materno].filter(Boolean).join(' '));

const ClienteController = {
  // DFR 2.2 Consultar clientes con búsqueda y filtros
  listar(filtros = {}) {
    Auth.exigirSesion();
    return ClienteModel.listar(filtros);
  },

  // Ficha de un cliente con sus asuntos
  consultar(id) {
    Auth.exigirSesion();
    const c = ClienteModel.buscarPorId(id);
    if (!c) throw new ErrorDeUsuario('El cliente no existe.');
    return { ...c, asuntos: AsuntoModel.asuntosDeCliente(id) };
  },

  // Clientes ya confirmados por el Abogado (solo esos se pueden usar al registrar un asunto)
  confirmados() {
    Auth.exigirSesion();
    return ClienteModel.confirmados();
  },

  // DFR 2.1 Registrar clientes. Si lo registra un Pasante queda Por confirmar y se avisa a los Abogados. forzar = true cuando el usuario acepta guardar aunque exista otro cliente con el mismo nombre
  registrar(datos, forzar = false) {
    const s = Auth.exigirSesion();
    const d = limpiar(datos);
    validarCliente(d);
    if (!forzar && ClienteModel.mismoNombre(nombreDe(d))) {
      return { confirmar: 'Ya existe un cliente con ese nombre. ¿Desea registrarlo de todos modos?' };
    }
    d.estado = s.rol === 'Abogado' ? 'Confirmado' : 'Por confirmar';
    d.registrado_por = s.id;
    ClienteModel.crear(d);
    if (s.rol === 'Pasante') {
      require('../models/UsuarioModel').abogadosActivos()
        .forEach((a) => AvisoModel.crear(a.id, `Cliente por confirmar: ${nombreDe(d)}`, 'clientes'));
    }
    return { mensaje: 'El cliente se registró exitosamente.' };
  },

  // DFR 2.3 Modificar clientes
  modificar(id, datos) {
    const s = Auth.exigirSesion();
    const actual = ClienteModel.buscarPorId(id);
    if (!actual) throw new ErrorDeUsuario('El cliente no existe.');
    const d = limpiar(datos);
    validarCliente(d, id);
    // Si lo cambia un Pasante, vuelve a quedar Por confirmar (DFR 2.3)
    d.estado = s.rol === 'Pasante' ? 'Por confirmar' : actual.estado === 'Devuelto' ? 'Por confirmar' : actual.estado;
    ClienteModel.modificar(id, d);
    return 'Los datos del cliente se modificaron exitosamente.';
  },

  // DFR 2.4 Eliminar clientes: solo si no tienen asuntos
  eliminar(id) {
    const s = Auth.exigirRol('Abogado');
    const c = ClienteModel.buscarPorId(id);
    if (ClienteModel.tieneAsuntos(id)) throw new ErrorDeUsuario('No se puede eliminar al cliente porque tiene asuntos registrados.');
    ClienteModel.eliminar(id);
    BitacoraModel.registrar(s.id, 'Eliminación de cliente', c.nombre_completo);
    return 'El cliente se eliminó exitosamente.';
  },

  // DFR 2.5 El Abogado confirma que los datos capturados por el Pasante son correctos
  confirmar(id) {
    const s = Auth.exigirRol('Abogado');
    const c = ClienteModel.buscarPorId(id);
    ClienteModel.cambiarEstado(id, 'Confirmado');
    BitacoraModel.registrar(s.id, 'Confirmación de cliente', c.nombre_completo);
    return 'Los datos del cliente fueron confirmados.';
  },

  // DFR 2.6 El Abogado regresa el cliente al Pasante con observaciones para que lo corrija
  devolver(id, observaciones) {
    const s = Auth.exigirRol('Abogado');
    if (!observaciones || !observaciones.trim()) throw new ErrorDeUsuario('Escriba qué datos debe corregir el Pasante.');
    const c = ClienteModel.buscarPorId(id);
    ClienteModel.cambiarEstado(id, 'Devuelto', observaciones.trim());
    AvisoModel.crear(c.registrado_por, `Corregir datos de ${c.nombre_completo}: ${observaciones.trim()}`, 'clientes', id);
    BitacoraModel.registrar(s.id, 'Devolución de cliente', c.nombre_completo);
    return 'El cliente se devolvió al Pasante para su corrección.';
  },
};

module.exports = ClienteController;
