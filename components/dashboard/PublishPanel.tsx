'use client';

import { useEffect, useState } from 'react';

type Lang = 'fr' | 'en';
export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter';

export interface PublishSelection {
  platforms: Platform[];
  options: {
    caption?: string;
    youtube: { privacy: 'public' | 'unlisted' | 'private' };
    tiktok: {
      mode: 'direct' | 'draft'; privacy: string;
      disableComment: boolean; disableDuet: boolean; disableStitch: boolean;
      brandOrganic: boolean; brandedContent: boolean;
    };
  };
  /** False while a required choice is missing (e.g. TikTok privacy). */
  valid: boolean;
}

interface CreatorInfo {
  nickname: string; username: string; avatarUrl: string; privacyOptions: string[];
  commentDisabled: boolean; duetDisabled: boolean; stitchDisabled: boolean; maxDurationSec: number; canDirectPost: boolean;
}

const PLATFORMS: { id: Platform; label: string; icon: string; live: boolean }[] = [
  { id: 'youtube', label: 'YouTube', icon: '▶', live: true },
  { id: 'tiktok', label: 'TikTok', icon: '♪', live: true },
  { id: 'instagram', label: 'Instagram', icon: '◉', live: false },
  { id: 'facebook', label: 'Facebook', icon: 'f', live: false },
  { id: 'twitter', label: 'X', icon: '✕', live: false },
];

const PRIVACY_LABEL: Record<string, [string, string]> = {
  PUBLIC_TO_EVERYONE: ['Tout le monde', 'Everyone'],
  MUTUAL_FOLLOW_FRIENDS: ['Amis', 'Friends'],
  FOLLOWER_OF_CREATOR: ['Abonnés', 'Followers'],
  SELF_ONLY: ['Moi uniquement', 'Only me'],
};

export const PUBLISH_ERRORS: Record<string, [string, string]> = {
  not_connected: ['compte non connecté', 'account not connected'],
  reconnect_required: ['reconnectez le compte', 'reconnect the account'],
  coming_soon: ['bientôt disponible', 'coming soon'],
  youtube_quota: ['quota YouTube du jour atteint, réessayez demain', 'daily YouTube quota reached, retry tomorrow'],
  tiktok_privacy_required: ['choisissez qui peut voir la vidéo', 'choose who can see the video'],
  tiktok_direct_not_allowed: ['publication directe non autorisée pour cette appli TikTok', 'direct posting not allowed for this TikTok app'],
  tiktok_unaudited: ['appli TikTok pas encore validée : publication en privé uniquement', 'TikTok app not audited yet: private posts only'],
  tiktok_rate_limited: ['trop de publications TikTok, réessayez plus tard', 'too many TikTok posts, retry later'],
  tiktok_branded_private: ['un partenariat rémunéré ne peut pas être privé', 'branded content cannot be private'],
  upload_failed: ['échec de l’envoi', 'upload failed'],
  no_channel: ['ce compte Google n’a pas de chaîne YouTube', 'this Google account has no YouTube channel'],
};

export function publishErrorText(code: string | undefined, lang: Lang): string {
  if (!code) return '';
  const e = PUBLISH_ERRORS[code];
  return e ? e[lang === 'fr' ? 0 : 1] : code.replace(/^tiktok_/, 'TikTok : ').replace(/_/g, ' ');
}

