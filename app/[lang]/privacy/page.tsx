import type { Metadata } from 'next';
import LegalPage, { type Section } from '@/components/legal/LegalPage';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = { title: 'Synthia AI — Confidentialité / Privacy' };

const FR: Section[] = [
  { h: '1. Responsable du traitement', p: [`Synthia AI est un service édité par Ikelyane. Pour toute question relative à vos données : ${CONTACT_EMAIL}.`] },
  { h: '2. Données que nous traitons', p: [{ list: [
    'Compte : nom, adresse e-mail, mot de passe (stocké uniquement sous forme chiffrée irréversible).',
    'Contenus : sujets, textes, scripts, fichiers audio, images et vidéos que vous importez ou générez.',
    'Réglages : brand kit (filigrane, ton, langue, voix), calendrier de publication.',
    'Comptes sociaux connectés : identifiant et nom de votre chaîne YouTube ou de votre compte TikTok, photo de profil, et les jetons d’accès délivrés par ces plateformes.',
    'Données techniques : adresse IP et journaux de sécurité (prévention des abus).',
    'Paiement : géré par notre prestataire de paiement ; nous ne stockons pas vos données de carte.',
  ] }] },
  { h: '3. Utilisation des services YouTube (API YouTube)', p: [
    'Synthia utilise les services d’API YouTube (YouTube API Services). En connectant votre chaîne, vous acceptez les Conditions d’utilisation de YouTube : https://www.youtube.com/t/terms et vous êtes soumis aux Règles de confidentialité de Google : https://policies.google.com/privacy',
    'Autorisations demandées : « youtube.upload » pour mettre en ligne les vidéos que vous choisissez de publier, et « youtube.readonly » pour afficher le nom et l’image de la chaîne connectée. Synthia ne lit pas, ne modifie pas et ne supprime pas vos autres vidéos, commentaires, abonnés ou statistiques.',
    'Les données YouTube (identifiant et nom de chaîne, image, jetons) servent uniquement à publier vos vidéos à votre demande ; elles ne sont jamais vendues ni partagées avec des tiers ni utilisées pour de la publicité.',
    'Vous pouvez retirer l’accès à tout moment depuis Synthia (Comptes connectés → Déconnecter) ou depuis la page de sécurité Google : https://myaccount.google.com/permissions . La déconnexion supprime immédiatement les jetons stockés.',
  ] },
  { h: '4. Utilisation de TikTok', p: [
    'En connectant TikTok, Synthia obtient (selon votre accord) les autorisations user.info.basic (nom et photo de profil), video.upload (envoi de brouillons dans votre application TikTok) et video.publish (publication directe). Synthia publie uniquement les vidéos que vous choisissez, avec les paramètres de visibilité que vous sélectionnez. Conditions TikTok : https://www.tiktok.com/legal/terms-of-service',
  ] },
  { h: '5. Pourquoi (finalités et bases légales)', p: [{ list: [
    'Fournir le service (création, montage, stockage et publication de vos vidéos) — exécution du contrat.',
    'Sécurité, prévention de la fraude et des abus — intérêt légitime.',
    'Facturation et obligations comptables — obligation légale.',
  ] }] },
  { h: '6. Sous-traitants', p: [
    'Pour produire vos vidéos, certaines données sont transmises à des prestataires techniques, uniquement pour la tâche demandée :',
    { list: [
      'Groq (génération et correction de textes par IA) ;',
      'ElevenLabs (synthèse vocale) ; Stability AI (images IA, si activé) ;',
      'Google / YouTube et TikTok (publication, à votre demande) ;',
      'Cloudflare (sécurité et acheminement du trafic) ; hébergement du serveur dans l’Union européenne ;',
      'Flutterwave (paiements).',
    ] },
    'Certains de ces prestataires sont situés hors de l’Union européenne ; les transferts sont encadrés par leurs garanties contractuelles (clauses contractuelles types).',
  ] },
  { h: '7. Conservation', p: [
    'Vos contenus et vidéos sont conservés tant que votre compte est actif ou jusqu’à ce que vous les supprimiez (Bibliothèque → Supprimer). Les jetons des comptes sociaux sont supprimés dès la déconnexion. À la suppression du compte, toutes vos données sont effacées sous 30 jours, sauf obligations légales (factures).',
  ] },
  { h: '8. Sécurité', p: [
    'Connexions chiffrées (HTTPS), mots de passe hachés, jetons d’accès chiffrés (AES-256), accès cloisonné : chaque utilisateur n’accède qu’à ses propres projets.',
  ] },
  { h: '9. Vos droits', p: [
    `Vous disposez des droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité. Écrivez à ${CONTACT_EMAIL}. Vous pouvez aussi saisir l’autorité de protection des données de votre pays (en Belgique : https://www.autoriteprotectiondonnees.be).`,
  ] },
  { h: '10. Cookies', p: ['Synthia utilise uniquement des cookies nécessaires au fonctionnement (session de connexion, sécurité). Aucun cookie publicitaire ni traceur tiers.'] },
];

