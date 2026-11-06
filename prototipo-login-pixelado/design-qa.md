# Revisión visual del login pixelado

## Referencia y capturas

- Fuente visual: capturas de cielo, islas y casitas adjuntas por el usuario en el chat; no hay copia local de esos adjuntos.
- Captura de escritorio: `evidencia/login-desktop.png`, 1440 × 1200 CSS px, densidad 1, vista Login vacía.
- Vista de referencia: `evidencia/login-referencia-750x669.png`, 750 × 669 CSS px, densidad 1, vista Login vacía.
- Móvil: `evidencia/login-mobile.png`, 390 × 844 CSS px, densidad 1; página desplazable.
- Móvil completo: `evidencia/login-mobile-full.png`, 390 × 1200 CSS px, densidad 1, incluye el lince bajo el formulario.
- Ajuste sin desplazamiento: `evidencia/login-fit-1365x768.png` en escritorio y `evidencia/login-fit-390x844.png` en móvil.
- Las capturas de implementación se revisaron a pantalla completa. La zona de arte superior también se inspeccionó dentro de esa composición; no se necesitó un recorte adicional.

## Hallazgos y cambios

1. Las cascadas forman una franja irregular de píxeles azules y azul marino, con picos de distintos largos. Cada pico pierde cuadros a los lados al bajar y termina en una punta estrecha; algunos píxeles se desprenden alrededor.
2. La isla principal tiene una casa y un faro separados; el haz del faro los diferencia visualmente.
3. El login oscuro no armonizaba con las referencias claras. Se cambió a fondo azul nube, campos blancos, texto azul oscuro y acentos amarillos cálidos.
4. El lince ahora usa un sprite transparente de ocho fotogramas para alternar escritura y movimiento de cola. Se compararon capturas en dos momentos y el personaje cambia de pose. La animación se detiene con `prefers-reduced-motion`.

## Revisión de fidelidad

- **Tipografía:** se mantienen VT323 para el contenido y Press Start 2P para el título, como en el prototipo existente.
- **Composición:** el arte ocupa la franja superior; una casa y un faro con haz de luz se ven separados sobre la isla central, mientras una franja pixelada de picos desiguales se desmorona a lo ancho. El formulario conserva su espacio y el lince queda a la derecha en escritorio, debajo en móvil.
- **Color:** cielo azul claro, nubes blancas y rosadas, cascadas azul/cian, vegetación verde y fachadas cálidas. El formulario utiliza el mismo fondo azul nube.
- **Calidad visual:** los cuadrados de 14,4 px mantienen separación y esquinas suaves; las fachadas tienen siluetas legibles y las puntas de las cascadas reducen la cantidad de cuadros en cada nivel descendente.
- **Contenido:** Login, Signup, Reset y el texto del formulario conservan el contenido original.
- **Animación:** se compararon capturas con distintos tiempos y cambiaron 7.533 píxeles, confirmando el avance del sprite.
- **Interacciones:** no se volvió a probar el formulario; su lógica no cambió. No se ejecutó una suite de pruebas.

No quedan hallazgos visuales P0, P1 o P2 en las capturas revisadas.

final result: passed
