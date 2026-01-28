# Guide de déploiement sur Vercel

## Configuration des variables d'environnement

Pour que l'application fonctionne sur Vercel, vous devez configurer les variables d'environnement Supabase.

### Étape 1 : Obtenir vos credentials Supabase

1. Allez sur https://app.supabase.com
2. Sélectionnez votre projet
3. Allez dans **Settings** → **API**
4. Copiez :
   - **Project URL** (c'est votre `VITE_SUPABASE_URL`)
   - **anon public** key (c'est votre `VITE_SUPABASE_ANON_KEY`)

### Étape 2 : Configurer dans Vercel

1. Allez sur https://vercel.com
2. Sélectionnez votre projet
3. Allez dans **Settings** → **Environment Variables**
4. Ajoutez les deux variables suivantes :

   | Name | Value |
   |------|-------|
   | `VITE_SUPABASE_URL` | `https://votre-projet.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | `votre-clé-anon-ici` |

5. **IMPORTANT** : Sélectionnez les environnements où ces variables doivent être disponibles :
   - ✅ **Production**
   - ✅ **Preview** (optionnel mais recommandé)
   - ✅ **Development** (optionnel)

6. Cliquez sur **Save**

### Étape 3 : Redéployer

Après avoir ajouté les variables d'environnement :

1. Allez dans **Deployments**
2. Cliquez sur le menu **⋯** du dernier déploiement
3. Sélectionnez **Redeploy**
4. Ou simplement faites un nouveau push sur votre repo

### Vérification

Une fois redéployé, l'application devrait fonctionner. Si vous voyez encore l'erreur :

1. Vérifiez que les variables sont bien configurées dans Vercel
2. Vérifiez que le déploiement a bien utilisé les nouvelles variables (regardez les logs de build)
3. Ouvrez la console du navigateur (F12) pour voir les erreurs détaillées

## Structure des fichiers

- `vercel.json` : Configuration du routing SPA (toutes les routes → index.html)
- `vite.config.ts` : Configuration Vite avec base path pour Vercel
- `src/lib/supabase.ts` : Client Supabase avec gestion d'erreur améliorée

## Dépannage

### L'écran est toujours blanc

1. Vérifiez les logs de build dans Vercel
2. Ouvrez la console du navigateur (F12) pour voir les erreurs JavaScript
3. Vérifiez que les variables d'environnement sont bien définies dans Vercel

### Les variables ne sont pas prises en compte

- Les variables d'environnement doivent commencer par `VITE_` pour être accessibles côté client
- Redéployez après avoir ajouté/modifié les variables
- Vérifiez que vous avez sélectionné l'environnement correct (Production/Preview)








