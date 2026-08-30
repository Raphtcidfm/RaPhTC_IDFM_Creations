# RaPhTC_IDFM Créations — V7

## Nouveautés V7
- Les créations, comptes et demandes sont stockés dans PostgreSQL au lieu de `data/db.json`.
- Les créations survivent aux redéploiements du site.
- Panel admin avec statistiques : comptes, admins, créations et demandes en attente.
- Gestion des administrateurs : créer/promouvoir un admin, retirer le rôle admin et changer son mot de passe.
- Modification d’une création existante sans la supprimer.
- Ajout/suppression d’images pendant la modification.
- Les détails d’une création restent compatibles avec la galerie V6.
- Les sessions de connexion utilisent aussi PostgreSQL.

## Installation sur Render
1. Crée un **Render Postgres** dans la même région que ton Web Service.
2. Dans le Postgres, copie son **Internal Database URL**.
3. Dans ton Web Service > Environment, ajoute `DATABASE_URL` avec cette valeur.
4. Garde `SESSION_SECRET` et tes variables `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PSEUDO`.
5. Tu peux ajouter `ADMIN2_EMAIL`, `ADMIN2_PASSWORD`, `ADMIN2_PSEUDO` etc., mais la V7 permet surtout de gérer les admins depuis le panel.
6. Remplace les fichiers du dépôt par ceux de cette V7 **sans toucher au dossier `.git`**.
7. Commit/push avec GitHub Desktop : `Installer V7`. Render fera le déploiement automatiquement.

## Important sur le stockage Render
La V7 utilise PostgreSQL pour que les données ne dépendent plus du disque temporaire du Web Service. Les images sont enregistrées dans PostgreSQL.

Sur Render, le Postgres Free actuel est limité à 1 Go et expire après 30 jours. Pour conserver le site à long terme sans interruption de base, il faudra passer la base à un plan payant avant son expiration.

## Variables
`DATABASE_URL` est obligatoire pour la V7. Ne mets jamais ton mot de passe PostgreSQL dans GitHub.
