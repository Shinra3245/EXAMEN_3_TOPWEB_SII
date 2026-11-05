# Portal académico SII

Backend Next.js 16.4.5, React 19.3.1 y TypeScript para Cloudflare Workers mediante OpenNext 1.20.16. Toda comunicación con el SII, incluido el login, ocurre en el servidor. La página raíz es un marcador técnico; todavía no contiene la interfaz de la aplicación.

Piloto técnico: https://examen3-sii.shinra3245.workers.dev

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
| `GET /api/student` | `/api/movil/estudiante` → perfil permitido. |
| `GET /api/grades` | `/api/movil/estudiante/calificaciones` → periodos/materias/evaluaciones permitidas. |
| `GET /api/kardex` | `/api/movil/estudiante/kardex` → historial por intento. |
| `GET /api/schedule` | `/api/movil/estudiante/horarios` → materias y cadenas de días. |

Los tipos de datos de salida están en `src/types/normalizers.ts`. Los cinco GET de sesión/recursos requieren cookie; no aceptan tokens enviados por el frontend. Respuestas 400 indican entrada inválida, 401 sesión ausente/inválida/expirada, 403 origen o acceso denegado, 502 respuesta institucional inválida/error, 503 configuración ausente y 504 timeout institucional.

## Sesión y límites

El token se obtiene exclusivamente de `message.login.token` y se valida consultando el perfil institucional antes de emitir la cookie. La cookie `sii_session` es cifrada y autenticada, `HttpOnly`, `SameSite=Lax`, `Secure` en HTTPS/producción y dura como máximo una hora sin superar `exp` institucional. No se inventa vigencia si el JWT no tiene una expiración válida. Las contraseñas solo se usan durante el login; no se persisten. La sesión es stateless: logout elimina la cookie local, pero una copia sustraída no tiene revocación centralizada y conserva su vigencia máxima. Rotar la clave del servidor invalida todas las cookies existentes.

Entrada de login limitada a 16 KiB; respuesta institucional limitada a 1 MiB durante lectura; timeout activo hasta finalizar esa lectura. Solo se permiten cinco rutas institucionales y se rechazan redirecciones. No hay memoria global con datos de estudiantes, reenvío de cuerpos crudos ni cacheado de respuestas privadas.

## Mapeo institucional pendiente

Se proyectan únicamente campos confirmados. No se devuelven objetos `unknown` ni claves arbitrarias. El perfil exige `numero_control`; `semestre` ausente se representa como `null`. En calificaciones, `resultadoFinal` y los metadatos de periodo siguen `null` hasta confirmar su semántica; no se calcula un promedio ni se toma la última evaluación como final. Se conserva `calificacion` solo en una colección de evaluaciones inequívoca. En kardex se conservan intentos repetidos, cadenas y nulos. Los horarios conservan días como `string | null`, sin inferir aulas/docentes o parsear horas todavía.

Las pruebas automatizadas usan datos sintéticos y no acreditan el flujo autenticado real. La validación autenticada de la aplicación requiere introducir credenciales propias de forma privada y verificar los recursos en el entorno publicado. No se incluye todavía persistencia de la funcionalidad adicional.

## Cloudflare y CI

`wrangler.jsonc` declara únicamente Worker y assets estáticos; no solicita KV, R2, Durable Objects ni optimización de imágenes. La aplicación usa `nodejs_compat`. Las cuotas y el consumo real se deben revisar antes de considerar validado el uso en Free: [límites oficiales de Workers](https://developers.cloudflare.com/workers/platform/limits/).

GitHub Actions ejecuta las comprobaciones y el build adaptado en PR y main. El despliegue automático está preparado pero deshabilitado hasta configurar `CLOUDFLARE_API_TOKEN` como secreto limitado a la cuenta/Worker y `CLOUDFLARE_ACCOUNT_ID` y `CLOUDFLARE_WORKER_URL` como variables, y habilitar `CLOUDFLARE_DEPLOY_ENABLED=true`. `SESSION_SECRET` se configura en el Worker y nunca se incorpora al bundle. Se puede seguir desplegando con la sesión local de Wrangler mientras se completa esa conexión: [configuración oficial de GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

## PostgreSQL de servidor

`src/lib/db.ts` usa pg y TLS con verificación de certificado, un cliente por operación y cierre en finally. `DATABASE_URL` es secreto exclusivo del Worker: poolerSupabase en6543, usuario del proyecto; sin prepared statements nombrados. No hay ORM ni tablas del adicional. Usar `withDatabase` para operaciones parametrizadas del módulo de datos.

POST /api/internal/database-check es diagnóstico de mantenimiento: requiere Bearer DATABASE_CHECK_TOKEN privado y DATABASE_CHECK_EXPIRES_AT Unix vigente, máximo30min. Deshabilitado devuelve404; sin configuraciónDB503. Ejecuta lectura y escritura temporal con rollback, devuelve solo booleans. No acredita persistencia ni reglas del adicional. Retirar token después del ensayo. Nunca configurar credenciales por Git o logs ni consultar esta ruta desde la UI.

En Workers se utiliza el binding `HYPERDRIVE` del proyecto del examen. Hyperdrive verifica TLS con el origen Supabase (`verify-full`, CA pública de Supabase), caché desactivada y límite de5conexiones. La conexión interna administrada se obtiene del binding; no se aplica el validador de URI externa a ese transporte. DATABASE_URL queda como alternativa para desarrollo local Node. No registrar connectionString del binding.
