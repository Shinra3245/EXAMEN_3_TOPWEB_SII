# Portal académico SII

Backend Next.js 16.4.5, React 19.3.1 y TypeScript para Cloudflare Workers mediante OpenNext 1.20.16. Toda comunicación con el SII, incluido el login, ocurre en el servidor. Interfaz funcional neutra con inicio de sesión, dashboard, calificaciones, kardex, horario y reportes de fallas en aulas. El estilo visual final se incorpora por separado. El módulo de reportes requiere aplicar la migración 0004 antes de habilitarse en el entorno publicado.

Piloto técnico: https://examen3-sii.shinra3245.workers.dev

## Arquitectura

```
┌────────────────────┐
│     NAVEGADOR      │   Pantallas: login, dashboard, calificaciones,
│  (React + Next.js) │   kardex, horario, reportes, admin
└─────────┬──────────┘
          │  petición + cookie sii_session (cifrada)
          ▼
┌──────────────────────────────────────────────────┐
│        CLOUDFLARE WORKER (backend propio)        │
│                                                  │
│   worker.ts ─► ¿/api?  ─► router.ts ─► handler   │
│                  │                               │
│                  └─ no ─► Next.js (las páginas)  │
│                                                  │
│   Aquí se cifra y descifra la sesión (AES-GCM)   │
└─────────┬─────────────────────────┬──────────────┘
          │ Bearer + JWT            │ Hyperdrive
          ▼                         ▼
┌────────────────────┐    ┌──────────────────────┐
│    API DEL SII     │    │  SUPABASE (Postgres) │
│ emite el JWT y     │    │ solo lo propio:      │
│ tiene los datos    │    │ reportes de aulas y  │
│ académicos         │    │ contadores de login  │
└────────────────────┘    └──────────────────────┘
```

El navegador solo habla con el Worker. El token del SII nunca llega al navegador: vive cifrado dentro de la cookie `sii_session`. Los datos académicos se consultan al SII en cada visita y no se almacenan; la base solo guarda los reportes de aulas y los contadores de intentos de login.

### Compilación y despliegue

Todo el código se escribe en TypeScript y se compila a JavaScript, que es lo único que ejecuta Cloudflare.

```
 TypeScript + React (.tsx)            TypeScript del backend (.ts)
 src/app, src/components              src/worker.ts, src/server, src/lib
          │                                       │
          ▼                                       │
 npm run build:cloudflare                         │
 ┌──────────────────────────┐                     │
 │ next build (Next.js)     │ compila las         │
 │          +               │ pantallas a JS/CSS  │
 │ OpenNext                 │ y las adapta a      │
 │ (@opennextjs/cloudflare) │ Cloudflare          │
 └────────────┬─────────────┘                     │
              ▼                                   │
        carpeta .open-next/                       │
        (worker.js + assets)                      │
              │                                   │
              └─────────────────┬─────────────────┘
                                ▼
                       npm run deploy
                 ┌──────────────────────┐
                 │ Wrangler             │ compila worker.ts, lo une
                 │ (wrangler.jsonc)     │ con .open-next/ y lo sube
                 └──────────┬───────────┘
                            ▼
                 Cloudflare Worker en producción
                 (runtime V8: ejecuta solo JavaScript)
```

Next.js con OpenNext compila las pantallas y Wrangler compila el backend y publica el conjunto. En producción lo dispara GitHub Actions: al hacer merge a `main`, el workflow de validación (lint, tipos y pruebas) debe pasar y entonces el de publicación ejecuta `build:cloudflare` y `deploy`.

## Desarrollo

Se requiere Node.js 24 (CI usa 24.16.0). Instalar el lockfile con `npm ci`. Copiar `.env.example` a `.env.local` y configurar una clave `SESSION_SECRET` aleatoria de 32 bytes (64 caracteres hexadecimales). No utilizar claves de ejemplo ni reutilizar claves entre entornos. Para la vista previa de Wrangler, proporcionar las mismas variables de desarrollo mediante `.dev.vars`, siempre fuera de Git.

| Variable | Uso |
|---|---|
| `SESSION_SECRET` | Obligatoria en servidor: cifra las sesiones con AES-256-GCM. |
| `APP_ORIGIN` | Origen público canónico, sin ruta. En desarrollo, si se omite, se usa el origen de la URL de la petición. |
| `SII_BASE_URL` | Opcional; solo se acepta `https://sii.celaya.tecnm.mx`. |
| `SII_TIMEOUT_MS` | Opcional, 8000 ms por defecto; máximo 30000. Incluye lectura de respuesta. |

