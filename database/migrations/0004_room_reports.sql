-- Migración 0004: Reportes de fallas en aulas y catálogo de soporte
-- Esquema app con Row Level Security forzada basada en app.student_id y app.is_admin

-- 1. Catálogo de tipos de falla
CREATE TABLE app.fault_types (
  id serial PRIMARY KEY,
  nombre varchar(100) NOT NULL UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Semilla de 6 tipos iniciales
INSERT INTO app.fault_types (nombre, activo) VALUES
  ('Proyector', true),
  ('Aire acondicionado', true),
  ('Contactos eléctricos', true),
  ('Mobiliario', true),
  ('Conectividad', true),
  ('Otro', true);

ALTER TABLE app.fault_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.fault_types FORCE ROW LEVEL SECURITY;

-- Corrección 1: Tipos de falla legibles para cualquier usuario autenticado
-- para preservar histórico en reportes pasados; el catálogo de creación filtra activo = true.
CREATE POLICY fault_types_select ON app.fault_types
  FOR SELECT
  TO examen_app_runtime
  USING (
    coalesce(current_setting('app.student_id', true), '') <> ''
    OR current_setting('app.is_admin', true) = 'true'
  );

CREATE POLICY fault_types_insert ON app.fault_types
  FOR INSERT
  TO examen_app_runtime
  WITH CHECK (current_setting('app.is_admin', true) = 'true');

CREATE POLICY fault_types_update ON app.fault_types
  FOR UPDATE
  TO examen_app_runtime
  USING (current_setting('app.is_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_admin', true) = 'true');

REVOKE ALL ON app.fault_types FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON app.fault_types TO examen_app_runtime;
GRANT USAGE, SELECT ON SEQUENCE app.fault_types_id_seq TO examen_app_runtime;

-- 2. Reportes de fallas en aulas
CREATE TABLE app.room_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  salon varchar(50) NOT NULL CHECK (char_length(trim(salon)) > 0),
  clave_materia varchar(50) NOT NULL CHECK (char_length(trim(clave_materia)) > 0),
  nombre_materia varchar(200) NOT NULL CHECK (char_length(trim(nombre_materia)) > 0),
  dia varchar(20) NOT NULL CHECK (dia IN ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado')),
  hora_inicio varchar(10) NOT NULL CHECK (hora_inicio ~ '^[0-2][0-9]:[0-5][0-9]$'),
  hora_fin varchar(10) NOT NULL CHECK (hora_fin ~ '^[0-2][0-9]:[0-5][0-9]$'),
  periodo varchar(50) NOT NULL CHECK (char_length(trim(periodo)) > 0),
  tipo_id integer NOT NULL REFERENCES app.fault_types(id),
  descripcion varchar(500) NOT NULL CHECK (char_length(trim(descripcion)) > 0 AND char_length(descripcion) <= 500),
  estado varchar(20) NOT NULL DEFAULT 'recibido' CHECK (estado IN ('recibido', 'en_revision', 'resuelto', 'cerrado', 'descartado')),
  prioridad varchar(10) NULL CHECK (prioridad IS NULL OR prioridad IN ('baja', 'media', 'alta')),
  reporter_id varchar(64) NOT NULL CHECK (char_length(trim(reporter_id)) > 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_room_reports_salon ON app.room_reports (salon);
CREATE INDEX idx_room_reports_estado ON app.room_reports (estado);
CREATE INDEX idx_room_reports_periodo ON app.room_reports (periodo);
CREATE INDEX idx_room_reports_reporter ON app.room_reports (reporter_id);

-- Corrección 3: Limitar reportes duplicados abiertos por alumno para la misma sesión (atómico)
CREATE UNIQUE INDEX uq_room_reports_open_session_reporter
  ON app.room_reports (reporter_id, salon, clave_materia, dia, hora_inicio, hora_fin, periodo)
  WHERE estado IN ('recibido', 'en_revision');

ALTER TABLE app.room_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.room_reports FORCE ROW LEVEL SECURITY;

-- Corrección: En tabla base solo lectura de reportes propios o admin.
-- Los reportes ajenos anonimizados se consultan a través de la vista app.v_room_reports.
CREATE POLICY reports_select ON app.room_reports
  FOR SELECT
  TO examen_app_runtime
  USING (
    reporter_id = current_setting('app.student_id', true)
    OR current_setting('app.is_admin', true) = 'true'
  );

-- reports_insert exige actor y valores iniciales controlados (recibido y prioridad null)
CREATE POLICY reports_insert ON app.room_reports
  FOR INSERT
  TO examen_app_runtime
  WITH CHECK (
    reporter_id = current_setting('app.student_id', true)
    AND estado = 'recibido'
    AND prioridad IS NULL
  );

-- reports_update exclusivo para administradores (los alumnos no pueden editar reportes)
CREATE POLICY reports_update ON app.room_reports
  FOR UPDATE
  TO examen_app_runtime
  USING (current_setting('app.is_admin', true) = 'true')
  WITH CHECK (current_setting('app.is_admin', true) = 'true');

-- reports_delete permite retiro del autor exclusivamente en estado recibido (o admin)
CREATE POLICY reports_delete ON app.room_reports
  FOR DELETE
  TO examen_app_runtime
  USING (
    (reporter_id = current_setting('app.student_id', true) AND estado = 'recibido')
    OR current_setting('app.is_admin', true) = 'true'
  );

REVOKE ALL ON app.room_reports FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.room_reports TO examen_app_runtime;

-- 3. Confirmaciones de fallas por alumnos ("también me pasa")
CREATE TABLE app.report_confirmations (
  report_id uuid NOT NULL REFERENCES app.room_reports(id) ON DELETE CASCADE,
  student_id varchar(64) NOT NULL CHECK (char_length(trim(student_id)) > 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, student_id)
);

CREATE INDEX idx_confirmations_student ON app.report_confirmations (student_id);

ALTER TABLE app.report_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.report_confirmations FORCE ROW LEVEL SECURITY;

-- Aislamiento estricto de confirmaciones: un alumno solo consulta la propia; admin consulta todas.
CREATE POLICY confirmations_select ON app.report_confirmations
  FOR SELECT
  TO examen_app_runtime
  USING (
    student_id = current_setting('app.student_id', true)
    OR current_setting('app.is_admin', true) = 'true'
  );

CREATE POLICY confirmations_insert ON app.report_confirmations
  FOR INSERT
  TO examen_app_runtime
  WITH CHECK (
    student_id = current_setting('app.student_id', true)
  );

CREATE POLICY confirmations_delete ON app.report_confirmations
  FOR DELETE
  TO examen_app_runtime
  USING (
    student_id = current_setting('app.student_id', true)
    OR current_setting('app.is_admin', true) = 'true'
  );

REVOKE ALL ON app.report_confirmations FROM PUBLIC;
GRANT SELECT, INSERT, DELETE ON app.report_confirmations TO examen_app_runtime;

-- Agregación segura de conteos de apoyos sin exponer student_id con puerta de contexto
CREATE OR REPLACE FUNCTION app.get_report_confirmation_counts()
RETURNS TABLE(report_id uuid, cnt integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = app, pg_temp
AS $$
  SELECT c.report_id, count(*)::integer AS cnt
  FROM app.report_confirmations c
  WHERE
    coalesce(current_setting('app.student_id', true), '') <> ''
    OR current_setting('app.is_admin', true) = 'true'
  GROUP BY c.report_id;
$$;

REVOKE ALL ON FUNCTION app.get_report_confirmation_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_report_confirmation_counts() TO examen_app_runtime;

CREATE VIEW app.report_confirmation_counts
WITH (security_barrier = true)
AS
  SELECT report_id, cnt
  FROM app.get_report_confirmation_counts()
  WHERE
    coalesce(current_setting('app.student_id', true), '') <> ''
    OR current_setting('app.is_admin', true) = 'true';

REVOKE ALL ON app.report_confirmation_counts FROM PUBLIC;
GRANT SELECT ON app.report_confirmation_counts TO examen_app_runtime;

-- 4. Historial de eventos y transiciones de estado/prioridad
CREATE TABLE app.report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES app.room_reports(id) ON DELETE CASCADE,
  actor_admin varchar(64) NOT NULL CHECK (char_length(trim(actor_admin)) > 0),
  estado_anterior varchar(20) NULL CHECK (estado_anterior IS NULL OR estado_anterior IN ('recibido', 'en_revision', 'resuelto', 'cerrado', 'descartado')),
  estado_nuevo varchar(20) NOT NULL CHECK (estado_nuevo IN ('recibido', 'en_revision', 'resuelto', 'cerrado', 'descartado')),
  prioridad_anterior varchar(10) NULL CHECK (prioridad_anterior IS NULL OR prioridad_anterior IN ('baja', 'media', 'alta')),
  prioridad_nueva varchar(10) NULL CHECK (prioridad_nueva IS NULL OR prioridad_nueva IN ('baja', 'media', 'alta')),
  comentario varchar(1000) NOT NULL CHECK (char_length(trim(comentario)) > 0 AND char_length(comentario) <= 1000),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_report_events_report ON app.report_events (report_id);

ALTER TABLE app.report_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.report_events FORCE ROW LEVEL SECURITY;

-- Solo administradores pueden seleccionar directamente de la tabla base report_events.
-- Los alumnos consultan el historial a través de app.v_report_events (que anonimiza actor_admin).
CREATE POLICY events_select ON app.report_events
  FOR SELECT
  TO examen_app_runtime
  USING (
    current_setting('app.is_admin', true) = 'true'
  );

CREATE POLICY events_insert ON app.report_events
  FOR INSERT
  TO examen_app_runtime
  WITH CHECK (
    current_setting('app.is_admin', true) = 'true'
    AND actor_admin = current_setting('app.student_id', true)
  );

REVOKE ALL ON app.report_events FROM PUBLIC;
GRANT SELECT (id, report_id, estado_anterior, estado_nuevo, prioridad_anterior, prioridad_nueva, comentario, creado_en)
  ON app.report_events TO examen_app_runtime;
GRANT INSERT ON app.report_events TO examen_app_runtime;

-- 5. Vistas seguras para anonimato en dos capas con puerta de contexto obligatoria

-- Vista para reportes: enmascara reporter_id para terceros, expone es_mio y exige contexto activo
CREATE VIEW app.v_room_reports
WITH (security_barrier = true)
AS
  SELECT
    r.id,
    r.salon,
    r.clave_materia,
    r.nombre_materia,
    r.dia,
    r.hora_inicio,
    r.hora_fin,
    r.periodo,
    r.tipo_id,
    r.descripcion,
    r.estado,
    r.prioridad,
    CASE
      WHEN current_setting('app.is_admin', true) = 'true' THEN r.reporter_id
      WHEN r.reporter_id = current_setting('app.student_id', true) THEN r.reporter_id
      ELSE NULL
    END AS reporter_id,
    (r.reporter_id = current_setting('app.student_id', true)) AS es_mio,
    r.creado_en,
    r.actualizado_en
  FROM app.room_reports r
  WHERE
    coalesce(current_setting('app.student_id', true), '') <> ''
    OR current_setting('app.is_admin', true) = 'true';

REVOKE ALL ON app.v_room_reports FROM PUBLIC;
GRANT SELECT ON app.v_room_reports TO examen_app_runtime;

-- Vista para eventos: oculta actor_admin a alumnos regulares y exige contexto activo
CREATE VIEW app.v_report_events
WITH (security_barrier = true)
AS
  SELECT
    e.id,
    e.report_id,
    CASE
      WHEN current_setting('app.is_admin', true) = 'true' THEN e.actor_admin
      ELSE NULL
    END AS actor_admin,
    e.estado_anterior,
    e.estado_nuevo,
    e.prioridad_anterior,
    e.prioridad_nueva,
    e.comentario,
    e.creado_en
  FROM app.report_events e
  WHERE
    coalesce(current_setting('app.student_id', true), '') <> ''
    OR current_setting('app.is_admin', true) = 'true';

REVOKE ALL ON app.v_report_events FROM PUBLIC;
GRANT SELECT ON app.v_report_events TO examen_app_runtime;
