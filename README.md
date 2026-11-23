# Dashboard-house

PWA privée pour deux personnes qui partagent les courses, les routines, les quêtes, la wishlist, les voyages et l’agenda. Le projet utilise React et TypeScript pour le socle de l’interface, Vite pour le build, une API TypeScript sur Vercel et Turso pour les données. Les écrans existants gardent leurs interactions JavaScript dans `app.js`, monté après le rendu de `src/DashboardShell.tsx`. Les nouveaux écrans peuvent être écrits en React.

## Démarrer en local

Installe Node.js 24 et lance ces commandes à la racine du projet.

```sh
npm ci
cp .env.example .env.local
```

Génère trois valeurs indépendantes avec `openssl rand -hex 32` et ajoute-les dans `.env.local` pour `SESSION_SECRET`, `MEMBER_1_CODE` et `MEMBER_2_CODE`. Le premier appel à l’API locale applique les migrations sur le fichier SQLite vide défini dans l’exemple.

```sh
npm run dev
npm test
npm run build
```

`npm run preview` sert le build avec la même API locale. Utilise ce mode pour tester le service worker et l’installation de la PWA. Le serveur de développement désactive le service worker pour faciliter les modifications.

## Connecter Turso et Vercel

1. Dans Turso, crée une base vide, idéalement dans la région la plus proche de Paris, et génère un jeton autorisé à écrire sur cette base. La connexion Vercel se fait avec `TURSO_DATABASE_URL` et `TURSO_AUTH_TOKEN`. Utilise une base différente pour chaque environnement qui doit recevoir des données réelles.
2. Dans `.env.local`, renseigne temporairement l’URL distante et son jeton, puis exécute `npm run db:migrate`. La commande applique les fichiers dans `migrations/` par ordre de nom. Rétablis ensuite ton URL SQLite locale pour reprendre le développement sur une base de test.
3. Importe `Caillouu/dashboard-house` dans Vercel, à la racine du dépôt. Le fichier `vercel.json` fixe le preset Vite, la région des fonctions et le dossier de sortie. Déploie d’abord `develop` en aperçu. Dans **Settings → Environments**, configure la branche de production au moment de la bascule. Le choix recommandé est `develop` si c’est la branche que tu utilises déjà pour publier.
4. Dans **Settings → Environment Variables**, configure les cinq valeurs suivantes pour l’environnement à déployer. Garde les codes et jetons hors de GitHub et partage chaque code personnel directement à la personne concernée.

| Variable | Valeur |
| --- | --- |
| `TURSO_DATABASE_URL` | URL de la base, commençant par `libsql://` |
| `TURSO_AUTH_TOKEN` | Jeton d’écriture propre à cette base |
| `SESSION_SECRET` | Valeur aléatoire générée pour cet environnement |
| `MEMBER_1_CODE` | Code aléatoire personnel du premier membre |
| `MEMBER_2_CODE` | Code aléatoire personnel du deuxième membre |
| `CHARLIE_SKILL_SECRET` | Secret aléatoire d’au moins 32 caractères partagé uniquement avec le skill mensuel Charlie |
| `PERSON_1` et `PERSON_2` | Prénoms facultatifs qui s’affichent dans la wishlist |
| `WEATHER_LAT`, `WEATHER_LON` et `WEATHER_CITY` | Localisation facultative de la première carte météo, Paris par défaut |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` | Clés Web Push générées avec `npx web-push generate-vapid-keys` et contact `mailto:` du responsable |

5. Redéploie, connecte les deux membres, puis installe la PWA depuis sa nouvelle adresse HTTPS. L’application démarre avec une base vide. Les données de l’ancien Sheet restent dans le Sheet. Si tu veux continuer à utiliser GitHub Pages pendant l’essai, garde son déploiement sur une révision d’avant la migration.

Voir [la configuration Git de Vercel](https://vercel.com/docs/git) et [l’intégration Vercel de Turso](https://vercel.com/marketplace/tursocloud/database).

## Google Agenda en lecture et écriture

L’agenda est facultatif. Dans Google Cloud, active l’API Google Calendar et configure un client OAuth pour le compte Google dédié au foyer. Partage chaque agenda avec ce compte en autorisant la modification des événements.

1. Crée un client OAuth de type **Application Web** et ajoute `https://developers.google.com/oauthplayground` à ses URI de redirection autorisés.
2. Dans [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), ouvre les paramètres, coche **Use your own OAuth credentials**, puis renseigne le client Google Cloud créé ci-dessus. Autorise le scope `https://www.googleapis.com/auth/calendar.events` avec le compte dédié et échange le code contre un jeton. Conserve le jeton de renouvellement. Pour un fonctionnement durable, vérifie l’état de publication de l’application OAuth. En mode **Testing**, un jeton externe avec ce scope expire au bout de sept jours.
3. Dans Vercel, ajoute `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` et `CALENDAR_IDS`. Sépare les identifiants des agendas par des virgules. Redéploie le projet. Vérifie l’onglet Agenda et les filtres, puis les logs Vercel si un agenda manque.

