// Panel de Control según el rol (DFR 5.1 a 5.5).
const AgendaModel = require('../models/AgendaModel');
const AsuntoModel = require('../models/AsuntoModel');
const ClienteModel = require('../models/ClienteModel');
const PlazoModel = require('../models/PlazoModel');
const AvisoModel = require('../models/AvisoModel');
const { uno } = require('../database/connection');
const Auth = require('./AuthController');
const Radar = require('./RadarController');
const { hoy } = require('../utils/fechas');

const PanelController = {
  // DFR 5.1 a 5.4 Panel de control: indicadores del día, actividades de hoy, plazos próximos y pendientes por revisar, según el rol
  resumen() {
    const s = Auth.exigirSesion();
    const esAbogado = s.rol === 'Abogado';
    const plazos = Radar.enriquecer(PlazoModel.pendientes(esAbogado ? {} : { responsableId: s.id }));
    const urgentes = plazos.filter((p) => p.prioridad.etiqueta === 'Urgente').length;

    const indicadores = esAbogado
      ? [
        { clave: 'audiencias', titulo: 'Audiencias de hoy', valor: AgendaModel.contarHoy(hoy(), 'Audiencia'), ir: 'agenda' },
        { clave: 'urgentes', titulo: 'Vencimientos urgentes', valor: urgentes, ir: 'radar', color: 'rojo' },
        { clave: 'documentos', titulo: 'Documentos por autorizar', valor: AsuntoModel.documentosPendientes().length, ir: 'panel' },
        { clave: 'expedientes', titulo: 'Expedientes activos', valor: AsuntoModel.contarActivos(), ir: 'expedientes' },
      ]
      : [
        { clave: 'actividades', titulo: 'Mis actividades de hoy', valor: AgendaModel.contarHoy(hoy(), null, s.id), ir: 'agenda' },
        { clave: 'urgentes', titulo: 'Mis plazos urgentes', valor: urgentes, ir: 'radar', color: 'rojo' },
        { clave: 'documentos', titulo: 'Mis documentos pendientes o rechazados', ir: 'expedientes',
          valor: uno("SELECT COUNT(*) AS n FROM documentos WHERE subido_por = ? AND estado IN ('Pendiente','Rechazado')", s.id).n },
        { clave: 'expedientes', titulo: 'Mis expedientes asignados', valor: AsuntoModel.contarActivos(null, s.id), ir: 'expedientes' },
      ];

    let avisoRespaldo = null;
    if (esAbogado) {
      const ultimo = uno("SELECT valor FROM configuracion WHERE clave = 'ultimo_respaldo_manual'");
      const dias = ultimo ? (Date.now() - new Date(ultimo.valor).getTime()) / 86400000 : Infinity;
      if (dias >= 7) avisoRespaldo = 'Han pasado 7 días sin respaldo externo.';
    }

    return {
      usuario: s,
      indicadores,
      actividades: AgendaModel.delDia(hoy(), esAbogado ? null : s.id),
      plazos: plazos.slice(0, 5),
      pendientes: esAbogado ? { documentos: AsuntoModel.documentosPendientes(), clientes: ClienteModel.porConfirmar() } : null,
      avisoRespaldo,
    };
  },

  // DFR 5.5 Avisos de la campana del usuario
  avisos() {
    const s = Auth.exigirSesion();
    return { lista: AvisoModel.deUsuario(s.id), noLeidos: AvisoModel.noLeidos(s.id) };
  },

  // Marca un aviso como leído cuando el usuario le da clic
  marcarAvisoLeido(id) {
    const s = Auth.exigirSesion();
    AvisoModel.marcarLeido(id, s.id);
    return true;
  },
};

module.exports = PanelController;
