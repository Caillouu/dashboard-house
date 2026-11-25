# Ajouts vocaux avec Alexa

Le skill privé **Maison Courses** utilise le dashboard existant. Une fois la commande dictée, Alexa demande les détails nécessaires, les relit et attend « oui » avant d’enregistrer. « Annule » ferme la commande. Après une coupure réseau, un nouveau « oui » dans la même session réutilise la même opération.

Dis « Alexa, dis à maison courses d’ajouter du lait » pour un ajout direct. La commande « ajoute du lait aux courses » conserve le dialogue avec quantité.

| Où ajouter | Exemple à dire après « Alexa, ouvre maison courses » |
| --- | --- |
| Courses | Ajoute du lait aux courses |
| Wishlist | Ajoute une lampe à la wishlist |
| Groupe de routines | Crée le groupe de routines jardin |
| Tâche dans un groupe | Ajoute la tâche de routine arroser les tomates |
| Quête partagée ou privée | Ajoute la quête privée ranger l’atelier |
| Étape d’une quête | Ajoute une étape de quête commander les étagères |
| Dette du foyer | Ajoute la dépense déjeuner |
| Voyage | Crée le voyage Bretagne |
| Activité, hébergement, trajet ou transport | Ajoute l’activité visite de l’aquarium |
| Objet ou catégorie de valise | Mets le chargeur dans la valise |
| Liste type, objet ou catégorie | Crée la liste type week-end |
| Google Agenda, journée entière | Ajoute l’événement réunion de famille |
| Google Agenda, avec des horaires | Ajoute le rendez-vous dentiste |

Dans un dialogue, préfixer le nom demandé par « écris », par exemple « écris Bretagne ». Dire « passer » pour un champ facultatif. Pour une dépense de 12,50 €, dire « premier membre » ou « deuxième membre », puis « douze euros », puis « cinquante centimes ». Les réponses correspondent aux membres p1 et p2 du dashboard. En présence de plusieurs quêtes, voyages ou listes types portant le même nom, utiliser un nom unique.

## Associer l’Echo plus tard

1. Dans Vercel, générer un secret avec `openssl rand -hex 32` et définir `ALEXA_SKILL_SECRET` dans les variables Production. Choisir `ALEXA_MEMBER=p1` ou `p2` pour identifier l’auteur des écritures, notamment des quêtes privées. Pour Agenda, définir `ALEXA_CALENDAR_ID` à l’identifiant Google exact de l’agenda choisi parmi `CALENDAR_IDS`, avec les droits d’écriture déjà utilisés par le dashboard. Redéployer après l’ajout des variables.
2. Dans [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask), créer un skill **Custom**, en français (France), avec hébergement **Provision your own**. Coller [fr-FR.json](fr-FR.json) dans le JSON Editor, enregistrer et construire le modèle. Le nom d’invocation est « maison courses ».
3. Créer une fonction AWS Lambda dans une région prise en charge pour les skills européens, par exemple Europe (Irlande), avec Node.js 24 et le handler `index.handler`. Déployer le contenu de [index.mjs](index.mjs) comme fichier `index.mjs` à la racine du code. Configurer un délai d’exécution d’au moins 8 secondes et un rôle permettant ses logs CloudWatch.
4. Dans Lambda, ajouter le déclencheur **Alexa Skills Kit** avec vérification de l’ID du skill. Ajouter les variables `ALEXA_SKILL_ID` (ID du skill), `ALEXA_SKILL_SECRET` (même secret que dans Vercel), et `DASHBOARD_HOUSE_URL` (URL HTTPS stable du dashboard). Renseigner l’ARN de la Lambda dans **Custom → Endpoint** dans la console Alexa.
5. Activer **Test → Development** et ouvrir le skill depuis le simulateur ou depuis l’Echo connecté au compte Amazon autorisé pour le test. Le premier appel affiche le message d’association. Copier l’empreinte affichée dans CloudWatch dans la variable Lambda `ALEXA_ACCOUNT_HASH`. Ensuite, tester de nouveau « Alexa, ouvre maison courses », puis ajouter un article de test et vérifier sa présence dans le dashboard.
6. Laisser le skill en **Development** pour l’utiliser sur l’Echo avec le compte Amazon associé. L’autorisation s’applique au compte Alexa de l’appareil. Les personnes qui utilisent cet appareil peuvent donc dicter une commande sous le même membre du dashboard.

Le skill utilise une destination Google Agenda choisie à la configuration et le fuseau Europe/Paris. Les champs complémentaires, par exemple les liens, le budget de la wishlist et les notes, restent modifiables dans le dashboard. La configuration ne demande aucune migration Turso.

[Documentation Amazon sur le déclencheur et l’ARN Lambda](https://developer.amazon.com/en-GB/docs/alexa/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html)