No definir versiones `NEXT_PUBLIC_` de estas variables. Credenciales SII, tokens, cookies, archivos de entorno y respuestas personales no deben guardarse en Git ni en logs.

| Comando | Función |
|---|---|
| `npm run dev` | Desarrollo Next.js. |
| `APP_BASE_URL=https://su-worker.workers.dev npm run test:smoke` | Pruebas HTTP sin credenciales ni sesión real; no acreditan consultas autenticadas. |
| `npm run check` | ESLint, TypeScript y pruebas Vitest. |
| `npm run build:cloudflare` | Build Next.js y adaptación a Workers. |
| `npm run preview` | Runtime local de Workers; requiere build previo. |
| `npm run deploy` | Publicación manual con Wrangler autenticado; requiere build previo y secretos configurados en el Worker. |

## Ejecución de servidor

Un único Worker publica frontend y backend. `src/worker.ts` enruta `/api/*` mediante handlers Web estándar compartidos en `src/server`; las rutas Next.js reexportan esos handlers para desarrollo local. Las demás rutas usan OpenNext. Los bindings se aíslan por petición con AsyncLocalStorage y solo en desarrollo Next se usa process.env como alternativa. El alias server-only de Wrangler se limita al bundle de servidor; Next conserva el centinela real contra importaciones cliente.

## API propia

Las respuestas privadas incluyen `Cache-Control: no-store`. Los errores usan `{ success: false, error: { code, message } }`, sin mensajes institucionales crudos ni trazas. Las mutaciones de sesión requieren `Origin` exactamente igual a `APP_ORIGIN` (o al origen de la URL en desarrollo); se ignoran cabeceras forwarded para esta validación.

| Ruta propia | Contrato / recurso institucional usado en servidor |
|---|---|
| `GET /api/health` | Diagnóstico público del servicio; no acredita disponibilidad del SII o de una base de datos. |
| `POST /api/auth/login` | JSON `{email,password}` → `/api/login` y `/api/movil/estudiante`; responde `{success:true,data:{user,expiresAt}}` y cookie privada. |
| `GET /api/auth/session` | Cookie vigente y perfil institucional válido → `{success:true,data:{authenticated:true,student,expiresAt}}`. |
| `POST /api/auth/logout` | Borra la cookie del navegador. |
| `GET /api/student/photo` | Fotografía privada: backend consulta el perfil, decodifica JPEG base64 con saltos de línea o limita origen institucional para imágenes por URL, rechaza redirecciones/SVG, limita respuesta a 2 MiB y no reenvía cabeceras privadas. |
| `GET /api/student` | `/api/movil/estudiante` → perfil permitido. |
| `GET /api/grades` | `/api/movil/estudiante/calificaciones` → periodos/materias/evaluaciones permitidas. |
| `GET /api/kardex` | `/api/movil/estudiante/kardex` → historial por intento. |
| `GET /api/schedule` | `/api/movil/estudiante/horarios` → materias y cadenas de días. |

Los tipos de datos de salida están en `src/types/normalizers.ts`. Los cinco GET de sesión/recursos requieren cookie; no aceptan tokens enviados por el frontend. Respuestas 400 indican entrada inválida, 401 sesión ausente/inválida/expirada, 403 origen o acceso denegado, 502 respuesta institucional inválida/error, 503 configuración ausente y 504 timeout institucional.

## Sesión y límites

