# Fonctionnalités à transmettre à Victor

Chaque branche de fonctionnalité part de `main` sur le fork. La branche `develop` rassemble les fonctionnalités pour les tester ensemble. Victor peut reprendre chaque branche individuellement.

| Branche | Fonctionnalité | Dépendances et risques de fusion | Ordre de fusion |
| --- | --- | --- | --- |
| `feature/meteo-previsions` | Météo sur cinq jours dans la vue simple, sélection du jour et slider animé entre la ville configurée et Auxerre, avec déplacement de la carte et des prévisions ensemble. Les petites tuiles résument la journée et la carte sélectionnée affiche quatre repères horaires. | Première fonctionnalité intégrée. Aucun conflit observé. Surveiller les modifications de la carte `.scene` et du chargement météo dans `app.js` et `apps-script/Code.gs`, ainsi que les versions de cache dans `index.html` et `sw.js`. Republier le script Google Apps Script pour activer les nouvelles données. | Aucun ordre particulier. |
| `feature/filtres-agendas` | Filtres par agenda synchronisé dans la vue Agenda, avec noms courts et gestion des événements partagés. | `app.js` et `apps-script/Code.gs` partagés avec la météo, dans des fonctions distinctes. Chevauchement des versions de cache dans `index.html` et `sw.js`, versions communes retenues sur `develop`. Republier `Code.gs` pour exposer les agendas au dashboard. | Aucun ordre fonctionnel. |

Le registre sera rempli à mesure que les fonctionnalités seront développées. Si deux branches touchent la même zone, indiquer les fichiers et les fonctions concernés, le conflit constaté ou possible et la résolution recommandée .
