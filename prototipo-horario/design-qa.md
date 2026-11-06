# Revisión visual del prototipo de horario

final result: passed

## Evidencia

- Fuente visual: `/home/andresmonjaras/Descargas/WhatsApp Image 2026-11-04 at 12.35.04 PM.jpeg` (1600 × 887 px).
- Captura final: `evidencia/horario-escritorio-1600x900.png` (1600 × 900 px; viewport CSS 1600 × 900; device scale factor 1).
- Comparación completa: `evidencia/comparacion-completa.jpg`.
- Comparación del panel de filtros: `evidencia/comparacion-filtros.jpg`.
- Estado: datos ficticios; periodo Agosto-Diciembre 2026 · 26/2 2026 seleccionado; seis días visibles; filtros vacíos.
- La fuente se comparó al mismo ancho. Se añadieron 13 px blancos al borde inferior porque la imagen original mide 887 px de alto; no se deformó ni se reescaló.

## Hallazgos

- No quedan diferencias visuales P0, P1 o P2 que bloqueen el prototipo.
- Diferencias intencionales según la solicitud: se quitaron “Today Class” y “Level”; se cambió la marca por “Portal académico”; se añadió el nombre y número de control de ejemplo; el calendario se amplió de lunes a sábado; el panel lateral ahora contiene fechas, materia, día, periodo y el botón “Actualizar horario”.
- Los datos del alumno, materias, salones e identificadores son ficticios. El prototipo no consulta el SII.

## Comparación e iteraciones

1. La primera captura mostró que las tarjetas avanzaban 64 px por hora mientras la cuadrícula usaba 42 px. Se sincronizó `ALTURA_POR_HORA` con `--hour-height`; la captura final confirma que la clase de las 08:00 empieza una fila después de las 07:00 y que las marcas llegan hasta las 19:00.
2. La primera captura mostró fechas nativas con formato `mm/dd/yyyy` por la configuración del navegador. Se cambiaron por campos de texto con formato explícito `dd/mm/aaaa` y validación de calendario.
3. La comparación final completa y la comparación del panel muestran el diseño fuente y la implementación lado a lado. Los cambios de contenido y estructura indicados arriba corresponden a lo pedido.

## Superficies revisadas

- **Tipografía:** Arial y jerarquía sans serif de bajo contraste visual, cercana a la interfaz de referencia. La letra de las tarjetas es compacta porque también se muestran ID, salón, fechas y periodo; queda como refinamiento P3 si se prefiere más espacio y letra mayor.
- **Espaciado y distribución:** calendario semanal principal con filtros a la derecha en escritorio; en pantallas estrechas, el calendario conserva sus seis columnas y se desplaza horizontalmente sin desbordar toda la página.
- **Colores:** fondo gris azulado claro, paneles blancos, azul para acciones y tonos pastel distintos para las materias.
- **Imágenes y marcas:** no se copiaron el logo ni el avatar de la referencia. La marca solicitada es texto y no se agregaron imágenes de identidad ficticias.
- **Texto:** etiquetas en español, días de lunes a sábado, fecha `dd/mm/aaaa`, materia, número/ID, salón y el periodo de ejemplo pedido.

## Interacción probada

- Playwright con Firefox, viewport 1600 × 900 y locale `es-MX`.
- 11 clases de ejemplo en el periodo actual y seis encabezados de día.
- Filtro de sábado: una clase; filtro de Bases de datos: dos clases.
- Filtro del periodo 26/1 2026 y rango de enero a junio: tres clases.
- Validación de fecha inexistente y de fecha inicial posterior a la fecha final.
- Viewport móvil de 390 × 844: sin desbordamiento horizontal de la página; el calendario tiene desplazamiento horizontal.
- Errores de consola y errores de ejecución: ninguno.

## Lista final

- [x] HTML, CSS y JavaScript separados.
- [x] “Today Class” y “Level” eliminados.
- [x] Filtros y botón para actualizar el horario.
- [x] Horario de lunes a sábado.
- [x] Datos ficticios y sin conexión al backend.
- [x] Vista local e interacciones verificadas.