El token se obtiene exclusivamente de `message.login.token` y se valida consultando el perfil institucional antes de emitir la cookie. La cookie `sii_session` es cifrada y autenticada, `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS/producción y dura como máximo una hora sin superar `exp` institucional. No se inventa vigencia si el JWT no tiene una expiración válida. Las contraseñas solo se usan durante el login; no se persisten. La sesión es stateless: logout elimina la cookie local, pero una copia sustraída no tiene revocación centralizada y conserva su vigencia máxima. Rotar la clave del servidor invalida todas las cookies existentes.

Entrada de login limitada a 16 KiB; respuesta institucional limitada a 1 MiB durante lectura; timeout activo hasta finalizar esa lectura. Solo se permiten cinco rutas institucionales y se rechazan redirecciones. No hay memoria global con datos de estudiantes, reenvío de cuerpos crudos ni cacheado de respuestas privadas.

## Contrato académico

Los normalizadores proyectan únicamente campos institucionales observados. Perfil incluye `persona`, identidad, semestre, foto e indicadores oficiales; indicadores vacíos o no numéricos son null, sin recalcular promedios. Periodos de calificaciones/horario usan `clave_periodo`, `anio` y `descripcion_periodo`.

Evaluaciones se obtienen de la clave literal institucional `calificaiones` y conservan `numero_calificacion`, `calificacion`, orden y nulos. Arreglos auxiliares no se interpretan como calificaciones. El equipo definió `resultadoFinal` como el promedio simple de cuatro parciales únicos numerados1..4, redondeado al entero más cercano (.5 hacia arriba). Solo calcula cuando las cuatro notas son decimales base10 válidas entre0y100 (hasta6decimales); usa aritmética decimal exacta. Faltantes, duplicados, numeración inesperada o notas inválidas dejan resultadoFinal=null y estadoFinal=pendiente con motivoFinal. Un resultado válido lleva estadoFinal/origenFinal=calculada y reglaFinal=promedio_4_parciales_redondeo_entero. Nunca sustituir una nota nula por cero, subir un promedio a70 o tomar la última evaluación como final. Es una regla de aplicación aceptada por el equipo, no una final oficial devuelta por el SII ni una comprobación de su redondeo interno. El kardex conserva su calificación oficial sin recalcularla.

Kardex conserva todos los registros recibidos e intentos repetidos, junto con porcentaje_avance oficial. No se afirma que una respuesta equivalga a historial institucional exhaustivo si el proveedor pagina o filtra sin metadatos.

Horario conserva días originales y agrega `sesiones` con dia/inicio/fin/salon desde el rango y `${dia}_clave_salon`. Se validan rangos24h HH:MM o HH:MM:00, minutos0..59 e inicio anterior a fin. Textos/rangos múltiples no confirmados se conservan y marcan en `diasNoInterpretados`; no se inventan aulas, docentes o franjas. Las pantallas deberán tratar ese estado de forma visible.

Las pruebas usan fixtures sintéticos y no acreditan por sí solas funcionamiento del SII real. La persistencia de reportes de aulas se define en la migración 0004; su validación local no acredita persistencia publicada.

## Reportes de fallas en aulas

Desde cada sesión con salón en Horario se puede reportar una falla con tipo y descripción. El backend reconsulta el horario SII y deriva salón, materia y periodo de una coincidencia institucional exacta; no confía en esos valores enviados por el cliente. Rechaza sesiones ambiguas y reportes abiertos duplicados por alumno/sesión.

`/reportes` permite filtrar el listado, apoyar reportes abiertos ajenos una vez y retirar los propios únicamente en estado recibido. Los alumnos ven todos los reportes sin identidades ajenas. Las vistas SQL enmascaran reportante y administrador; RLS limita las tablas base a datos propios o administrativos y los apoyos se cuentan mediante una función sin salida de identidades.

`/admin/reportes` administra estado, prioridad y comentario de seguimiento; `/admin/tipos` gestiona el catálogo. El resumen incluye exclusivamente totales de reportes por estado y salones con más fallas. Las rutas administrativas exigen autorización en backend. `ADMIN_NUMEROS_CONTROL` es una lista separada por comas de números de control autorizados, comparada con la identidad de la sesión cifrada; `GET /api/auth/session` devuelve `es_admin` para la navegación. Si se omite la variable, nadie obtiene administración.

| Método | Ruta | Acción |
|---|---|---|
| GET | /api/reports | Listar; filtros salon, tipo_id, estado, periodo y mine. |
| POST | /api/reports/create | Crear desde una sesión revalidada del horario. |
| POST | /api/reports/confirm | Apoyar un reporte abierto ajeno. |
| POST | /api/reports/withdraw | Retirar un reporte propio recibido. |
| GET | /api/report-types | Catálogo activo para crear reportes. |
| POST | /api/admin/reports/update | Cambiar estado/prioridad con comentario. |
| GET | /api/admin/reports/summary | Resumen de estados y salones. |
| GET | /api/admin/report-types | Catálogo completo, incluidos inactivos. |
| POST | /api/admin/report-types/save | Crear/editar/activar tipos de falla. |

Preparación del entorno: aplicar `database/migrations/0004_room_reports.sql` como propietario `postgres` después de las migraciones anteriores y configurar `ADMIN_NUMEROS_CONTROL` en el Worker. Las vistas y la función agregadora deben conservar el propietario de migración, que puede leer las tablas para producir proyecciones anónimas. No conceder sus tablas ni funciones a clientes del navegador. El rol de conexión es privado del backend, que fija identidad y administración dentro de cada transacción; estas variables no son una autenticación para clientes SQL no confiables.

La regresión `database/tests/room_reports.sql` se ejecuta mediante `psql` en una base de pruebas con las migraciones aplicadas. Utiliza únicamente fixtures sintéticos y termina con rollback. No ejecutarla contra producción.

## Endurecimiento de seguridad

- **Cabeceras globales** (`src/lib/security-headers.ts`, aplicadas en `src/worker.ts` a toda respuesta): `Content-Security-Policy` (incluye `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `Strict-Transport-Security` (solo HTTPS), `X-Content-Type-Options: nosniff`, `Referrer-Policy` y `Permissions-Policy`. No sustituyen las que una ruta ya defina, como la CSP de la foto. La política conserva `'unsafe-inline'` porque Next.js inserta código en línea para hidratar.
- **Límite de intentos de login** (`src/lib/rate-limit.ts`): 10 por minuto por IP y 5 por minuto por cuenta, evaluados antes de contactar al SII; responde `429` con `Retry-After`. Combina tres contadores y el intento solo pasa si todos lo permiten: memoria (exacto por instancia), binding de Cloudflare Rate Limiting (`ratelimits` en `wrangler.jsonc`, compartido pero aproximado) y Postgres (`app.register_login_attempt`, migración `0005`, compartido y exacto; si la base falla, no bloquea el login). Aplicar `0005` con `python3 scripts/migrate.py --through 0005 --apply`. El limitador recibe la huella SHA-256 del correo, no el correo.

