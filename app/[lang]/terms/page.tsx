import type { Metadata } from 'next';
import LegalPage, { type Section } from '@/components/legal/LegalPage';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = { title: 'Synthia AI — Conditions / Terms' };

const FR: Section[] = [
  { h: '1. Objet', p: ['Synthia AI (« Synthia »), service édité par Ikelyane, permet de créer des vidéos à l’aide de l’intelligence artificielle (scripts, voix, musique, sous-titres, montage) et de les publier sur des réseaux sociaux. L’utilisation du service implique l’acceptation des présentes conditions.'] },
  { h: '2. Compte', p: ['Vous êtes responsable de la confidentialité de vos identifiants et de l’activité de votre compte. Vous devez avoir l’âge requis par les plateformes sur lesquelles vous publiez.'] },
  { h: '3. Vos contenus', p: [
    'Vous restez propriétaire des contenus que vous importez et des vidéos que vous créez, y compris pour un usage commercial. Vous nous accordez uniquement le droit de les traiter pour fournir le service.',
    'Vous garantissez disposer des droits nécessaires (textes, images, musiques, voix) et ne pas publier de contenus illicites, trompeurs, haineux, violents, portant atteinte aux droits d’autrui ou contraires aux règles des plateformes. Il est interdit d’utiliser le clonage de voix pour imiter une personne sans son consentement.',
    'Les contenus générés par IA peuvent contenir des erreurs : relisez-les avant publication.',
  ] },
  { h: '4. Publication sur les réseaux sociaux', p: [
    'Lorsque vous connectez YouTube, vous acceptez d’être lié par les Conditions d’utilisation de YouTube : https://www.youtube.com/t/terms . La publication via YouTube est également soumise aux Règles de confidentialité de Google : https://policies.google.com/privacy',
    'Lorsque vous connectez TikTok, vous acceptez les Conditions de TikTok : https://www.tiktok.com/legal/terms-of-service et, lors d’une publication, la Music Usage Confirmation : https://www.tiktok.com/legal/page/global/music-usage-confirmation/en',
    'Synthia ne publie que les vidéos que vous sélectionnez, avec les paramètres que vous choisissez. Vous restez seul responsable de ce qui est publié sur vos comptes. Les plateformes peuvent limiter, refuser ou retirer des publications selon leurs propres règles.',
  ] },
  { h: '5. Abonnements et quotas', p: [
    'Le plan gratuit et les plans payants comprennent un nombre de vidéos par mois, remis à zéro chaque mois civil. Les abonnements sont sans engagement et peuvent être arrêtés à tout moment ; le mois en cours reste dû.',
  ] },
  { h: '6. Usage acceptable', p: ['Il est interdit de contourner les limites du service, d’en perturber le fonctionnement, d’en extraire massivement les données ou d’y accéder de manière automatisée sans autorisation. Nous pouvons suspendre un compte en cas d’abus.'] },
  { h: '7. Disponibilité et responsabilité', p: ['Le service est fourni « en l’état ». Nous faisons de notre mieux pour assurer sa disponibilité, sans garantie d’absence d’interruption. Notre responsabilité est limitée aux montants payés au cours des 12 derniers mois, dans les limites permises par la loi.'] },
  { h: '8. Données personnelles', p: ['Le traitement de vos données est décrit dans notre politique de confidentialité : https://synthia.ikelyane.com/fr/privacy'] },
  { h: '9. Modifications et contact', p: [`Nous pouvons faire évoluer ces conditions ; les changements importants vous seront signalés. Questions : ${CONTACT_EMAIL}.`] },
];

const EN: Section[] = [
  { h: '1. Purpose', p: ['Synthia AI (“Synthia”), a service published by Ikelyane, lets you create videos with artificial intelligence (scripts, voices, music, captions, editing) and publish them on social networks. Using the service means accepting these terms.'] },
  { h: '2. Account', p: ['You are responsible for keeping your credentials confidential and for the activity of your account. You must meet the minimum age required by the platforms you publish on.'] },
  { h: '3. Your content', p: [
    'You keep ownership of the content you upload and the videos you create, including for commercial use. You only grant us the right to process them to provide the service.',
    'You warrant that you hold the necessary rights (texts, images, music, voices) and will not publish content that is unlawful, misleading, hateful, violent, infringing or contrary to platform rules. Using voice cloning to impersonate someone without their consent is forbidden.',
    'AI-generated content may contain mistakes: review it before publishing.',
  ] },
  { h: '4. Publishing on social networks', p: [
    'When you connect YouTube, you agree to be bound by the YouTube Terms of Service: https://www.youtube.com/t/terms . Publishing through YouTube is also subject to the Google Privacy Policy: https://policies.google.com/privacy',
    'When you connect TikTok, you agree to TikTok’s Terms: https://www.tiktok.com/legal/terms-of-service and, when posting, to the Music Usage Confirmation: https://www.tiktok.com/legal/page/global/music-usage-confirmation/en',
    'Synthia only publishes the videos you select, with the settings you choose. You remain solely responsible for what is posted on your accounts. Platforms may limit, refuse or remove posts under their own rules.',
  ] },
  { h: '5. Plans and quotas', p: ['The free plan and paid plans include a number of videos per month, reset every calendar month. Subscriptions have no commitment and can be stopped at any time; the current month remains due.'] },
  { h: '6. Acceptable use', p: ['You may not circumvent the service’s limits, disrupt it, scrape it or access it by automated means without permission. We may suspend accounts in case of abuse.'] },
  { h: '7. Availability and liability', p: ['The service is provided “as is”. We do our best to keep it available, without guaranteeing uninterrupted operation. Our liability is limited to the amounts paid in the last 12 months, to the extent permitted by law.'] },
  { h: '8. Personal data', p: ['How we process your data is described in our privacy policy: https://synthia.ikelyane.com/en/privacy'] },
  { h: '9. Changes and contact', p: [`We may update these terms; significant changes will be notified. Questions: ${CONTACT_EMAIL}.`] },
];

export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const fr = lang !== 'en';
  return (
    <LegalPage lang={fr ? 'fr' : 'en'}
      title={fr ? 'Conditions d’utilisation' : 'Terms of service'}
      updated={fr ? 'Dernière mise à jour : 15 novembre 2026' : 'Last updated: 15 November 2026'}
      intro={fr ? 'Les présentes conditions régissent l’utilisation de Synthia AI (https://synthia.ikelyane.com).' : 'These terms govern the use of Synthia AI (https://synthia.ikelyane.com).'}
      sections={fr ? FR : EN} />
  );
}
