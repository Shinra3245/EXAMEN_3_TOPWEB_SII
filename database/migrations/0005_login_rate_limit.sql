-- Migración 0005: contador compartido de intentos de inicio de sesión.
-- Los contadores en memoria y el binding de Cloudflare son por instancia o aproximados;
-- este es exacto y común a todas las instancias del Worker.

CREATE TABLE app.login_attempts (
  bucket text NOT NULL CHECK (char_length(bucket) <= 128),
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_attempts_bucket_time_idx ON app.login_attempts (bucket, attempted_at);

-- RLS activa y sin políticas ni permisos para el rol de la aplicación:
-- solo la función de abajo (propiedad del propietario de la migración) toca la tabla.
ALTER TABLE app.login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app.login_attempts FROM PUBLIC;

-- Registra un intento si no se ha superado el límite dentro de la ventana.
-- Devuelve true si el intento está permitido y false si debe bloquearse.
-- Los intentos bloqueados no se registran, así que insistir no alarga el bloqueo.
CREATE FUNCTION app.register_login_attempt(
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, app
AS $$
DECLARE
  attempts integer;
BEGIN
  IF p_bucket IS NULL OR char_length(p_bucket) > 128
     OR p_limit < 1 OR p_limit > 1000
     OR p_window_seconds < 1 OR p_window_seconds > 3600 THEN
    RAISE EXCEPTION 'INVALID_RATE_LIMIT_ARGUMENTS';
  END IF;

  -- Serializa los intentos de una misma cubeta para que dos peticiones
  -- simultáneas no cuenten el mismo cupo.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_bucket, 0));

  -- Limpieza oportunista de lo que ya no cuenta para ninguna ventana.
  DELETE FROM app.login_attempts WHERE attempted_at < now() - interval '1 hour';

  SELECT count(*) INTO attempts
  FROM app.login_attempts
  WHERE bucket = p_bucket
    AND attempted_at > now() - make_interval(secs => p_window_seconds);

  IF attempts >= p_limit THEN
    RETURN false;
  END IF;

  INSERT INTO app.login_attempts (bucket) VALUES (p_bucket);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION app.register_login_attempt(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.register_login_attempt(text, integer, integer) TO examen_app_runtime;
