// Reportes en PDF y Excel (DFR 5.6).
const fs = require('fs');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { todos } = require('../database/connection');
const { CLIENTES } = require('../models/AsuntoModel');
const Auth = require('./AuthController');
const Radar = require('./RadarController');
const { mostrar } = require('../utils/fechas');
const { validar, exigir, ErrorDeUsuario } = require('../utils/validaciones');

const DESPACHO = 'Despacho Jurídico Basurto & Asociados';
const TIPOS = ['Expedientes activos', 'Vencimientos del periodo', 'Actividades por responsable', 'Documentos de expedientes'];
const MARINO = '#0F2A5F';

// Cuenta cuántas filas hay de cada valor de una columna (sirve para el resumen del reporte)
function contarPor(filas, indice) {
  const conteo = {};
  filas.forEach((f) => { conteo[f[indice]] = (conteo[f[indice]] || 0) + 1; });
  return Object.entries(conteo).map(([texto, n]) => ({ texto, n }));
}

// Arma las columnas y filas de cada tipo de reporte con información de la base de datos.
// "resumenPor" indica qué columna se usa para los totales que salen arriba de la tabla.
function datos(tipo, desde, hasta) {
  if (tipo === 'Expedientes activos') {
    return {
      columnas: ['Expediente', 'Cliente(s)', 'Asunto', 'Juzgado', 'Responsable', 'Estado'],
      resumenPor: 5,
      filas: todos(`SELECT IFNULL(a.numero_expediente, a.folio) e, ${CLIENTES} c, a.tipo_asunto t, IFNULL(a.juzgado,'') j,
          u.nombre || ' ' || u.apellido_paterno r, a.estado s
        FROM asuntos a JOIN usuarios u ON u.id = a.abogado_id WHERE a.estado <> 'Concluido' ORDER BY a.creado_en`)
        .map((f) => [f.e, f.c, f.t, f.j, f.r, f.s]),
    };
  }
  if (tipo === 'Vencimientos del periodo') {
    // Se usa la misma lógica del radar para saber cuántos días hábiles faltan y su prioridad
    const plazos = Radar.enriquecer(todos(`SELECT p.*, IFNULL(a.numero_expediente, a.folio) expediente,
        u.nombre || ' ' || u.apellido_paterno responsable
      FROM plazos p JOIN asuntos a ON a.id = p.asunto_id JOIN usuarios u ON u.id = p.responsable_id
      WHERE p.fecha_vencimiento BETWEEN ? AND ? ORDER BY p.fecha_vencimiento`, desde, hasta));
    return {
      columnas: ['Vence', 'Expediente', 'Actuación pendiente', 'Responsable', 'Faltan', 'Prioridad / Estado'],
      resumenPor: 5,
      filas: plazos.map((p) => [mostrar(p.fecha_vencimiento), p.expediente, p.actuacion_pendiente, p.responsable,
        p.faltan || '—', p.prioridad ? p.prioridad.etiqueta : p.estado]),
    };
  }
  if (tipo === 'Documentos de expedientes') {
    return {
      columnas: ['Fecha', 'Expediente', 'Documento', 'Tipo', 'Subido por', 'Estado'],
      resumenPor: 5,
      filas: todos(`SELECT d.creado_en f, IFNULL(a.numero_expediente, a.folio) e, d.nombre_archivo n, d.tipo_documento t,
          u.nombre || ' ' || u.apellido_paterno s, d.estado es
        FROM documentos d JOIN asuntos a ON a.id = d.asunto_id JOIN usuarios u ON u.id = d.subido_por
        WHERE substr(d.creado_en, 1, 10) BETWEEN ? AND ? ORDER BY d.creado_en`, desde, hasta)
        .map((f) => [mostrar(f.f.slice(0, 10)), f.e, f.n, f.t, f.s, f.es]),
    };
  }
  return {
    columnas: ['Responsable', 'Fecha', 'Hora', 'Tipo', 'Actividad', 'Estado'],
    resumenPor: 0,
    filas: todos(`SELECT u.nombre || ' ' || u.apellido_paterno r, t.fecha f, t.hora_inicio h, t.tipo ti, t.titulo a, t.estado s
      FROM actividades t JOIN usuarios u ON u.id = t.responsable_id
      WHERE t.fecha BETWEEN ? AND ? ORDER BY r, t.fecha, t.hora_inicio`, desde, hasta)
      .map((f) => [f.r, mostrar(f.f), f.h, f.ti, f.a, f.s]),
  };
}

