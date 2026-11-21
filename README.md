# Agenda de Bufete Jurídico — MADIL

Aplicación de escritorio para el **Despacho Jurídico Basurto & Asociados**: clientes, expedientes,
agenda y radar de vencimientos (ver DFR v1.0).

**Stack (DFR, Restricciones de diseño y construcción):** Electron · Node.js · SQLite · bcrypt · patrón MVC
· Windows 10/11 de 64 bits.

## 1. Programas que instala cada integrante (Windows)

| Programa | Para qué | Dónde |
|---|---|---|
| **Node.js LTS** (22 o superior) | Ejecutar el proyecto y npm | https://nodejs.org → botón "LTS" (instalador .msi, dejar todo por defecto) |
| **Git for Windows** | Control de versiones | https://git-scm.com/download/win (dejar opciones por defecto) |
| **Visual Studio Code** | Editor | https://code.visualstudio.com |
| **DB Browser for SQLite** (opcional) | Ver la base de datos | https://sqlitebrowser.org |
| Cuenta de **GitHub** | Repositorio del equipo | https://github.com |

Comprobar en una terminal nueva (PowerShell o CMD):

```
node -v      (debe decir v22 o mayor)
npm -v
git --version
```

Configurar Git una sola vez (con tu nombre y el correo de tu cuenta de GitHub):

```
git config --global user.name "Tu Nombre"
git config --global user.email "tucorreo@ejemplo.com"
```

> No hace falta instalar Python ni Visual Studio Build Tools: el proyecto usa el SQLite que ya viene
> integrado en Node.js y Electron (`node:sqlite`), así que no se compila nada.

## 2. Crear el repositorio (solo la líder del proyecto)

1. En GitHub: **New repository** → nombre `agenda-bufete-juridico` → **Private** → sin README.
2. En **Settings → Collaborators**, agregar a los 5 integrantes.
3. En la carpeta del proyecto:

```
git init
git add .
git commit -m "Estructura inicial del proyecto"
git branch -M main
git remote add origin https://github.com/USUARIO/agenda-bufete-juridico.git
git push -u origin main
```

## 3. Preparar el proyecto (cada integrante)

```
git clone https://github.com/USUARIO/agenda-bufete-juridico.git
cd agenda-bufete-juridico
npm install
npm start
```

La primera vez la aplicación pide **crear la cuenta del Abogado** (así lo pide el DFR); después
muestra el inicio de sesión.

Abrir la carpeta en VS Code (`code .`) y aceptar las **extensiones recomendadas**.

## 4. Comandos

| Comando | Qué hace |
|---|---|
| `npm start` | Abre la aplicación |
| `npm run dev` | Abre la aplicación con las herramientas de desarrollo (consola) |
| `npm test` | Ejecuta las pruebas unitarias |
| `npm run build` | Genera el instalador para Windows en la carpeta `dist/` |
| `npm run datos-ejemplo` | Llena una base **vacía** con datos de prueba (Abogado `andrea@despacho.mx`, pasantes `luis@despacho.mx` y `yusleivy@despacho.mx`, contraseña `Despacho2026`) |

La base de datos se guarda en `%APPDATA%\Agenda de Bufete Jurídico\agenda.db`.
Para empezar de cero, cierra la aplicación y borra ese archivo.

### Abrir y ejecutar desde Visual Studio Code

1. En VS Code: **Archivo > Abrir carpeta** y elegir `Documents\agenda-bufete-juridico`.
2. Abrir la terminal con **Terminal > Nuevo terminal** (de preferencia CMD).
3. Escribir `npm start`. También se puede presionar **F5** (configuración "Iniciar sistema").

### Ver la base de datos

La base de datos es un solo archivo SQLite: `%APPDATA%\Agenda de Bufete Jurídico\agenda.db`.

- **En VS Code:** instalar la extensión recomendada **SQLite Viewer**. Luego **Archivo > Abrir archivo**,
  escribir `%APPDATA%\Agenda de Bufete Jurídico` en la barra de dirección y abrir `agenda.db`.
  Se ven todas las tablas (usuarios, clientes, asuntos, documentos, actividades, plazos, bitácora...).
