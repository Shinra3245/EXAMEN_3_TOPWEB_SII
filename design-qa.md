# Revisión visual: pixel retro claro

## Referencias y capturas

- Fuente principal del mosaico: `/home/andresmonjaras/Descargas/User attachment.png` (1983 × 793 px). Es el recurso visual elegido para la franja superior; se revisó junto con las capturas del login.
- Composición del login: captura Pixel Gallery clara enviada en la conversación. La referencia no se copia al repositorio.
- Capturas de implementación: `/tmp/login-desktop-final.png`, `/tmp/login-mobile-final.png`, `/tmp/reportes-desktop-final.png`, `/tmp/reportes-mobile-final.png`, `/tmp/admin-reportes-desktop-final.png`, `/tmp/admin-dialog-final.png`, `/tmp/admin-tipos-desktop-final.png` y `/tmp/horario-dialog-final.png`.
- Navegador: Firefox con Playwright, `deviceScaleFactor: 1`. Escritorio 1440 × 960 CSS px y móvil 390 × 844 CSS px. Las imágenes de página completa conservan esos píxeles; Reportes móvil mide 390 × 1053 px por el contenido vertical, dentro de un viewport de 390 × 844 px.
- Se compararon en una misma revisión visual la fuente del mosaico, el login y las pantallas de Reportes. Las pantallas de reportes no tienen un mockup separado; trasladan el estilo del login y conservan los campos existentes.

## Hallazgos y correcciones

- **P2, corregido — contraste de campos del login.** La primera captura tenía texto de ejemplo y texto del botón deshabilitado con contraste menor al recomendado. Se oscurecieron ambos colores y se volvió a capturar móvil y escritorio. Contraste final: placeholder 5.28:1, acción deshabilitada 5.83:1, enlace 5.24:1, texto principal 13.52:1 y acción amarilla 8.74:1.
- **P2, corregido — filtro “Solo mis reportes”.** En la primera captura, el checkbox quedaba separado arriba del texto. Se alinearon en una fila y se verificó el resultado a 360 px y 390 px.
- **Sin hallazgos P0, P1 o P2 pendientes.** El indicador flotante de Next.js quedó desactivado solo en desarrollo para que no cubra la vista local.

## Superficies de fidelidad

- **Tipografía:** VT323 se usa para el contenido y Press Start 2P para títulos breves. Los campos, controles, filtros y estados siguen legibles; las etiquetas auxiliares son más pequeñas para conservar jerarquía.
- **Espaciado y distribución:** el mosaico ocupa la franja superior; login y Juanito comparten el espacio sin encimarse. En móvil el login cabe en 360 × 800, 390 × 844 y escritorio 1440 × 960 sin scroll. Las tarjetas y filtros de reportes se apilan; las tablas conservan su desplazamiento propio.
- **Color y contraste:** azul nube y blanco como base, azul oscuro para texto, azul cielo para controles y amarillo para las acciones principales. Los estados de reporte mantienen texto además de color.
- **Imágenes:** la cuadrícula del mosaico conserva sus cuadros nítidos, se integra con un desvanecido hacia el fondo y se recorta como franja superior. Juanito usa el sprite pixelado de ocho cuadros existente; no se sustituyeron imágenes por dibujos CSS.
- **Texto y contenido:** los títulos, etiquetas, acciones y mensajes se mantienen en español y corresponden al flujo institucional existente.
- **Iconos y accesibilidad:** los controles siguen siendo elementos HTML etiquetados. Se comprobó foco visible, foco inicial y retorno del foco en diálogos, ciclo Tab/Shift+Tab, cierre con Escape y respeto de movimiento reducido.

## Estados e interacciones revisados

- Capturas de `/reportes`, `/admin/reportes`, `/admin/tipos` y del diálogo de reporte desde Horario.
- Menú móvil visible y navegable. A 360 y 390 px no hay desbordamiento horizontal general.
- Estados de carga, vacío y error de `ResourceState` revisados con respuestas sintéticas.
- El diálogo administrativo inicia el foco en Estado; Tab y Shift+Tab recorren el diálogo, Escape lo cierra y devuelve el foco al botón de apertura. Escape también cierra el diálogo de Horario.
- Se verificó que una sesión sintética sin permisos no muestre enlaces administrativos y reciba el aviso de acceso restringido al abrir esa ruta.
- No hubo errores de página ni de consola en la pasada final. Los recursos de fuente respondieron correctamente.

Las respuestas de API, identidades y reportes usados para estas capturas son ficticios y se interceptaron en el navegador. No se usaron credenciales SII ni se probó persistencia, Supabase, Hyperdrive o producción.

final result: passed