## Cloudflare y CI

`wrangler.jsonc` declara únicamente Worker y assets estáticos; no solicita KV, R2, Durable Objects ni optimización de imágenes. La aplicación usa `nodejs_compat`. Las cuotas y el consumo real se deben revisar antes de considerar validado el uso en Free: [límites oficiales de Workers](https://developers.cloudflare.com/workers/platform/limits/).

GitHub Actions ejecuta las comprobaciones y el build adaptado en PR y main. El despliegue automático se encuentra habilitado mediante `CLOUDFLARE_API_TOKEN` como secreto limitado a la cuenta/Worker y `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_WORKER_URL` como variables, con `CLOUDFLARE_DEPLOY_ENABLED=true`. `SESSION_SECRET` se configura en el Worker y nunca se incorpora al bundle. También se admite despliegue manual con Wrangler autenticado: [configuración oficial de GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

## PostgreSQL de servidor

`src/lib/db.ts` usa pg y TLS con verificación de certificado, un cliente por operación y cierre en finally. En producción la conexión utiliza exclusivamente Hyperdrive y el rol restringido del proyecto. `DATABASE_URL` es una alternativa privada para Node; no se usa en el Worker publicado. No usar prepared statements nombrados. No hay ORM; las tablas de reportes usan el esquema `app`. Usar `withStudentDatabase` para operaciones del módulo con contexto transaccional de identidad y administración, y consultas parametrizadas.

POST /api/internal/database-check es diagnóstico de mantenimiento: requiere Bearer DATABASE_CHECK_TOKEN privado y DATABASE_CHECK_EXPIRES_AT Unix vigente, máximo30min. Deshabilitado devuelve404; sin configuraciónDB503. Ejecuta lectura y escritura temporal con rollback, devuelve solo booleans. No acredita persistencia ni reglas del adicional. Retirar token después del ensayo. Nunca configurar credenciales por Git o logs ni consultar esta ruta desde la UI.

En Workers se utiliza el binding `HYPERDRIVE` del proyecto del examen. Hyperdrive verifica TLS con el origen Supabase (`verify-full`, CA pública de Supabase), caché desactivada y límite de5conexiones. La conexión interna administrada se obtiene del binding; no se aplica el validador de URI externa a ese transporte. DATABASE_URL queda como alternativa para desarrollo local Node. No registrar connectionString del binding.

## Inspección del contrato institucional

POST /api/internal/sii-contract está deshabilitado por defecto. Para mantenimiento requiere una sesiónSII válida y token privado SII_CONTRACT_TOKEN con SII_CONTRACT_EXPIRES_AT Unix vigente máximo30min. Devuelve únicamente nombres técnicos de campos, tipos y categorías de formato; no valores de alumnos. Muestrea hasta8elementos por colección y no acredita completitud. No es endpoint de interfaz; retirar token tras inspección.

## Frontera de datos y migraciones

La conexión publicada de Hyperdrive usa `examen_app_runtime`, sin superusuario, BYPASSRLS, creación de bases o roles. Las migraciones requieren la sesión administrativa del propietario y nunca se ejecutan desde la UI o con el rol de aplicación. `scripts/migrate.py --through 0001` muestra el plan; añadir `--apply` ejecuta una versión explícita contra el proyecto institucional, en transacciones con bloqueo y ledger privado `app_meta.migrations`. Un checksum distinto para una versión ya aplicada se rechaza: agregar otra migración, no editar historia aplicada.

`withStudentDatabase(req, callback)` valida la cookie SII y fija la identidad solo durante una transacción mediante `set_config` parametrizado. La identidad no procede de parámetros o cuerpos del navegador. Tablas futuras deben tener ownership y políticas RLS acordes al módulo; RLS complementa autenticación/consultas parametrizadas y no protege frente a un backend comprometido con SQL arbitrario. No almacenar datos académicos como maestros locales.

Las migraciones0002/0003 crean y retiran una tabla exclusivamente técnica para validar commit/reconexión, aislamientoA/B, rechazo de escrituras ajenas y rollback con datos sintéticos. No es el modelo del adicional. El diagnóstico POST /api/internal/data-verification está deshabilitado sin DATA_VERIFY_TOKEN y DATA_VERIFY_EXPIRES_AT vigentes (máximo30min); solo acepta fases/UUID y SQL fijo, sin actores o consultas arbitrarias. Retirar secretos después de verificar.

Recuperación: la ejecución fallida revierte la transacción; conservar ledger/checksums y revisar antes de reintentar. Para futuros cambios de negocio, preparar una migración correctiva y respaldo/recuperación según el impacto; no usar resets o CASCADE sobre entrega.

## Interfaz académica y validación pública

Rutas `/login`, `/dashboard`, `/calificaciones`, `/kardex` y `/horario`. El navegador consulta únicamente `/api/*` del propio sitio; nunca contacta al SII, incluida la fotografía. La sesión viaja en cookie HttpOnly; los datos académicos se mantienen en memoria y se eliminan al cerrar o invalidar la sesión. No se guardan contraseñas, tokens ni respuestas académicas en localStorage/sessionStorage.

Calificaciones permite búsqueda y filtro de periodo; muestra los cuatro parciales, final calculada o pendiente y procedencia. Semáforo de aplicación: verde90–100, amarillo70–89, rojo<70, pendiente neutral; no es normativa institucional. Kardex conserva intentos, valores oficiales y orden original, con búsqueda/filtro/orden explícito. Horario es una lista por día y hora con filtros y franjas no interpretadas visibles. Dashboard presenta únicamente indicadores oficiales disponibles.

Para este piloto, los recorridos de aplicación se ejecutan en la URL pública; no se necesita iniciar `dev`, `start` ni `preview`. Lint, tipos, pruebas sintéticas y build se mantienen antes de publicar. `APP_BASE_URL=https://su-worker.workers.dev npm run test:browser:production` valida acceso público con Chrome instalado. El script rechaza localhost/HTTP y no inicia servidores. La opción explícita `-- --keyring-sii` permite al propietario una prueba autorizada usando credenciales ya provisionadas en Secret Service; no solicita ni registra contraseñas, cookies, cuerpos, trazas, capturas o archivos de sesión. No se ejecuta el recorrido autenticado en CI ni se delegan credenciales. Una interrupción aislada de petición en el navegador prueba el reintento; los datos mostrados después proceden del SII real.

Las pruebas unitarias usan fixtures sintéticos aislados; no sustituyen evidencia de navegación real. Capturas de entrega y estilo final pendientes.