- **Con un programa aparte:** DB Browser for SQLite (gratuito, sqlitebrowser.org). Ahí también se pueden
  ejecutar consultas SQL. Es mejor cerrar el sistema antes de modificar algo desde ahí.
- Los archivos subidos a los expedientes están en `%APPDATA%\Agenda de Bufete Jurídico\documentos\<id del asunto>`
  y los respaldos automáticos en `...\Respaldos`.

## 5. Estructura (MVC)

```
src/
├── main/            Proceso principal de Electron
│   ├── main.js      Crea la ventana y abre la base de datos
│   ├── preload.js   Puente seguro: funciones que pueden llamar las vistas (window.api)
│   ├── ipc.js       "Rutas": conecta cada canal con un controlador
│   └── recordatorios.js  Notificaciones de Windows de actividades y plazos urgentes
├── controllers/     (C) Reglas de negocio del DFR. Ej. AuthController.js
├── models/          (M) Consultas a la base de datos. Ej. UsuarioModel.js
├── database/
│   ├── connection.js  Único archivo que conoce SQLite
│   └── migrations/    Archivos .sql numerados (001_, 002_, ...) que crean las tablas
├── utils/           Código compartido: validaciones.js, diasHabiles.js, fechas.js, rutas.js
└── views/           (V) Pantallas
    ├── login.html   Inicio de sesión, primera cuenta y nueva contraseña
    ├── app.html     Menú lateral + encabezado; aquí se dibujan las vistas
    ├── css/         estilos.css (paleta y componentes), fuentes/, img/
    └── js/          comun.js (App.api, modal, tabla...), app.js (menú y navegación)
        └── vistas/  panel, clientes, expedientes, agenda, radar, usuarios, respaldo, reportes
scripts/             datos-ejemplo.js
tests/               Pruebas (npm test)
```

Las vistas llaman al backend con `App.api('modulo.accion', ...datos)`; las rutas están en `src/main/ipc.js`.

**Cómo agregar una función nueva** (ejemplo: Registrar clientes):

1. `src/database/migrations/002_clientes.sql` → la tabla.
2. `src/models/ClienteModel.js` → las consultas.
3. `src/controllers/ClienteController.js` → validaciones y reglas (usar `AuthController.exigirRol(...)`).
4. `src/main/ipc.js` → agregar la ruta al mapa `RUTAS`, por ejemplo `'clientes.registrar'`.
5. `src/views/js/vistas/...` → la pantalla que la usa con `App.api('clientes.registrar', datos)`.
6. `tests/clientes.test.js` → su prueba.

## 6. Forma de trabajo en equipo (Git)

- `main` siempre debe funcionar. Nadie trabaja directo en `main`.
- Una rama por componente o tarea:
  `c1-usuarios`, `c2-expedientes`, `c3-agenda`, `c4-radar`, `c5-panel`.

```
git checkout main
git pull
git checkout -b c1-usuarios
# ... trabajar ...
git add .
git commit -m "C1: registrar usuarios"
git push -u origin c1-usuarios
```

- En GitHub se abre un **Pull Request** hacia `main`; otro integrante lo revisa y lo aprueba.
- Antes de subir: `npm test` debe pasar.

## 7. Librerías incluidas

| Librería | Uso en el DFR |
|---|---|
| `node:sqlite` (integrado) | Base de datos local SQLite, sin instalar nada extra |
| `bcryptjs` | Cifrado de contraseñas (bcrypt) |
| `pdfkit` / `exceljs` | Reportes en PDF y Excel |
| `electron-builder` | Instalador para Windows |

Las notificaciones de Windows y abrir PDF/Word/imágenes con su programa se hacen con Electron
(`Notification` y `shell.openPath`), sin librerías extra.

## 8. Problemas comunes

- **"npm.ps1 no se puede cargar porque la ejecución de scripts está deshabilitada"** (PowerShell):
  usar la terminal **CMD**, o ejecutar una vez
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- **`npm install` muy lento o falla:** revisar la conexión y volver a ejecutarlo; si persiste, borrar la
  carpeta `node_modules` y el archivo `package-lock.json` y repetir.
- **El antivirus bloquea `electron.exe`:** permitirlo; es el ejecutable de desarrollo.
