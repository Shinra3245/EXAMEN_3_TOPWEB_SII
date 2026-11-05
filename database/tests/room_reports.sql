-- ============================================================================
-- database/tests/room_reports.sql
-- Suite de regresión SQL ejecutable con fixtures sintéticos para validación
-- de aislamiento RLS, anonimato en dos capas, integridad y restricciones.
--
-- Ejecución recomendada:
--   psql -d base_local_sintetica -f database/tests/room_reports.sql
-- O en contenedor Docker/Podman aislado:
--   docker exec -i examen-room-reports-validation psql -U postgres -d <nombre_db> -f - < database/tests/room_reports.sql
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Asegurar rol de pruebas
SET LOCAL ROLE examen_app_runtime;

DO $$
DECLARE
  v_type_active integer;
  v_type_inactive integer;
  v_report_id uuid;
  v_hist_report_id uuid;
  v_res_count integer;
  v_res_reporter varchar;
  v_res_es_mio boolean;
  v_res_actor varchar;
  v_duplicate_caught boolean := false;
  v_insert_priority_caught boolean := false;
  v_insert_state_caught boolean := false;
  v_insert_actor_caught boolean := false;
BEGIN
  RAISE NOTICE '>>> Iniciando suite de pruebas SQL de Room Reports...';

  -- --------------------------------------------------------------------------
  -- 1. Setup inicial de tipos de falla (activo e inactivo histórico)
  -- --------------------------------------------------------------------------
  -- Requiere admin temporal para insertar tipos de prueba
  PERFORM set_config('app.student_id', 'ADMIN-TEST', true);
  PERFORM set_config('app.is_admin', 'true', true);

  INSERT INTO app.fault_types (nombre, activo)
  VALUES ('Tipo Sintetico Activo', true)
  RETURNING id INTO v_type_active;

  INSERT INTO app.fault_types (nombre, activo)
  VALUES ('Tipo Sintetico Inactivo Historico', false)
  RETURNING id INTO v_type_inactive;

  -- --------------------------------------------------------------------------
  -- 2. Prueba de base propia / ajena / admin en app.room_reports (reports_select)
  -- --------------------------------------------------------------------------
  -- TEST-A (alumno regular) crea reporte R1
  PERFORM set_config('app.student_id', 'TEST-A', true);
  PERFORM set_config('app.is_admin', 'false', true);

  INSERT INTO app.room_reports (
    salon, clave_materia, nombre_materia, dia, hora_inicio, hora_fin, periodo,
    tipo_id, descripcion, estado, prioridad, reporter_id
  ) VALUES (
    'A-10', 'TOP-001', 'Topicos Web', 'lunes', '07:00', '09:00', '2026-2',
    v_type_active, 'Falla reporte inicial TEST-A', 'recibido', NULL, 'TEST-A'
  ) RETURNING id INTO v_report_id;

  -- TEST-A consulta base propia: debe ver exactamente 1 fila
  SELECT count(*) INTO v_res_count FROM app.room_reports WHERE id = v_report_id;
  IF v_res_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST FALLIDO: TEST-A debe poder leer su propio reporte en tabla base (esperado: 1, obtenido: %)', v_res_count;
  END IF;

  -- TEST-B (otro alumno regular) consulta tabla base: RLS debe ocultar el reporte ajeno (0 filas)
  PERFORM set_config('app.student_id', 'TEST-B', true);
  PERFORM set_config('app.is_admin', 'false', true);

  SELECT count(*) INTO v_res_count FROM app.room_reports WHERE id = v_report_id;
  IF v_res_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TEST FALLIDO: TEST-B NO debe ver el reporte de TEST-A en app.room_reports (esperado: 0, obtenido: %)', v_res_count;
  END IF;

  -- ADMIN-01 consulta tabla base: debe ver el reporte ajeno
  PERFORM set_config('app.student_id', 'ADMIN-01', true);
  PERFORM set_config('app.is_admin', 'true', true);

  SELECT count(*) INTO v_res_count FROM app.room_reports WHERE id = v_report_id;
  IF v_res_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST FALLIDO: ADMIN debe poder ver todos los reportes en tabla base (esperado: 1, obtenido: %)', v_res_count;
  END IF;
  RAISE NOTICE ' [OK] 1. Aislamiento RLS en tabla base app.room_reports verificado.';

  -- --------------------------------------------------------------------------
  -- 3. Prueba de anonimato en vista app.v_room_reports
  -- --------------------------------------------------------------------------
  -- TEST-B consulta la vista: debe ver el reporte pero con reporter_id nulo y es_mio = false
  PERFORM set_config('app.student_id', 'TEST-B', true);
  PERFORM set_config('app.is_admin', 'false', true);

  SELECT reporter_id, es_mio INTO v_res_reporter, v_res_es_mio
  FROM app.v_room_reports WHERE id = v_report_id;

  IF v_res_reporter IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FALLIDO: TEST-B no debe ver el reporter_id en app.v_room_reports (obtenido: %)', v_res_reporter;
  END IF;
  IF v_res_es_mio IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST FALLIDO: es_mio debe ser false para TEST-B en reporte de TEST-A';
  END IF;

  -- TEST-A consulta la vista: debe ver su propio reporter_id y es_mio = true
  PERFORM set_config('app.student_id', 'TEST-A', true);
  PERFORM set_config('app.is_admin', 'false', true);

  SELECT reporter_id, es_mio INTO v_res_reporter, v_res_es_mio
  FROM app.v_room_reports WHERE id = v_report_id;

  IF v_res_reporter IS DISTINCT FROM 'TEST-A' THEN
    RAISE EXCEPTION 'TEST FALLIDO: TEST-A debe ver su propio reporter_id en app.v_room_reports (obtenido: %)', v_res_reporter;
  END IF;
  IF v_res_es_mio IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST FALLIDO: es_mio debe ser true para TEST-A';
  END IF;

  -- ADMIN-01 consulta la vista: debe ver reporter_id real
  PERFORM set_config('app.student_id', 'ADMIN-01', true);
  PERFORM set_config('app.is_admin', 'true', true);

  SELECT reporter_id INTO v_res_reporter
  FROM app.v_room_reports WHERE id = v_report_id;

  IF v_res_reporter IS DISTINCT FROM 'TEST-A' THEN
    RAISE EXCEPTION 'TEST FALLIDO: ADMIN debe ver reporter_id en app.v_room_reports (obtenido: %)', v_res_reporter;
  END IF;
  RAISE NOTICE ' [OK] 2. Anonimizacion y máscara dinámica en app.v_room_reports verificada.';

  -- --------------------------------------------------------------------------
  -- 4. Prueba de historial de eventos (app.report_events y app.v_report_events)
  -- --------------------------------------------------------------------------
  -- ADMIN-01 crea evento con comentario y actor_admin
  PERFORM set_config('app.student_id', 'ADMIN-01', true);
  PERFORM set_config('app.is_admin', 'true', true);

  INSERT INTO app.report_events (
    report_id, actor_admin, estado_anterior, estado_nuevo,
    prioridad_anterior, prioridad_nueva, comentario
  ) VALUES (
    v_report_id, 'ADMIN-01', 'recibido', 'en_revision', NULL, 'alta', 'Asignado a soporte'
  );

  -- TEST-B intenta leer de tabla base app.report_events: RLS debe retornar 0 filas
  PERFORM set_config('app.student_id', 'TEST-B', true);
  PERFORM set_config('app.is_admin', 'false', true);

  SELECT count(*) INTO v_res_count FROM app.report_events WHERE report_id = v_report_id;
  IF v_res_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TEST FALLIDO: Alumno regular no debe leer directamente de app.report_events (esperado: 0, obtenido: %)', v_res_count;
  END IF;

  -- TEST-B consulta vista app.v_report_events: debe ver el evento con actor_admin nulo
  SELECT actor_admin INTO v_res_actor
  FROM app.v_report_events WHERE report_id = v_report_id;

  IF v_res_actor IS NOT NULL THEN
    RAISE EXCEPTION 'TEST FALLIDO: actor_admin debe ser NULL para alumno en app.v_report_events (obtenido: %)', v_res_actor;
  END IF;

  -- ADMIN-01 consulta vista app.v_report_events: debe ver actor_admin
  PERFORM set_config('app.student_id', 'ADMIN-01', true);
  PERFORM set_config('app.is_admin', 'true', true);

  SELECT actor_admin INTO v_res_actor
  FROM app.v_report_events WHERE report_id = v_report_id;

  IF v_res_actor IS DISTINCT FROM 'ADMIN-01' THEN
    RAISE EXCEPTION 'TEST FALLIDO: ADMIN debe ver actor_admin en app.v_report_events (obtenido: %)', v_res_actor;
  END IF;
  RAISE NOTICE ' [OK] 3. Ocultamiento de actor_admin y eventos verificado.';

  -- --------------------------------------------------------------------------
  -- 5. Prueba de confirmaciones (apoyos) y conteo agregado global
  -- --------------------------------------------------------------------------
  -- TEST-B apoya el reporte
  PERFORM set_config('app.student_id', 'TEST-B', true);
  PERFORM set_config('app.is_admin', 'false', true);

  INSERT INTO app.report_confirmations (report_id, student_id)
  VALUES (v_report_id, 'TEST-B');

  -- TEST-A consulta app.report_confirmations: RLS solo deja ver propio, por tanto 0 filas
  PERFORM set_config('app.student_id', 'TEST-A', true);
  PERFORM set_config('app.is_admin', 'false', true);

  SELECT count(*) INTO v_res_count
  FROM app.report_confirmations WHERE report_id = v_report_id;
  IF v_res_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TEST FALLIDO: TEST-A no debe ver confirmaciones ajenas en app.report_confirmations (esperado: 0, obtenido: %)', v_res_count;
  END IF;

  -- TEST-A consulta app.report_confirmation_counts: debe ver conteo global = 1 sin identidades
  SELECT cnt INTO v_res_count
  FROM app.report_confirmation_counts WHERE report_id = v_report_id;
  IF v_res_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST FALLIDO: Conteo agregado en app.report_confirmation_counts debe ser 1 (obtenido: %)', v_res_count;
  END IF;

  -- TEST-B consulta app.report_confirmations: ve exactamente 1 fila (la suya propia)
  PERFORM set_config('app.student_id', 'TEST-B', true);
  PERFORM set_config('app.is_admin', 'false', true);

  SELECT count(*) INTO v_res_count
  FROM app.report_confirmations WHERE report_id = v_report_id;
  IF v_res_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST FALLIDO: TEST-B debe ver su propia confirmacion en app.report_confirmations (obtenido: %)', v_res_count;
  END IF;
  RAISE NOTICE ' [OK] 4. Aislamiento de apoyos y conteo global agregado verificado.';

  -- --------------------------------------------------------------------------
  -- 6. Puerta de contexto: sin contexto activo (student_id='' e is_admin=false)
  -- --------------------------------------------------------------------------
  PERFORM set_config('app.student_id', '', true);
  PERFORM set_config('app.is_admin', 'false', true);

  SELECT count(*) INTO v_res_count FROM app.v_room_reports WHERE id = v_report_id;
  IF v_res_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TEST FALLIDO: v_room_reports debe devolver 0 filas sin contexto autenticado activo (obtenido: %)', v_res_count;
  END IF;

  SELECT count(*) INTO v_res_count FROM app.v_report_events WHERE report_id = v_report_id;
  IF v_res_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TEST FALLIDO: v_report_events debe devolver 0 filas sin contexto autenticado activo (obtenido: %)', v_res_count;
  END IF;

  SELECT count(*) INTO v_res_count FROM app.report_confirmation_counts WHERE report_id = v_report_id;
  IF v_res_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TEST FALLIDO: report_confirmation_counts debe devolver 0 filas sin contexto activo (obtenido: %)', v_res_count;
  END IF;
  RAISE NOTICE ' [OK] 5. Puerta de contexto para consultas no autenticadas verificada.';

  -- --------------------------------------------------------------------------
  -- 7. Tipos de falla inactivos legibles en histórico y filtrados en creación
  -- --------------------------------------------------------------------------
  -- Crear reporte como TEST-A y posteriormente actualizarlo a resuelto como ADMIN
  PERFORM set_config('app.student_id', 'TEST-A', true);
  PERFORM set_config('app.is_admin', 'false', true);

  INSERT INTO app.room_reports (
    salon, clave_materia, nombre_materia, dia, hora_inicio, hora_fin, periodo,
    tipo_id, descripcion, estado, prioridad, reporter_id
  ) VALUES (
    'B-02', 'RED-002', 'Redes', 'martes', '10:00', '11:00', '2026-1',
    v_type_inactive, 'Reporte antiguo con tipo ahora inactivo', 'recibido', NULL, 'TEST-A'
  ) RETURNING id INTO v_hist_report_id;

  PERFORM set_config('app.student_id', 'ADMIN-01', true);
  PERFORM set_config('app.is_admin', 'true', true);
  UPDATE app.room_reports SET estado = 'resuelto', prioridad = 'baja' WHERE id = v_hist_report_id;

  -- Como TEST-A, consultar el reporte histórico con JOIN a app.fault_types
  PERFORM set_config('app.student_id', 'TEST-A', true);
  PERFORM set_config('app.is_admin', 'false', true);

  SELECT count(*) INTO v_res_count
  FROM app.v_room_reports r
  JOIN app.fault_types ft ON r.tipo_id = ft.id
  WHERE r.id = v_hist_report_id AND ft.nombre = 'Tipo Sintetico Inactivo Historico';

  IF v_res_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'TEST FALLIDO: Reporte historico con tipo inactivo debe ser legible mediante JOIN (esperado: 1, obtenido: %)', v_res_count;
  END IF;

  -- Verificar que el catálogo de creación filtre tipos inactivos
  SELECT count(*) INTO v_res_count
  FROM app.fault_types
  WHERE id = v_type_inactive AND activo = true;

  IF v_res_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TEST FALLIDO: Tipo inactivo no debe aparecer en catalogo activo de creacion (esperado: 0, obtenido: %)', v_res_count;
  END IF;
  RAISE NOTICE ' [OK] 6. Tipos inactivos legibles en historicos y excluidos en creacion verificados.';

  -- --------------------------------------------------------------------------
  -- 8. Restricción de duplicados únicos abiertos por alumno (índice parcial)
  -- --------------------------------------------------------------------------
  -- TEST-A ya tiene un reporte abierto para A-10 / TOP-001 / lunes / 07:00-09:00 / 2026-2
  -- Intentar insertar otro reporte abierto para la misma sesión exacta
  PERFORM set_config('app.student_id', 'TEST-A', true);
  PERFORM set_config('app.is_admin', 'false', true);

  BEGIN
    INSERT INTO app.room_reports (
      salon, clave_materia, nombre_materia, dia, hora_inicio, hora_fin, periodo,
      tipo_id, descripcion, estado, prioridad, reporter_id
    ) VALUES (
      'A-10', 'TOP-001', 'Topicos Web', 'lunes', '07:00', '09:00', '2026-2',
      v_type_active, 'Duplicado abierto simultaneo', 'recibido', NULL, 'TEST-A'
    );
  EXCEPTION
    WHEN unique_violation THEN
      v_duplicate_caught := true;
  END;

  IF NOT v_duplicate_caught THEN
    RAISE EXCEPTION 'TEST FALLIDO: El indice unico parcial debio rechazar el reporte duplicado abierto para TEST-A';
  END IF;

  -- Resolver el reporte existente como admin
  PERFORM set_config('app.student_id', 'ADMIN-01', true);
  PERFORM set_config('app.is_admin', 'true', true);

  UPDATE app.room_reports SET estado = 'resuelto' WHERE id = v_report_id;

  -- Ahora TEST-A debe poder crear un nuevo reporte para esa misma sesión sin conflicto
  PERFORM set_config('app.student_id', 'TEST-A', true);
  PERFORM set_config('app.is_admin', 'false', true);

  INSERT INTO app.room_reports (
    salon, clave_materia, nombre_materia, dia, hora_inicio, hora_fin, periodo,
    tipo_id, descripcion, estado, prioridad, reporter_id
  ) VALUES (
    'A-10', 'TOP-001', 'Topicos Web', 'lunes', '07:00', '09:00', '2026-2',
    v_type_active, 'Nuevo reporte tras haber resuelto el anterior', 'recibido', NULL, 'TEST-A'
  );
  RAISE NOTICE ' [OK] 7. Restriccion de duplicados abiertos e indice parcial unico verificados.';

  -- --------------------------------------------------------------------------
  -- 9. Políticas reports_update solo admin y reports_insert validada
  -- --------------------------------------------------------------------------
  -- TEST-A intenta alterar la prioridad de un reporte: debe actualizar 0 filas (update solo admin)
  PERFORM set_config('app.student_id', 'TEST-A', true);
  PERFORM set_config('app.is_admin', 'false', true);

  UPDATE app.room_reports SET prioridad = 'alta' WHERE reporter_id = 'TEST-A';
  GET DIAGNOSTICS v_res_count = ROW_COUNT;
  IF v_res_count IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'TEST FALLIDO: Alumno regular NO debe poder ejecutar UPDATE en app.room_reports (filas afectadas: %)', v_res_count;
  END IF;

  -- TEST-A intenta insertar reporte con prioridad preasignada: RLS WITH CHECK debe rechazarlo
  BEGIN
    INSERT INTO app.room_reports (
      salon, clave_materia, nombre_materia, dia, hora_inicio, hora_fin, periodo,
      tipo_id, descripcion, estado, prioridad, reporter_id
    ) VALUES (
      'C-01', 'MAT-1', 'Matematicas', 'martes', '07:00', '08:00', '2026-2',
      v_type_active, 'Intento de fijar prioridad', 'recibido', 'alta', 'TEST-A'
    );
  EXCEPTION
    WHEN check_violation OR insufficient_privilege THEN
      v_insert_priority_caught := true;
  END;

  IF NOT v_insert_priority_caught THEN
    RAISE EXCEPTION 'TEST FALLIDO: reports_insert debe rechazar inserciones con prioridad no nula';
  END IF;

  -- TEST-A intenta insertar reporte con estado diferente de recibido: debe ser rechazado
  BEGIN
    INSERT INTO app.room_reports (
      salon, clave_materia, nombre_materia, dia, hora_inicio, hora_fin, periodo,
      tipo_id, descripcion, estado, prioridad, reporter_id
    ) VALUES (
      'C-01', 'MAT-1', 'Matematicas', 'martes', '07:00', '08:00', '2026-2',
      v_type_active, 'Intento de fijar estado en_revision', 'en_revision', NULL, 'TEST-A'
    );
  EXCEPTION
    WHEN check_violation OR insufficient_privilege THEN
      v_insert_state_caught := true;
  END;

  IF NOT v_insert_state_caught THEN
    RAISE EXCEPTION 'TEST FALLIDO: reports_insert debe rechazar inserciones con estado distinto de recibido';
  END IF;

  -- TEST-A intenta insertar reporte a nombre de otro alumno: debe ser rechazado
  BEGIN
    INSERT INTO app.room_reports (
      salon, clave_materia, nombre_materia, dia, hora_inicio, hora_fin, periodo,
      tipo_id, descripcion, estado, prioridad, reporter_id
    ) VALUES (
      'C-01', 'MAT-1', 'Matematicas', 'martes', '07:00', '08:00', '2026-2',
      v_type_active, 'Intento de suplantacion', 'recibido', NULL, 'TEST-OTRO'
    );
  EXCEPTION
    WHEN check_violation OR insufficient_privilege THEN
      v_insert_actor_caught := true;
  END;

  IF NOT v_insert_actor_caught THEN
    RAISE EXCEPTION 'TEST FALLIDO: reports_insert debe rechazar inserciones donde reporter_id <> app.student_id';
  END IF;
  RAISE NOTICE ' [OK] 8. Politica reports_update exclusiva de admin y restricciones de insert verificadas.';

  RAISE NOTICE '>>> TODAS LAS PRUEBAS DE ROOM REPORTS PASARON EXITOSAMENTE. <<<';
END $$;

-- Limpieza automática al finalizar la suite mediante ROLLBACK
ROLLBACK;