// Escribe el reporte en PDF con pdfkit: encabezado, cuadros de resumen, tabla,
// línea de firma y al pie de cada hoja quién lo elaboró y el número de página
function aPDF(ruta, titulo, periodo, elaboro, { columnas, filas, resumenPor }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', layout: 'landscape', margin: 40, bufferPages: true });
    const salida = fs.createWriteStream(ruta);
    doc.pipe(salida);
    const izq = 40;
    const anchoTotal = doc.page.width - 80;

    // Encabezado: franja de color con el nombre del despacho y el título
    doc.rect(0, 0, doc.page.width, 70).fill(MARINO);
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(16).text(DESPACHO, izq, 18);
    doc.font('Helvetica').fontSize(12).text(titulo, izq, 40);
    doc.fillColor('#475569').fontSize(9).text(`${periodo}   ·   Elaborado el ${new Date().toLocaleDateString('es-MX')}`, izq, 82);

    // Cuadros de resumen: total de registros y cuántos hay de cada estado o responsable
    const cuadros = [{ texto: 'Total de registros', n: filas.length }, ...contarPor(filas, resumenPor)].slice(0, 6);
    const anchoCuadro = (anchoTotal - (cuadros.length - 1) * 10) / cuadros.length;
    cuadros.forEach((c, i) => {
      const x = izq + i * (anchoCuadro + 10);
      doc.roundedRect(x, 100, anchoCuadro, 46, 6).fill(i === 0 ? MARINO : '#EEF2F9');
      doc.fillColor(i === 0 ? '#FFFFFF' : MARINO).font('Helvetica-Bold').fontSize(16).text(String(c.n), x + 10, 106);
      doc.font('Helvetica').fontSize(8.5).text(c.texto, x + 10, 128, { width: anchoCuadro - 20, ellipsis: true, height: 12 });
    });
    doc.y = 162;

    // Tabla: encabezado oscuro y filas alternadas en gris claro para leer mejor
    const ancho = anchoTotal / columnas.length;
    const fila = (valores, tipoFila) => {
      doc.font(tipoFila === 'encabezado' ? 'Helvetica-Bold' : 'Helvetica');
      const alto = Math.max(...valores.map((v) => doc.heightOfString(String(v ?? ''), { width: ancho - 8 }))) + 8;
      if (doc.y + alto > doc.page.height - 60) { doc.addPage(); doc.y = 40; }
      const y = doc.y;
      if (tipoFila === 'encabezado') doc.rect(izq, y, anchoTotal, alto).fill(MARINO);
      else if (tipoFila === 'par') doc.rect(izq, y, anchoTotal, alto).fill('#F5F7FB');
      valores.forEach((v, i) => {
        // Los valores "Urgente", "Vencido" o "Rechazado" se escriben en rojo para que resalten
        const rojo = tipoFila !== 'encabezado' && ['Urgente', 'Vencido', 'Rechazado'].includes(v);
        doc.fillColor(tipoFila === 'encabezado' ? '#FFFFFF' : rojo ? '#B42318' : '#1F2937');
        doc.text(String(v ?? ''), izq + 4 + i * ancho, y + 4, { width: ancho - 8 });
      });
      doc.y = y + alto;
    };
    doc.fontSize(8.5);
    fila(columnas, 'encabezado');
    filas.forEach((f, i) => fila(f, i % 2 ? 'par' : 'impar'));

    // Línea de firma del Abogado al final del reporte
    if (doc.y > doc.page.height - 130) doc.addPage();
    const yFirma = doc.page.height - 100;
    doc.moveTo(doc.page.width / 2 - 110, yFirma).lineTo(doc.page.width / 2 + 110, yFirma).strokeColor('#94A3B8').stroke();
    doc.fillColor('#1F2937').fontSize(9).text(elaboro, 0, yFirma + 5, { align: 'center', width: doc.page.width });
    doc.fillColor('#64748B').text('Abogado responsable', 0, yFirma + 18, { align: 'center', width: doc.page.width });

    // Pie de cada hoja: quién elaboró el reporte y "Página n de m"
    const rango = doc.bufferedPageRange();
    for (let i = 0; i < rango.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // para poder escribir el pie sin que se cree otra hoja
      doc.fillColor('#94A3B8').fontSize(8)
        .text(`Elaborado por ${elaboro} · Agenda de Bufete Jurídico`, izq, doc.page.height - 30, { lineBreak: false });
      doc.text(`Página ${i + 1} de ${rango.count}`, izq, doc.page.height - 30, { width: anchoTotal, align: 'right' });
    }
    doc.end();
    salida.on('finish', resolve);
    salida.on('error', reject);
  });
}

