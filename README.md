# Mi Secretaria

App personal para registrar gastos familiares, pagos fijos (tarjetas y servicios) y pendientes
(trabajo, hogar, encargos). Funciona en laptop y celular Android, también sin internet.

## Qué hace (versión 1)
- **Gastos** en soles (S/) o dólares (US$), con conversión automática, categorías y resumen del mes.
- **Pagos fijos**: tarjetas, luz, agua, internet… avisa cuántos días faltan y al pagar se registra como gasto.
- **Pendientes** por área (Hogar, Trabajo, Personal, Familia), con fecha, prioridad y repetición.
- **Anotar por voz**: botón de micrófono; entiende frases como “Gasté 85 soles en luz”, “Pagué la Visa 450” o “Recuérdame arreglar la ducha el sábado”. En Android, mantén presionado el ícono de la app → *Dictar*.
- **Reportes en Excel**: del mes o del año, desde la pestaña Gastos. Al empezar cada mes la app ofrece el reporte del mes anterior.
- **Copia de seguridad**: descargar/restaurar un archivo `.json`.

## Dónde se guardan los datos
En el propio dispositivo (navegador). **Descarga una copia con frecuencia** desde Ajustes y guárdala
en Google Drive o en tu correo. Esa copia también sirve para pasar los datos de la laptop al celular.

## Cómo publicarla gratis (GitHub Pages)
1. Crea una cuenta en https://github.com y un repositorio nuevo, por ejemplo `mi-secretaria`.
2. Sube todos los archivos de esta carpeta (botón *Add file → Upload files*).
3. En el repositorio: *Settings → Pages → Branch: main / root → Save*.
4. En 1–2 minutos tendrás una dirección como `https://TU-USUARIO.github.io/mi-secretaria/`.
5. **Celular Android**: abre esa dirección en Chrome → menú ⋮ → *Agregar a pantalla principal / Instalar app*.
6. **Laptop**: ábrela en Chrome o Edge → ícono de instalar en la barra de direcciones.

## Probar en la laptop sin publicar
Doble clic en `index.html` (funciona todo excepto el modo sin internet).

## Archivos
- `index.html` – estructura de la página
- `styles.css` – diseño (modo claro y oscuro automático)
- `app.js` – toda la lógica
- `sw.js` – permite usarla sin internet
- `lib/exceljs.min.js` – librería para crear los archivos Excel (licencia MIT, ver `lib/exceljs-LICENSE.txt`)
- `manifest.webmanifest`, `icons/` – para instalarla como app
