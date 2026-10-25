# Supabase : configuration et test du parcours communautaire

L'application utilise Supabase depuis ses backends. Elle n'utilise ni la clé publishable dans le navigateur, ni Supabase Auth : Freighter signe un message SEP-53 pour ouvrir une session, sans frais blockchain.

## 1. Préparer le projet

Dans votre projet Supabase :

1. **Settings → Data API** : copiez **Project URL** (`https://<project-ref>.supabase.co`).
2. **Settings → API Keys → Secret keys** : créez/copiez une clé serveur `sb_secret_…`. Une ancienne clé `service_role` est également acceptée. La clé publishable/anon n'est pas utilisée par cette intégration.
3. **SQL Editor → New query** : copiez tout le fichier [`supabase/migrations/202610250001_community_trust.sql`](../supabase/migrations/202610250001_community_trust.sql), puis cliquez **Run** une fois. Le fichier crée les sept tables, fonctions et protections RLS. Ne désactivez pas RLS et n'ajoutez pas de politique publique pour contourner une erreur.
4. **Table Editor** : vérifiez les tables `community_calls`, `community_reviews`, `community_reports`, `community_decisions`, `community_audits`, `community_challenges`, `community_sessions`.

L'écran **Connect → Framework → Next.js** n'est pas nécessaire : le code existant effectue déjà la connexion serveur. Aucun mot de passe PostgreSQL ni fournisseur Supabase Auth n'est demandé.

## 2. Configurer le projet local