Voir [la documentation Google sur les jetons de renouvellement](https://developers.google.com/identity/protocols/oauth2#expiration).

## Notifications mobiles

Génère une seule paire de clés avec `npx web-push generate-vapid-keys`, puis configure les trois variables `VAPID_*` dans Vercel et redéploie. La table Turso est créée au premier abonnement ; la migration versionnée garantit ensuite le même schéma dans tous les environnements. Sur Android, installe la PWA avec Chrome. Sur iPhone ou iPad, ajoute-la à l’écran d’accueil. Une fois connecté, touche la cloche dans l’en-tête et accepte l’autorisation système. Le téléphone est enregistré dans Turso et reçoit immédiatement la notification de test. La même cloche permet de désabonner uniquement cet appareil.

## Skill mensuel Charlie

Le skill mensuel appelle le même point d’entrée que l’application, `POST /api/dashboard`, sans cookie utilisateur. Il s’authentifie avec `Authorization: Bearer <CHARLIE_SKILL_SECRET>` et envoie un corps JSON de cette forme :

```json
{
  "a": "charlieRecommendations",
  "appointments": [
    {
      "key": "vaccin-rappel-2027",
      "title": "Prendre rendez-vous pour le rappel de vaccin",
      "dueDate": "2027-04-15"
    }
  ]
}
```

- `key` est l’identifiant stable de la recommandation dans le skill (1 à 100 caractères parmi lettres, chiffres, `.`, `_`, `:`, `-`).
- `title` décrit clairement le rendez-vous ; l’API ajoute elle-même le préfixe obligatoire `[IA] `.
- `dueDate` est la date d’apparition dans la routine Charlie, au format `YYYY-MM-DD`, même plusieurs mois à l’avance.
- Un lot contient de 1 à 50 rendez-vous. La réponse indique `created` et `existing`.
- L’identifiant stocké dépend de `key` et `dueDate`. Rejouer le même lot est donc sans effet et ne crée pas de doublon. Pour déplacer une recommandation, le skill envoie la nouvelle échéance ; l’ancienne entrée reste volontairement inchangée afin de ne pas écraser une action utilisateur.

Exemple d’appel :

```sh
curl https://dashboard.example/api/dashboard \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $CHARLIE_SKILL_SECRET" \
  --data '{"a":"charlieRecommendations","appointments":[{"key":"vaccin-rappel-2027","title":"Prendre rendez-vous pour le rappel de vaccin","dueDate":"2027-04-15"}]}'
```

Le skill doit conserver ce secret côté serveur et ne jamais l’inclure dans un lien, un mail ou du code client. Après ajout ou modification de la variable dans Vercel, il faut redéployer pour qu’elle soit disponible à la fonction.

## Skill mensuel de quittance de loyer

Le skill de quittance utilise le même secret serveur et le même point d’entrée. Avant de générer le PDF, il envoie `{"a":"rentReceiptStatus","month":"YYYY-MM","status":"not-generated"}`. Le dashboard crée ou rafraîchit alors l’unique routine **Justine** « Quittance de loyer (non généré) », à échéance du premier jour du mois.

Après confirmation de l’envoi réel de l’e-mail, le skill envoie le même corps avec `"status":"generated"`. La routine devient « Quittance de loyer (généré) » et est marquée comme terminée. Si la génération ou l’envoi échoue, le second appel ne doit pas être effectué : la mention « non généré » reste ainsi visible.

Ces appels sont rejouables et mettent à jour la même routine `rent-receipt`, sans doublon. Le mois doit être au format `YYYY-MM` et l’en-tête d’autorisation reste `Authorization: Bearer <CHARLIE_SKILL_SECRET>`.

## Hors ligne et conflits

Ouvre la PWA une première fois en ligne et connecte-toi. Le service worker précharge le build. L’application conserve aussi le dernier état du foyer sur l’appareil. Les changements effectués hors ligne restent en file après fermeture ou rechargement de l’app. La synchro reprend à la reconnexion tant que l’app est ouverte, ou à sa prochaine ouverture.

Chaque opération a un identifiant et une révision. Le serveur reconnaît une requête répétée, même si sa réponse s’est perdue. Lorsqu’un autre appareil a modifié le même élément entre-temps, l’application conserve le changement local et propose de le renvoyer ou de garder la version du foyer. La météo et l’agenda ont des routes distinctes. Une erreur d’intégration ne bloque pas les données du foyer.

## Vérifications

- `npm test` lance les tests de session, de données partagées, de rejeu et de conflits sur SQLite.
- `npm run build` vérifie TypeScript et génère la PWA avec un manifeste d’assets hors ligne.
- `python tools/smoke_test.py` teste les parcours mobile et desktop dans Chromium, puis la réouverture hors ligne et la resynchronisation. Prérequis facultatifs : Python avec Playwright et son navigateur Chromium.

## Branches et compatibilité

La migration se transmet avec la branche `feature/migration-vercel-turso`. Les branches qui utilisent le nouveau socle doivent partir d’une base qui contient déjà cette migration. Au moment de la bascule, intègre la branche de migration dans `main` du fork avant de créer ces nouvelles branches. Les fonctionnalités météo et agenda déjà intégrées restent indépendantes et sont réunies sur `develop`.

L’ancien code Apps Script est conservé dans `apps-script/` pour l’ancienne installation. Les déploiements Vercel embarquent uniquement le build Vite et l’API.
