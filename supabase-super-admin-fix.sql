-- =============================================
-- Correction : Permettre aux super admins de supprimer tous les événements
-- =============================================

-- ============================================
-- ÉTAPE 1 : Vérifier que la fonction is_super_admin() existe
-- ============================================
-- Si elle n'existe pas, la créer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'is_super_admin' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE FUNCTION public.is_super_admin()
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    STABLE
    AS $func$
    BEGIN
      RETURN EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid() AND role = 'super_admin'
      );
    END;
    $func$;
  END IF;
END $$;

-- ============================================
-- ÉTAPE 2 : Supprimer les anciennes policies restrictives pour DELETE
-- ============================================
DROP POLICY IF EXISTS "Admins can delete their own events" ON public.events;
DROP POLICY IF EXISTS "events_delete_admin" ON public.events;

-- ============================================
-- ÉTAPE 3 : Créer les nouvelles policies DELETE avec priorité pour super_admin
-- ============================================

-- Policy 1 : Super admins peuvent supprimer TOUS les événements (priorité)
DROP POLICY IF EXISTS "Super admins can delete all events" ON public.events;
CREATE POLICY "Super admins can delete all events"
ON public.events FOR DELETE
TO authenticated
USING (is_super_admin());

-- Policy 2 : Admins peuvent supprimer leurs propres événements
DROP POLICY IF EXISTS "Admins can delete their own events" ON public.events;
CREATE POLICY "Admins can delete their own events"
ON public.events FOR DELETE
TO authenticated
USING (is_admin() AND admin_user_id = auth.uid());

-- ============================================
-- ÉTAPE 4 : Vérifier et modifier la fonction RPC admin_delete_event si nécessaire
-- ============================================
-- Cette fonction peut avoir des vérifications internes qui bloquent la suppression
-- On va créer une nouvelle version qui permet aux super admins de supprimer tous les événements

CREATE OR REPLACE FUNCTION admin_delete_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_super_admin boolean;
  v_is_admin boolean;
  v_event_admin_id uuid;
BEGIN
  -- Vérifier si l'utilisateur est super_admin
  v_is_super_admin := is_super_admin();
  
  -- Vérifier si l'utilisateur est admin
  v_is_admin := is_admin();
  
  -- Si ni super_admin ni admin, refuser
  IF NOT v_is_super_admin AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin or super admin role required';
  END IF;
  
  -- Récupérer l'admin_user_id de l'événement
  SELECT admin_user_id INTO v_event_admin_id
  FROM events
  WHERE id = p_event_id;
  
  -- Si l'événement n'existe pas
  IF v_event_admin_id IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;
  
  -- Si super_admin, permettre la suppression de tous les événements
  -- Sinon, vérifier que l'admin est le propriétaire
  IF NOT v_is_super_admin AND v_event_admin_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: You can only delete your own events';
  END IF;
  
  -- Supprimer l'événement
  DELETE FROM events WHERE id = p_event_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION admin_delete_event(uuid) TO authenticated;

-- ============================================
-- ÉTAPE 5 : Faire de même pour UPDATE
-- ============================================

-- Supprimer les anciennes policies UPDATE restrictives
DROP POLICY IF EXISTS "Admins can update their own events" ON public.events;
DROP POLICY IF EXISTS "events_update_admin" ON public.events;

-- Policy 1 : Super admins peuvent mettre à jour TOUS les événements
DROP POLICY IF EXISTS "Super admins can update all events" ON public.events;
CREATE POLICY "Super admins can update all events"
ON public.events FOR UPDATE
TO authenticated
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- Policy 2 : Admins peuvent mettre à jour leurs propres événements
DROP POLICY IF EXISTS "Admins can update their own events" ON public.events;
CREATE POLICY "Admins can update their own events"
ON public.events FOR UPDATE
TO authenticated
USING (is_admin() AND admin_user_id = auth.uid())
WITH CHECK (is_admin() AND admin_user_id = auth.uid());

-- ============================================
-- VÉRIFICATIONS
-- ============================================

-- Vérification 1 : Lister les policies DELETE pour events
SELECT 
  policyname,
  cmd as command,
  qual as using_expression
FROM pg_policies
WHERE tablename = 'events' AND cmd = 'DELETE'
ORDER BY policyname;

-- Vérification 2 : Vérifier que la fonction admin_delete_event existe
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'admin_delete_event';

-- Vérification 3 : Tester is_super_admin() pour un utilisateur (remplacer USER_ID)
-- SELECT is_super_admin() as is_super_admin_test;

