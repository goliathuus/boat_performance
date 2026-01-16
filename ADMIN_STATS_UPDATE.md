# 📊 Mise à jour : Statistiques dans l'interface admin

## ✅ Changements implémentés

J'ai ajouté des statistiques détaillées pour chaque session dans l'interface admin. Maintenant, quand vous cliquez sur **"View"** pour un événement, vous verrez pour chaque session :

- 📊 **Nombre de points de télémétrie** (avec formatage des milliers)
- 🚤 **Nom du bateau** (si disponible)
- 🎨 **Badges visuels colorés** pour une meilleure lisibilité

## 🚀 Comment appliquer

### Étape 1 : Exécuter le script SQL dans Supabase

1. Ouvrez votre console Supabase : https://app.supabase.com
2. Allez dans **SQL Editor**
3. Ouvrez et exécutez le fichier : `supabase-admin-sessions-stats.sql`
4. Vérifiez que la fonction est créée (la requête de vérification s'affiche à la fin)

### Étape 2 : Les fichiers TypeScript sont déjà modifiés ✅

Les fichiers suivants ont été mis à jour automatiquement :

- ✅ `src/domain/types.ts` - Type `AdminSession` étendu
- ✅ `src/lib/supabase-admin.ts` - Fonction `getEventSessions` avec statistiques
- ✅ `src/components/admin/EventDetailModal.tsx` - Affichage des stats
- ✅ `database.types.ts` - Définition de la nouvelle fonction RPC

### Étape 3 : Tester

1. Redémarrez votre serveur de dev si nécessaire
2. Connectez-vous en tant qu'admin
3. Cliquez sur **"View"** pour un événement
4. Vous devriez maintenant voir :
   - Le nombre de points de télémétrie pour chaque session
   - Le nom du bateau si disponible
   - Des badges colorés visuels

## 📁 Fichiers modifiés

```
✅ supabase-admin-sessions-stats.sql (NOUVEAU - à exécuter dans Supabase)
✅ src/domain/types.ts
✅ src/lib/supabase-admin.ts
✅ src/components/admin/EventDetailModal.tsx
✅ database.types.ts
```

## 🎯 Résultat attendu

### Avant :
```
Session Name
Started: Jan 14, 2026, 10:00 AM
Ended: Jan 14, 2026, 11:30 AM
Boat ID: abc-123
```

### Après :
```
Session Name
Started: Jan 14, 2026, 10:00 AM
Ended: Jan 14, 2026, 11:30 AM
Boat: Optimist Red
Data points: 1,234

📊 1,234 points    🚤 Optimist Red
```

## 🔧 Fallback automatique

Si la fonction SQL n'est pas encore exécutée, le code utilisera automatiquement l'ancienne version sans statistiques (pas d'erreur, juste pas de stats affichées).

## 📝 Notes

- La fonction SQL utilise `SECURITY DEFINER` et vérifie que l'utilisateur est admin
- Les statistiques sont calculées avec un `LEFT JOIN` donc même les sessions sans données s'affichent
- Le nom du bateau vient de la table `boats` via une jointure

