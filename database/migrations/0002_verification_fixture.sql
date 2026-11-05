-- Tabla exclusivamente técnica de comprobación; la siguiente migración la retira.
CREATE TABLE app._verification_records (
  run_id uuid NOT NULL,
  record_id text NOT NULL,
  owner_control text NOT NULL CHECK (owner_control IN ('TEST-A','TEST-B')),
  payload text NOT NULL CHECK (payload IN ('synthetic-A','synthetic-B','synthetic-rollback')),
  PRIMARY KEY (run_id,record_id)
);
ALTER TABLE app._verification_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE app._verification_records FORCE ROW LEVEL SECURITY;
CREATE POLICY verification_owner ON app._verification_records
  TO examen_app_runtime
  USING (owner_control = current_setting('app.student_id',true))
  WITH CHECK (owner_control = current_setting('app.student_id',true));
REVOKE ALL ON app._verification_records FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON app._verification_records TO examen_app_runtime;