Ajoutez ces lignes au **`.env` à la racine**, à côté de `.env.example` :

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
COMMUNITY_NAMESPACE=trustbazaar-testnet-dev
MODERATOR_WALLETS=<adresse-publique-d-un-troisieme-wallet>
MODERATION_RESPONSE_SECONDS=60
```

Les deux premières valeurs sont requises. Le namespace sépare les environnements : votre teammate doit utiliser le même projet et le même namespace pour voir les mêmes données. Il doit également utiliser les mêmes adresses de registries Stellar. Pour une démo isolée, changez le namespace ; cela n'efface ni les anciennes données ni les stakes onchain.

La clé serveur reste dans les environnements backend, sans préfixe `NEXT_PUBLIC_`. Ne la commitez pas. Les modérateurs sont des **adresses publiques** séparées par des virgules. Sans liste explicite, les wallets admin et auditeur sont autorisés. Un modérateur ne peut pas arbitrer un dossier où il est acheteur ou provider : utilisez un troisième compte Freighter pour le test. Ce compte signe des messages et n'a pas besoin de USDC ; le wallet auditeur serveur exécute les sanctions et doit rester financé.

Le délai par défaut est **86400 secondes (24 h)**. La valeur **60** raccourcit seulement le délai de réponse pour tester le hackathon. Elle est enregistrée dans chaque nouveau dossier ; changer la variable ne modifie pas les dossiers déjà ouverts. La variable historique `WEATHER_WARNING_THRESHOLD` n'est plus utilisée : il n'y a plus de slash météo automatique.

## 3. Vérifier et importer les audits existants

Arrêtez les serveurs avec Ctrl+C avant l'import, puis :

```sh
pnpm install
pnpm community:check
pnpm community:import-audits
pnpm demo:weather
```

L'import est facultatif si aucun historique local n'existe. Il conserve les IDs et les preuves et ignore les doublons. Il ne crée pas rétroactivement des signalements et ne modifie aucune transaction Stellar. Après configuration, les nouveaux audits sont écrits dans Supabase et lus depuis cette base par les différents serveurs. Le fichier JSON reste un ancien backup. Sans Supabase configuré, le mode historique local reste disponible, avec les fonctionnalités communautaires désactivées.

Évitez `pnpm demo:reset` sur une base partagée : le reset historique efface des audits locaux et retire des listings legacy. Le serveur refuse de vider les audits Supabase via le bouton de reset. Utilisez des namespaces dédiés aux démos.

## 4. Tester comme acheteur

1. Conservez vos listings météo existants. Dans le catalogue, vérifiez les trois informations : avis utilisateurs, réponses observées et concordance MET Norway.
2. Connectez le wallet acheteur, ouvrez un listing et effectuez **un nouvel appel payé réel**. Les anciennes transactions seules n'identifient pas suffisamment un endpoint pour donner un droit de vote.
3. Le backend relaie la requête et vérifie le règlement sur Stellar. Un reçu précis apparaît dans `community_calls`, lié au listing et au buyer. Les corps des requêtes/réponses ne sont pas conservés ; seul un hash de requête est stocké.
4. Cliquez **Give a verified review**. Freighter demande de signer un message d'identification, sans transaction ni frais. Choisissez le pouce vert ou rouge. Le rouge exige un motif ; le commentaire est facultatif et public.
5. Dans le catalogue, vérifiez les compteurs. Un wallet a un avis actif par listing. Pour modifier cet avis, faites un nouvel appel payé.
6. Cliquez **Report a problem** sur un appel, choisissez un motif et décrivez le manquement (10 caractères minimum). Ce texte est privé aux participants et modérateurs. Le dossier affiche son état et le délai de réponse dans Dashboard → Community workspace.

Un échec de stockage après un paiement ne doit jamais vous faire repayer : le résultat inclut une alerte et, lorsque possible, **Save receipt without paying again**. Réessayez l'enregistrement après restauration de Supabase, dans l'heure et avant de fermer la page.

## 5. Tester comme provider

1. Connectez le wallet propriétaire du listing et ouvrez Dashboard.
2. La partie financière affiche toujours les transferts confirmés. **Community workspace** ajoute la réputation par listing, les revenus attribuables aux reçus, les appels entrants et les signalements.
3. Vérifiez votre wallet par signature pour lire vos dossiers privés et répondre. La réponse à un avis est publique ; la réponse à un signalement reste dans le dossier.
4. Consultez la concordance MET Norway, les champs et tolérances. Une mauvaise concordance ouvre éventuellement un dossier automatique, sans warning financier ni slash.

## 6. Tester la modération

1. Connectez le troisième wallet figurant dans `MODERATOR_WALLETS`, ouvrez Dashboard et vérifiez-le par signature.
2. La file de modération montre les dossiers. Commencez par **Request provider response** et rédigez un motif public.
3. Une réponse du provider ou l'expiration du délai permet de confirmer un warning ou un slash. Les pouces ne déclenchent aucune sanction automatique.
4. Testez d'abord **Dismiss report** ou **Resolved after correction**. Pour tester un slash, utilisez un listing dédié avec un stake de test : l'action prend réellement le stake restant sur Testnet.
5. **Suspend routing onchain** peut protéger les acheteurs pendant l'examen. **Slash stake and suspend onchain** demande une signature de confirmation distincte, puis le backend auditeur effectue slash et pause. Les liens Stellar apparaissent dans la décision publique.
6. Si une pause échoue après un slash enregistré, **Resume this decision** reprend la décision et ne répète pas le slash déjà persisté. Une approbation préparée peut être annulée.

## Limites à connaître

- Un wallet n'est pas une personne ; les appels payés rendent les faux avis plus coûteux sans éliminer les attaques Sybil.
- Les pourcentages techniques mesurent les réponses payées observées, avec le nombre d'échantillons ; ils ne constituent pas une garantie d'uptime.
- Le gateway accepte HTTPS public et les ports/path des démos locales documentées. Il bloque les adresses privées non autorisées et les redirections. Les appels directs externes restent possibles, mais n'ont pas de reçu communautaire sans intégration du backend/agent.
- Postgres et Stellar ne partagent pas de transaction atomique. Un crash entre une sanction confirmée et son enregistrement nécessite une vérification opérateur. Une décision bloquée en `executing` doit être examinée avant toute reprise.
- Le cooldown onchain existant de 10 secondes ne garantit pas que le stake restera disponible pendant une longue modération. Aucun verrouillage supplémentaire n'est ajouté au contrat.
- Les sessions utilisent le compte Ed25519 Freighter ; l'authentification multisig/contract-wallet n'est pas implémentée. Les clés et URL sont nécessaires avant le test sur votre véritable projet Supabase.