export default function PublishPanel({ lang, onChange, defaultCaption, videoDurationSec }: {
  lang: Lang; onChange: (s: PublishSelection) => void; defaultCaption?: string; videoDurationSec?: number | null;
}) {
  const fr = lang === 'fr';
  const [connected, setConnected] = useState<Record<string, boolean> | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [ytPrivacy, setYtPrivacy] = useState<'public' | 'unlisted' | 'private'>('public');
  const [creator, setCreator] = useState<CreatorInfo | null>(null);
  const [creatorError, setCreatorError] = useState('');
  const [tk, setTk] = useState({ mode: 'draft' as 'direct' | 'draft', privacy: '', disableComment: false, disableDuet: false,
    disableStitch: false, brandOrganic: false, brandedContent: false, disclose: false });
  const [consent, setConsent] = useState(false);
  const [caption, setCaption] = useState(defaultCaption ?? '');

  useEffect(() => { setCaption(defaultCaption ?? ''); }, [defaultCaption]);

  useEffect(() => {
    fetch('/api/social/publish').then((r) => (r.ok ? r.json() : null)).then((j) => {
      const c = j?.platforms ?? {};
      setConnected(c);
      setPlatforms((['youtube', 'tiktok'] as Platform[]).filter((p) => c[p]));
    }).catch(() => setConnected({}));
  }, []);

  // TikTok rule: show the creator's nickname and the privacy levels their account allows.
  useEffect(() => {
    if (!platforms.includes('tiktok') || creator) return;
    fetch('/api/social/tiktok/creator').then(async (r) => {
      const j = await r.json();
      if (!r.ok) { setCreatorError(j.error ?? 'error'); return; }
      setCreator(j.info);
      if (j.info.canDirectPost) setTk((t) => ({ ...t, mode: 'direct' }));
    }).catch(() => setCreatorError('error'));
  }, [platforms, creator]);

  const tooLongForTikTok = Boolean(creator && videoDurationSec && videoDurationSec > creator.maxDurationSec);
  const tiktokValid = !platforms.includes('tiktok') || (
    !tooLongForTikTok && (tk.mode === 'draft' || (Boolean(tk.privacy) && consent
      && !(tk.disclose && !tk.brandOrganic && !tk.brandedContent)
      && !(tk.brandedContent && tk.privacy === 'SELF_ONLY'))));

  useEffect(() => {
    onChange({
      platforms,
      options: {
        caption: caption.trim() || undefined,
        youtube: { privacy: ytPrivacy },
        tiktok: { mode: tk.mode, privacy: tk.privacy, disableComment: tk.disableComment, disableDuet: tk.disableDuet,
          disableStitch: tk.disableStitch, brandOrganic: tk.disclose && tk.brandOrganic, brandedContent: tk.disclose && tk.brandedContent },
      },
      valid: platforms.length > 0 && tiktokValid,
    });
  }, [platforms, ytPrivacy, tk, consent, caption, tiktokValid, onChange]);

  const toggle = (p: Platform) => setPlatforms((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));
  const box = 'rounded-xl border border-[#2A2A45] bg-black/20 p-3 space-y-2';
  const noneConnected = connected && !connected.youtube && !connected.tiktok;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PLATFORMS.map((p) => {
          const isOn = platforms.includes(p.id);
          const usable = p.live && connected?.[p.id];
          return (
            <button key={p.id} type="button" disabled={!usable} onClick={() => toggle(p.id)}
              title={!p.live ? (fr ? 'Bientôt disponible' : 'Coming soon') : !usable ? (fr ? 'Compte non connecté' : 'Account not connected') : ''}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                isOn ? 'border-violet-500 bg-violet-500/20 text-violet-200' : 'border-[#2A2A45] text-slate-400 hover:border-slate-500'}
                disabled:opacity-40 disabled:cursor-not-allowed`}>
              <span>{p.icon}</span>{p.label}
              {!p.live && <span className="text-[10px]">({fr ? 'bientôt' : 'soon'})</span>}
            </button>
          );
        })}
      </div>

      {noneConnected && (
        <p className="text-xs text-slate-400">
          {fr ? 'Connectez votre chaîne YouTube ou votre compte TikTok pour publier automatiquement. ' : 'Connect your YouTube channel or TikTok account to publish automatically. '}
          <a href={`/${lang}/dashboard/accounts`} className="text-violet-400 hover:text-violet-300">{fr ? 'Connecter mes comptes →' : 'Connect my accounts →'}</a>
        </p>
      )}

      {platforms.length > 0 && (
        <label className="block text-xs text-slate-400">
          {fr ? 'Légende / description' : 'Caption / description'}
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} maxLength={2200} spellCheck
            className="mt-1 w-full bg-[#16162A] border border-[#2A2A45] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500" />
        </label>
      )}

      {platforms.includes('youtube') && (
        <div className={box}>
          <div className="text-xs font-semibold text-white">▶ YouTube</div>
          <div className="flex gap-1.5">
            {(['public', 'unlisted', 'private'] as const).map((v) => (
              <button key={v} type="button" onClick={() => setYtPrivacy(v)}
                className={`px-2.5 py-1 rounded-lg text-xs ${ytPrivacy === v ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400'}`}>
                {fr ? { public: 'Publique', unlisted: 'Non répertoriée', private: 'Privée' }[v] : { public: 'Public', unlisted: 'Unlisted', private: 'Private' }[v]}
              </button>
            ))}
          </div>
        </div>
      )}

      {platforms.includes('tiktok') && (
        <div className={box}>
          <div className="flex items-center gap-2 text-xs font-semibold text-white">
            ♪ TikTok
            {creator && (
              <span className="flex items-center gap-1.5 font-normal text-slate-300">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {creator.avatarUrl && <img src={creator.avatarUrl} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />}
                {fr ? 'Compte' : 'Account'} : <strong>{creator.nickname}</strong>{creator.username && <span className="text-slate-500">@{creator.username}</span>}
              </span>
            )}
          </div>
          {creatorError && <p className="text-xs text-amber-300">{publishErrorText(creatorError, lang)}</p>}
          {tooLongForTikTok && creator && (
            <p className="text-xs text-amber-300">{fr ? `Vidéo trop longue pour ce compte TikTok (max ${creator.maxDurationSec} s).` : `Video too long for this TikTok account (max ${creator.maxDurationSec}s).`}</p>
          )}

          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setTk({ ...tk, mode: 'draft' })}
              className={`px-2.5 py-1 rounded-lg text-xs ${tk.mode === 'draft' ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400'}`}>
              {fr ? 'Brouillon dans l’appli TikTok' : 'Draft in the TikTok app'}
            </button>
            <button type="button" disabled={!creator?.canDirectPost} onClick={() => setTk({ ...tk, mode: 'direct' })}
              className={`px-2.5 py-1 rounded-lg text-xs disabled:opacity-40 ${tk.mode === 'direct' ? 'bg-violet-600 text-white' : 'bg-white/5 text-slate-400'}`}>
              {fr ? 'Publier directement' : 'Post directly'}
            </button>
          </div>
          {tk.mode === 'draft' && (
            <p className="text-[11px] text-slate-500">{fr
              ? 'La vidéo arrive dans vos notifications TikTok : vous ajoutez sons/effets et publiez depuis l’appli.'
              : 'The video lands in your TikTok notifications: add sounds/effects and post from the app.'}</p>
          )}

          {tk.mode === 'direct' && creator && (
            <div className="space-y-2">
              <label className="block text-xs text-slate-400">{fr ? 'Qui peut voir cette vidéo ? *' : 'Who can view this video? *'}
                <select value={tk.privacy} onChange={(e) => setTk({ ...tk, privacy: e.target.value })}
                  className="mt-1 w-full bg-[#16162A] border border-[#2A2A45] rounded-lg px-2 py-1.5 text-sm text-white">
                  <option value="">{fr ? '— Choisir —' : '— Choose —'}</option>
                  {creator.privacyOptions.map((o) => (
                    <option key={o} value={o} disabled={tk.disclose && tk.brandedContent && o === 'SELF_ONLY'}>
                      {PRIVACY_LABEL[o]?.[fr ? 0 : 1] ?? o}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
                {([['disableComment', 'commentDisabled', 'Commentaires', 'Comments'], ['disableDuet', 'duetDisabled', 'Duo', 'Duet'],
                  ['disableStitch', 'stitchDisabled', 'Collage', 'Stitch']] as const).map(([k, lock, f, e]) => (
                  <label key={k} className={`flex items-center gap-1.5 ${creator[lock] ? 'opacity-40' : ''}`}>
                    <input type="checkbox" className="accent-violet-500" disabled={creator[lock]}
                      checked={!creator[lock] && !tk[k]} onChange={(ev) => setTk({ ...tk, [k]: !ev.target.checked })} />
                    {fr ? `Autoriser : ${f}` : `Allow ${e}`}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="accent-violet-500" checked={tk.disclose}
                  onChange={(e) => setTk({ ...tk, disclose: e.target.checked, brandOrganic: false, brandedContent: false })} />
                {fr ? 'Cette vidéo fait la promotion d’une marque, d’un produit ou d’un service' : 'This video promotes a brand, product or service'}
              </label>
              {tk.disclose && (
                <div className="pl-5 space-y-1 text-xs text-slate-300">
                  <label className="flex items-center gap-2"><input type="checkbox" className="accent-violet-500" checked={tk.brandOrganic}
                    onChange={(e) => setTk({ ...tk, brandOrganic: e.target.checked })} />{fr ? 'Ma marque (contenu promotionnel)' : 'Your brand (promotional content)'}</label>
                  <label className="flex items-center gap-2"><input type="checkbox" className="accent-violet-500" checked={tk.brandedContent}
                    onChange={(e) => setTk({ ...tk, brandedContent: e.target.checked, privacy: e.target.checked && tk.privacy === 'SELF_ONLY' ? '' : tk.privacy })} />
                    {fr ? 'Contenu de marque (partenariat rémunéré)' : 'Branded content (paid partnership)'}</label>
                  {!tk.brandOrganic && !tk.brandedContent && <p className="text-amber-300">{fr ? 'Précisez le type de promotion.' : 'Choose the type of promotion.'}</p>}
                  {(tk.brandOrganic || tk.brandedContent) && (
                    <p className="text-slate-500">{tk.brandedContent
                      ? (fr ? 'La vidéo sera étiquetée « Partenariat rémunéré ».' : 'Your video will be labelled “Paid partnership”.')
                      : (fr ? 'La vidéo sera étiquetée « Contenu promotionnel ».' : 'Your video will be labelled “Promotional content”.')}</p>
                  )}
                </div>
              )}
              <label className="flex items-start gap-2 text-[11px] text-slate-400">
                <input type="checkbox" className="accent-violet-500 mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  {fr ? 'En publiant, vous acceptez la ' : 'By posting, you agree to TikTok’s '}
                  {tk.brandedContent && <><a className="text-violet-400" target="_blank" rel="noreferrer" href="https://www.tiktok.com/legal/page/global/bc-policy/en">{fr ? 'politique de contenu de marque' : 'Branded Content Policy'}</a>{fr ? ' et la ' : ' and '}</>}
                  <a className="text-violet-400" target="_blank" rel="noreferrer" href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en">Music Usage Confirmation</a>
                  {fr ? ' de TikTok. Le traitement de la vidéo peut prendre quelques minutes.' : '. Processing may take a few minutes.'}
                </span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
