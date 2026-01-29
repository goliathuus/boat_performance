# Modification : Admins peuvent voir tous les événements

## Vue d'ensemble

Cette modification permet aux utilisateurs avec le rôle admin de voir **tous les événements**, pas seulement ceux qu'ils ont créés.

## Fichiers modifiés

### 1. SQL - `supabase-admin-view-all-events.sql`

Ce fichier contient les modifications SQL à exécuter dans Supabase SQL Editor :

- **Nouvelle policy RLS** : `"Admins can view all events"` qui permet aux admins de voir tous les événements
- **Fonction `admin_get_events()`** : Modifiée pour retourner tous les événements (pas seulement ceux créés par l'admin actuel)
- **Fonction `admin_get_event_sessions_with_stats()`** : Modifiée pour permettre aux admins de voir les sessions de tous les événements

### 2. TypeScript - `src/hooks/useEvents.ts`

- Retrait du filtre `.eq('admin_user_id', user.id)` dans la requête fallback
- Les policies RLS gèrent maintenant l'accès, donc pas besoin de filtrer côté client

## Instructions d'installation

1. **Exécuter le SQL dans Supabase** :
   - Allez sur https://app.supabase.com
   - Sélectionnez votre projet
   - Naviguez vers **SQL Editor**
   - Copiez-collez le contenu de `supabase-admin-view-all-events.sql`
   - Cliquez sur **Run**

2. **Vérifier que les modifications sont appliquées** :
   - Les admins devraient maintenant voir tous les événements dans l'interface
   - Les non-admins continuent de voir uniquement leurs propres événements (grâce aux autres policies)

## Sécurité

- Les policies RLS garantissent que seuls les admins peuvent voir tous les événements
- Les non-admins continuent d'être limités à leurs propres événements
- La fonction `is_admin()` vérifie le rôle dans `app_metadata.role`

## Notes

- Les policies PERMISSIVE utilisent la logique OR, donc la nouvelle policy s'ajoute aux existantes
- Les admins peuvent maintenant voir et gérer tous les événements, pas seulement ceux qu'ils ont créés
- Cette modification ne change pas les permissions pour les opérations UPDATE/DELETE (les admins peuvent toujours seulement modifier/supprimer leurs propres événements, sauf si vous ajoutez d'autres policies)

