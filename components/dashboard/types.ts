export interface ProjectDto {
  id: string; mode: 'ai' | 'manual' | 'narration'; title: string | null; script: string | null;
  hashtags: string[]; status: 'draft' | 'rendering' | 'ready' | 'failed'; outputFile: string | null;
  thumbFile: string | null; duration: number | null; resolution: string | null; fileSize: number | null;
  error: string | null; platforms: string[]; scheduledAt: string | null;
  publishStatus: 'none' | 'scheduled' | 'publishing' | 'published' | 'failed'; createdAt: string;
  publishResults?: unknown;
}