// Escribe el reporte en Excel con exceljs: encabezado, resumen, tabla con filtros y bordes
async function aExcel(ruta, titulo, periodo, elaboro, { columnas, filas, resumenPor }) {
  const libro = new ExcelJS.Workbook();
  const hoja = libro.addWorksheet('Reporte');
  hoja.addRow([DESPACHO]).font = { bold: true, size: 14, color: { argb: 'FF0F2A5F' } };
  hoja.addRow([titulo]).font = { bold: true, size: 12 };
  hoja.addRow([`${periodo} · Elaborado el ${new Date().toLocaleDateString('es-MX')} por ${elaboro}`]);
  hoja.addRow([]);

  // Resumen: total y conteo por estado o responsable
  hoja.addRow(['Resumen']).font = { bold: true };
  hoja.addRow(['Total de registros', filas.length]);
  contarPor(filas, resumenPor).forEach((c) => hoja.addRow([c.texto, c.n]));
  hoja.addRow([]);

  // Tabla con encabezado de color, bordes y filtro en cada columna
  const enc = hoja.addRow(columnas);
  enc.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A5F' } }; });
  filas.forEach((f) => hoja.addRow(f));
  const borde = { style: 'thin', color: { argb: 'FFD5DCE8' } };
  for (let r = enc.number; r <= hoja.rowCount; r++) {
    hoja.getRow(r).eachCell((c) => { c.border = { top: borde, left: borde, bottom: borde, right: borde }; });
  }
  hoja.autoFilter = { from: { row: enc.number, column: 1 }, to: { row: enc.number, column: columnas.length } };
  hoja.views = [{ state: 'frozen', ySplit: enc.number }];
  hoja.columns.forEach((c) => { c.width = 24; });
  await libro.xlsx.writeFile(ruta);
}

const ReporteController = {
  TIPOS,

  // Revisa el tipo, el formato y el periodo; si hay información genera el archivo donde el usuario eligió
  async generar({ tipo, desde, hasta, formato, ruta } = {}) {
    const s = Auth.exigirRol('Abogado');
    exigir(validar.opcion(tipo, TIPOS, 'el tipo de reporte'), validar.opcion(formato, ['PDF', 'Excel'], 'el formato'));
    let periodo = 'Al día de hoy';
    if (tipo !== 'Expedientes activos') {
      exigir(validar.fecha(desde, 'fecha inicial'), validar.fecha(hasta, 'fecha final'));
      if (hasta < desde) throw new ErrorDeUsuario('La fecha final no puede ser anterior a la inicial.');
      periodo = `Periodo: ${mostrar(desde)} al ${mostrar(hasta)}`;
    }
    const info = datos(tipo, desde, hasta);
    if (!info.filas.length) throw new ErrorDeUsuario('No hay información en el periodo seleccionado.');
    if (!ruta) return { necesitaRuta: true };
    const elaboro = `${s.nombre} ${s.apellido_paterno}`;
    if (formato === 'PDF') await aPDF(ruta, tipo, periodo, elaboro, info);
    else await aExcel(ruta, tipo, periodo, elaboro, info);
    return { mensaje: 'El reporte se generó exitosamente.', ruta };
  },
};

module.exports = ReporteController;
