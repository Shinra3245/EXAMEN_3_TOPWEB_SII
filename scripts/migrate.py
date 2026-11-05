#!/usr/bin/env python3
"""Migraciones administrativas del proyecto del examen. Sin --apply solo muestra el plan."""
import argparse, hashlib, json, re, subprocess, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PROJECT='fegczgleshuzgymtqrkv'
def migration_sql(name,body):
    if not re.fullmatch(r'\d{4}_[a-z0-9_]+\.sql',name):raise ValueError('Nombre de migración inválido')
    checksum=hashlib.sha256(body.encode()).hexdigest()
    marker='$body_'+checksum[:12]+'$'
    return f"""BEGIN;
SELECT pg_advisory_xact_lock(hashtext('examen3-sii-migrations'));
CREATE SCHEMA IF NOT EXISTS app_meta AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA app_meta FROM PUBLIC;
CREATE TABLE IF NOT EXISTS app_meta.migrations(version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
REVOKE ALL ON app_meta.migrations FROM PUBLIC;
DO $migration$
BEGIN
 IF EXISTS (SELECT 1 FROM app_meta.migrations WHERE version='{name}') THEN
  IF NOT EXISTS (SELECT 1 FROM app_meta.migrations WHERE version='{name}' AND checksum='{checksum}') THEN
   RAISE EXCEPTION 'MIGRATION_CHECKSUM_MISMATCH';
  END IF;
 ELSE
  EXECUTE {marker}{body}{marker};
  INSERT INTO app_meta.migrations(version,checksum) VALUES ('{name}','{checksum}');
 END IF;
END $migration$;
COMMIT;
SELECT version,checksum FROM app_meta.migrations WHERE version='{name}';"""
def execute_sql(sql):
    with tempfile.NamedTemporaryFile(mode='w',suffix='.sql',delete=False) as f:
        f.write(sql);path=Path(f.name)
    try:
        result=subprocess.run(['npm','exec','--yes','--package=supabase@2.122.0','--','supabase','db','query','--linked','--project-ref',PROJECT,'--file',str(path),'--output','json'],cwd=ROOT,capture_output=True,text=True)
        if result.returncode:
            if 'MIGRATION_CHECKSUM_MISMATCH' in result.stdout+result.stderr:raise RuntimeError('MIGRATION_CHECKSUM_MISMATCH')
            raise RuntimeError('Operación SQL rechazada; revisar el estado administrativo sin publicar contenidos privados')
        return json.loads(result.stdout[result.stdout.index('{'):])
    finally:path.unlink(missing_ok=True)
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--apply',action='store_true');p.add_argument('--through',required=True,help='Versión explícita, por ejemplo 0002');a=p.parse_args()
    if not re.fullmatch(r'\d{4}',a.through):raise SystemExit('Versión inválida')
    files=sorted(f for f in (ROOT/'database/migrations').glob('*.sql') if f.name[:4]<=a.through)
    if not files or files[-1].name[:4]!=a.through:raise SystemExit('Versión no encontrada')
    for f in files:
        body=f.read_text();digest=hashlib.sha256(body.encode()).hexdigest()
        if a.apply:execute_sql(migration_sql(f.name,body))
        print(json.dumps({'migration':f.name,'checksum':digest,'appliedOrVerified':a.apply}))
if __name__=='__main__':main()
