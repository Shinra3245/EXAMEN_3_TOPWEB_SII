-- Infraestructura de aplicación: no crea tablas del adicional.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='examen_app_runtime') THEN
    RAISE EXCEPTION 'El rol ya existe: revisar procedencia antes de aplicar';
  END IF;
  CREATE ROLE examen_app_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
END $$;
CREATE SCHEMA app AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO examen_app_runtime;
GRANT CONNECT ON DATABASE postgres TO examen_app_runtime;
