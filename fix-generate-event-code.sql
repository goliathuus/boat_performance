-- Script de nettoyage pour résoudre le conflit de fonction generate_event_code()
-- Exécutez ce script AVANT de réexécuter supabase-admin-functions.sql
-- 
-- Ce script supprime toutes les versions de generate_event_code() dans tous les schémas

-- Méthode 1: Supprimer toutes les versions trouvées
DO $$
DECLARE
  r RECORD;
  drop_cmd TEXT;
BEGIN
  -- Trouver et supprimer toutes les fonctions generate_event_code
  FOR r IN 
    SELECT 
      n.nspname as schema_name,
      p.proname as func_name,
      p.oid as func_oid,
      pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'generate_event_code'
  LOOP
    drop_cmd := format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', 
      r.schema_name, r.func_name, COALESCE(r.args, ''));
    RAISE NOTICE 'Dropping: %', drop_cmd;
    EXECUTE drop_cmd;
  END LOOP;
  
  IF NOT FOUND THEN
    RAISE NOTICE 'No generate_event_code functions found to drop';
  ELSE
    RAISE NOTICE 'All generate_event_code functions dropped successfully';
  END IF;
END $$;

-- Vérifier qu'il n'en reste plus
SELECT 
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname = 'generate_event_code';

-- Si la requête ci-dessus retourne des résultats, il reste des fonctions
-- Sinon, vous pouvez maintenant exécuter supabase-admin-functions.sql

