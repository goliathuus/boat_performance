# Configuration des Rôles Admin/User

## Vue d'ensemble

Le système utilise maintenant des rôles basés sur `app_metadata` dans Supabase Auth :
- **Admin** : Peut créer, gérer et supprimer des events et sessions
- **User** : Peut uniquement participer aux events et voir ses propres sessions

## Comment assigner le rôle Admin à un utilisateur

### Méthode 1 : Via le Dashboard Supabase (Recommandé)

1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet
3. Naviguez vers **Authentication** → **Users** dans le menu de gauche
4. Cliquez sur l'utilisateur auquel vous voulez donner le rôle admin
5. Dans la section **User Metadata**, trouvez **App Metadata**
6. Cliquez sur **Edit** et ajoutez/modifiez le JSON suivant :

```json
{
  "role": "admin"
}
```

7. Cliquez sur **Save**

### Méthode 2 : Via l'Admin API (Pour automatisation)

Si vous avez besoin d'automatiser l'assignation de rôles, utilisez l'Admin API côté serveur :

```typescript
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ⚠️ Jamais côté client !
);

// Assigner le rôle admin
await supabaseAdmin.auth.admin.updateUserById(
  userId,
  { app_metadata: { role: 'admin' } }
);

// Retirer le rôle admin (devient user par défaut)
await supabaseAdmin.auth.admin.updateUserById(
  userId,
  { app_metadata: { role: 'user' } }
);
```

### Méthode 3 : Via SQL (Avancé)

⚠️ **Note** : Cette méthode nécessite l'accès direct à la base de données. Utilisez plutôt le Dashboard ou l'Admin API.

```sql
-- Cette méthode n'est pas recommandée car elle nécessite
-- de modifier directement la table auth.users
-- Utilisez plutôt le Dashboard Supabase ou l'Admin API
```

## Vérifier le rôle d'un utilisateur

### Côté client (TypeScript)

```typescript
import { supabase } from '@/lib/supabase';
import { isUserAdmin } from '@/lib/supabase-admin';

const adminStatus = await isUserAdmin();
console.log('Is admin:', adminStatus);
```

### Côté SQL

```sql
-- Vérifier le rôle dans le JWT (dans une fonction RPC)
SELECT (auth.jwt() -> 'app_metadata' ->> 'role') as user_role;
```

## Sécurité

- **`app_metadata`** est modifiable uniquement par :
  - Les administrateurs Supabase (via Dashboard)
  - L'Admin API avec la `service_role_key`
  - **PAS** par l'utilisateur lui-même

- **`user_metadata`** peut être modifié par l'utilisateur, donc ne l'utilisez **PAS** pour les rôles

- Les policies RLS vérifient automatiquement le rôle via la fonction `is_admin()`

## Migration depuis l'ancien système

Si vous aviez des utilisateurs qui étaient "admin" parce qu'ils avaient créé des events, vous devez maintenant leur assigner explicitement le rôle admin via le Dashboard Supabase.

Pour trouver les utilisateurs qui étaient admin :

```sql
SELECT DISTINCT admin_user_id 
FROM events;
```

Ensuite, assignez le rôle admin à ces utilisateurs via le Dashboard.