const EN: Section[] = [
  { h: '1. Controller', p: [`Synthia AI is a service published by Ikelyane. For any question about your data: ${CONTACT_EMAIL}.`] },
  { h: '2. Data we process', p: [{ list: [
    'Account: name, e-mail address, password (stored only as an irreversible hash).',
    'Content: topics, texts, scripts, audio, images and videos you upload or generate.',
    'Settings: brand kit (watermark, tone, language, voice), publishing calendar.',
    'Connected social accounts: ID and name of your YouTube channel or TikTok account, profile picture, and the access tokens issued by those platforms.',
    'Technical data: IP address and security logs (abuse prevention).',
    'Payments: handled by our payment provider; we do not store card details.',
  ] }] },
  { h: '3. Use of YouTube API Services', p: [
    'Synthia uses YouTube API Services. By connecting your channel you agree to be bound by the YouTube Terms of Service: https://www.youtube.com/t/terms and you are subject to the Google Privacy Policy: https://policies.google.com/privacy',
    'Requested permissions: “youtube.upload” to upload the videos you choose to publish, and “youtube.readonly” to show the name and picture of the connected channel. Synthia does not read, modify or delete your other videos, comments, subscribers or analytics.',
    'YouTube data (channel ID and name, picture, tokens) is used only to publish your videos at your request; it is never sold, shared with third parties or used for advertising.',
    'You can revoke access at any time from Synthia (Connected accounts → Disconnect) or from Google’s security settings: https://myaccount.google.com/permissions . Disconnecting immediately deletes the stored tokens.',
  ] },
  { h: '4. Use of TikTok', p: [
    'When you connect TikTok, Synthia obtains (with your consent) the user.info.basic (profile name and picture), video.upload (send drafts to your TikTok app) and video.publish (direct posting) permissions. Synthia only posts the videos you choose, with the visibility settings you select. TikTok terms: https://www.tiktok.com/legal/terms-of-service',
  ] },
  { h: '5. Purposes and legal bases', p: [{ list: [
    'Providing the service (creating, editing, storing and publishing your videos) — performance of contract.',
    'Security, fraud and abuse prevention — legitimate interest.',
    'Billing and accounting — legal obligation.',
  ] }] },
  { h: '6. Processors', p: [
    'To produce your videos, some data is sent to technical providers, only for the requested task:',
    { list: [
      'Groq (AI text generation and proofreading);',
      'ElevenLabs (voice synthesis); Stability AI (AI images, when enabled);',
      'Google / YouTube and TikTok (publishing, at your request);',
      'Cloudflare (security and traffic delivery); server hosting in the European Union;',
      'Flutterwave (payments).',
    ] },
    'Some providers are located outside the European Union; transfers rely on their contractual safeguards (standard contractual clauses).',
  ] },
  { h: '7. Retention', p: [
    'Your content and videos are kept while your account is active or until you delete them (Library → Delete). Social account tokens are deleted as soon as you disconnect. When the account is deleted, all your data is erased within 30 days, except where the law requires otherwise (invoices).',
  ] },
  { h: '8. Security', p: ['Encrypted connections (HTTPS), hashed passwords, encrypted access tokens (AES-256), strict isolation: each user only accesses their own projects.'] },
  { h: '9. Your rights', p: [
    `You have the rights of access, rectification, erasure, restriction, objection and portability. Write to ${CONTACT_EMAIL}. You may also contact your data protection authority.`,
  ] },
  { h: '10. Cookies', p: ['Synthia only uses cookies required for the service to work (sign-in session, security). No advertising cookies or third-party trackers.'] },
];

export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const fr = lang !== 'en';
  return (
    <LegalPage lang={fr ? 'fr' : 'en'}
      title={fr ? 'Politique de confidentialité' : 'Privacy policy'}
      updated={fr ? 'Dernière mise à jour : 15 novembre 2026' : 'Last updated: 15 November 2026'}
      intro={fr
        ? 'Cette politique explique quelles données Synthia AI (https://synthia.ikelyane.com) traite, pourquoi, avec qui elles sont partagées et comment exercer vos droits.'
        : 'This policy explains which data Synthia AI (https://synthia.ikelyane.com) processes, why, who it is shared with and how to exercise your rights.'}
      sections={fr ? FR : EN} />
  );
}
