import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import { google } from 'googleapis';
import { TwitterApi } from 'twitter-api-v2';

export type SocialPlatform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'twitter';

export interface PublishPayload {
  videoPath: string;
  title: string;
  description: string;
  hashtags: string[];
  platforms: SocialPlatform[];
}

export interface PublishResult {
  platform: SocialPlatform;
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

// ── YouTube ───────────────────────────────────────────────────────────────────

async function publishYouTube(payload: PublishPayload): Promise<PublishResult> {
  try {
    const auth = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET
    );
    auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

    const youtube = google.youtube({ version: 'v3', auth });
    const tags = payload.hashtags.map((h) => h.replace('#', ''));

    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: payload.title,
          description: `${payload.description}\n\n${payload.hashtags.join(' ')}`,
          tags,
          categoryId: '22',
          defaultLanguage: 'fr',
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      },
      media: { body: fs.createReadStream(payload.videoPath) },
    });

    const id = res.data.id ?? '';
    return { platform: 'youtube', success: true, postId: id, url: `https://youtube.com/shorts/${id}` };
  } catch (e) {
    return { platform: 'youtube', success: false, error: String(e) };
  }
}

// ── TikTok ────────────────────────────────────────────────────────────────────

async function publishTikTok(payload: PublishPayload): Promise<PublishResult> {
  try {
    const token = process.env.TIKTOK_ACCESS_TOKEN!;

    // Step 1: init upload
    const initRes = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/video/init/',
      { post_info: { title: payload.title, privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false },
        source_info: { source: 'FILE_UPLOAD', video_size: fs.statSync(payload.videoPath).size,
          chunk_size: fs.statSync(payload.videoPath).size, total_chunk_count: 1 } },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const { publish_id, upload_url } = initRes.data.data;

    // Step 2: upload binary
    await axios.put(upload_url, fs.readFileSync(payload.videoPath), {
      headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes 0-${fs.statSync(payload.videoPath).size - 1}/${fs.statSync(payload.videoPath).size}` },
    });

    return { platform: 'tiktok', success: true, postId: publish_id };
  } catch (e) {
    return { platform: 'tiktok', success: false, error: String(e) };
  }
}

// ── Instagram (Reels via Graph API) ──────────────────────────────────────────

async function publishInstagram(payload: PublishPayload): Promise<PublishResult> {
  try {
    const token = process.env.INSTAGRAM_ACCESS_TOKEN!;
    const igId  = process.env.INSTAGRAM_BUSINESS_ID!;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

    // Video must be publicly accessible — serve from /output directory
    const fileName = payload.videoPath.split('/').pop();
    const videoUrl = `${appUrl}/output/${fileName}`;

    const containerRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igId}/media`,
      { media_type: 'REELS', video_url: videoUrl, caption: `${payload.description}\n${payload.hashtags.join(' ')}`, share_to_feed: true },
      { params: { access_token: token } }
    );
    const containerId = containerRes.data.id;

    // Poll until ready (max 30s)
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const status = await axios.get(`https://graph.facebook.com/v19.0/${containerId}`, {
        params: { fields: 'status_code', access_token: token },
      });
      if (status.data.status_code === 'FINISHED') break;
    }

    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${igId}/media_publish`,
      { creation_id: containerId },
      { params: { access_token: token } }
    );

    return { platform: 'instagram', success: true, postId: publishRes.data.id };
  } catch (e) {
    return { platform: 'instagram', success: false, error: String(e) };
  }
}

// ── Facebook ──────────────────────────────────────────────────────────────────

async function publishFacebook(payload: PublishPayload): Promise<PublishResult> {
  try {
    const token  = process.env.FACEBOOK_ACCESS_TOKEN!;
    const pageId = process.env.FACEBOOK_PAGE_ID!;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const fileName = payload.videoPath.split('/').pop();
    const videoUrl = `${appUrl}/output/${fileName}`;

    const res = await axios.post(
      `https://graph.facebook.com/v19.0/${pageId}/videos`,
      { file_url: videoUrl, description: `${payload.description}\n${payload.hashtags.join(' ')}`, title: payload.title },
      { params: { access_token: token } }
    );

    return { platform: 'facebook', success: true, postId: res.data.id };
  } catch (e) {
    return { platform: 'facebook', success: false, error: String(e) };
  }
}

// ── X / Twitter ───────────────────────────────────────────────────────────────

async function publishTwitter(payload: PublishPayload): Promise<PublishResult> {
  try {
    const client = new TwitterApi({
      appKey:       process.env.TWITTER_API_KEY!,
      appSecret:    process.env.TWITTER_API_SECRET!,
      accessToken:  process.env.TWITTER_ACCESS_TOKEN!,
      accessSecret: process.env.TWITTER_ACCESS_SECRET!,
    });

    const mediaId = await client.v1.uploadMedia(payload.videoPath, { mimeType: 'video/mp4' });
    const tweet   = await client.v2.tweet({
      text: `${payload.title}\n${payload.hashtags.slice(0, 5).join(' ')}`,
      media: { media_ids: [mediaId] },
    });

    return { platform: 'twitter', success: true, postId: tweet.data.id };
  } catch (e) {
    return { platform: 'twitter', success: false, error: String(e) };
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export async function publishAll(payload: PublishPayload): Promise<PublishResult[]> {
  const handlers: Record<SocialPlatform, (p: PublishPayload) => Promise<PublishResult>> = {
    youtube:   publishYouTube,
    tiktok:    publishTikTok,
    instagram: publishInstagram,
    facebook:  publishFacebook,
    twitter:   publishTwitter,
  };

  return Promise.all(
    payload.platforms.map((platform) => handlers[platform](payload))
  );
}
