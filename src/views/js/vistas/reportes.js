// Reportes en PDF y Excel: solo el Abogado (DFR 5.6).
(function (App) {
  App.vistas.reportes = {
    titulo: 'Reportes',
    subtitulo: 'Información del despacho para guardar o imprimir',

    // Formulario del reporte: tipo, fechas (no se piden para Expedientes activos) y formato PDF o Excel
    async render(cont) {
      const hoy = App.hoy();
      const inicioMes = `${hoy.slice(0, 8)}01`;
      cont.innerHTML = `<div class="tarjeta relleno" style="max-width:640px"><div class="formulario" id="form">
          <label>Tipo de reporte <select name="tipo">${App.opciones(['Expedientes activos', 'Vencimientos del periodo', 'Actividades por responsable', 'Documentos de expedientes'], 'Expedientes activos')}</select></label>
          <div class="fila" data-fechas hidden>
            <label>Fecha inicial <input type="date" name="desde" value="${inicioMes}"></label>
            <label>Fecha final <input type="date" name="hasta" value="${hoy}"></label>
          </div>
          <label>Formato <select name="formato">${App.opciones(['PDF', 'Excel'], 'PDF')}</select></label>
          <div><button class="boton" id="generar">${App.icono('reportes')}Generar reporte</button></div>
        </div></div>`;
      const tipo = cont.querySelector('[name=tipo]');
      tipo.onchange = () => { cont.querySelector('[data-fechas]').hidden = tipo.value === 'Expedientes activos'; };
      cont.querySelector('#generar').onclick = async () => {
        const r = await App.intentar('reportes.generar', App.datos(cont.querySelector('#form')));
        if (r && r.mensaje) App.toast(r.mensaje, 'exito');
      };
    },
  };
}(window.App));
