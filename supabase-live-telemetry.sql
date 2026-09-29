-- =====================================================================
-- Carte en direct : nouveaux points de tous les bateaux d'un evenement
-- =====================================================================
-- La page publique (lien de partage) interroge cette fonction toutes les
-- quelques secondes. Un seul appel renvoie les points de tous les bateaux,
-- pour ne pas multiplier les requetes par le nombre de bateaux.
--
-- Le curseur porte sur telemetry.created_at (heure d'arrivee en base) et
-- non sur ts (heure GPS) : un telephone qui retrouve du reseau renvoie des
-- points anciens, qu'un curseur sur ts ne verrait jamais.
--
-- Deux precautions sur ce curseur :
--   - chevauchement de 10 s : une transaction commencee avant la lecture
--     precedente mais validee apres a un created_at deja depasse. Le client
--     deduplique par (session, ts), le chevauchement est donc sans risque ;
--   - une ligne ne coupe jamais un groupe de created_at identiques (toutes
--     les lignes d'une meme transaction ont le meme now()) : la limite est
--     etendue jusqu'a la fin du groupe.
--
-- A executer dans le SQL Editor (projet yucxpbxrtruwtdqbsxeh).
-- =====================================================================

BEGIN;

CREATE INDEX IF NOT EXISTS telemetry_session_created_at
  ON public.telemetry (session_id, created_at);

-- p_continue : vrai pour la page suivante d'une reponse tronquee. Pas de
-- chevauchement dans ce cas, sinon une rafale de plus de p_limit lignes en
-- 10 s ferait relire indefiniment la meme page.
CREATE OR REPLACE FUNCTION public.public_get_event_telemetry_since(
  p_token text,
  p_since timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 20000,
  p_continue boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_overlap CONSTANT interval := interval '10 seconds';
  v_event_id uuid;
  v_from     timestamptz;
  v_cutoff   timestamptz;
  v_points   jsonb;
  v_next     timestamptz;
BEGIN
  SELECT e.id INTO v_event_id
  FROM events e
  WHERE e.share_token = p_token AND e.share_enabled = true
  LIMIT 1;

  IF v_event_id IS NULL THEN
    RETURN NULL;
  END IF;

  p_limit := LEAST(GREATEST(COALESCE(p_limit, 20000), 100), 50000);
  -- Premier appel : le client vient de charger l'historique, on ne renvoie
  -- que ce qui arrive a partir de maintenant.
  v_from := CASE WHEN p_continue AND p_since IS NOT NULL THEN p_since
                 ELSE COALESCE(p_since, now()) - c_overlap END;

  -- created_at de la derniere ligne autorisee par la limite (NULL si tout tient).
  SELECT t.created_at INTO v_cutoff
  FROM telemetry t
  JOIN sessions s ON s.id = t.session_id
  WHERE s.event_id = v_event_id AND t.created_at > v_from
  ORDER BY t.created_at
  OFFSET p_limit - 1
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'session_id', t.session_id,
           'ts', t.ts,
           'lat', t.lat,
           'lon', t.lon,
           'speed', t.speed,
           'heading', t.heading,
           'meta', t.meta
         ) ORDER BY t.created_at), '[]'::jsonb),
         max(t.created_at)
  INTO v_points, v_next
  FROM telemetry t
  JOIN sessions s ON s.id = t.session_id
  WHERE s.event_id = v_event_id
    AND t.created_at > v_from
    AND (v_cutoff IS NULL OR t.created_at <= v_cutoff);

  RETURN jsonb_build_object(
    -- Sans nouveau point, on avance quand meme : sinon le chevauchement
    -- reculerait le curseur de 10 s a chaque appel.
    'next_since', COALESCE(v_next, GREATEST(COALESCE(p_since, now()), v_from)),
    -- Vrai quand la limite a coupe : le client relance aussitot.
    'truncated', v_cutoff IS NOT NULL,
    'points', v_points
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_get_event_telemetry_since(text, timestamptz, integer, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_event_telemetry_since(text, timestamptz, integer, boolean) TO anon, authenticated;

COMMIT;
