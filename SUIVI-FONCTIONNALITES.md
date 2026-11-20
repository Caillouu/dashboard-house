# Fonctionnalités à transmettre à Victor

Chaque branche de fonctionnalité part de `main` sur le fork. La branche `develop` rassemble les fonctionnalités pour les tester ensemble. Victor peut reprendre chaque branche individuellement.

| Branche | Fonctionnalité | Dépendances et risques de fusion | Ordre de fusion |
| --- | --- | --- | --- |
| `feature/meteo-previsions` | Météo sur cinq jours dans la vue simple, sélection du jour et slider entre la ville configurée et Auxerre. | Première fonctionnalité intégrée. Aucun conflit observé. Surveiller les modifications de la carte `.scene` et du chargement météo dans `app.js` et `apps-script/Code.gs`, ainsi que les versions de cache dans `index.html` et `sw.js`. Republier le script Google Apps Script pour activer les nouvelles données. | Aucun ordre particulier. |

Le registre sera rempli à mesure que les fonctionnalités seront développées. Si deux branches touchent la même zone, indiquer les fichiers et les fonctions concernés, le conflit constaté ou possible et la résolution recommandée.
