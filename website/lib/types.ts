export interface SessionRow {
  id: string;
  user_id: string;
  share_token: string;
  title: string | null;
  storage_key: string;
  size_bytes: number;
  has_video: boolean;
  video_duration_s: number | null;
  screenshot_count: number;
  visibility: "public" | "private";
  uploaded: boolean;
  created_at: string;
  expires_at: string;
  extended_count: number;
  deleted_at: string | null;
}

export interface UploadInitRequest {
  title?: string;
  sizeBytes: number;
  hasVideo: boolean;
  videoDurationS?: number | null;
  screenshotCount: number;
  /** Base64 JPEG data URL for the dashboard preview card. */
  thumbnail?: string;
}

export interface UploadInitResponse {
  id: string;
  shareToken: string;
  storageKey: string;
  uploadUrl: string;
  uploadToken: string;
  viewUrl: string;
}

export interface SharePublicResponse {
  title: string | null;
  hasVideo: boolean;
  videoDurationS: number | null;
  screenshotCount: number;
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
  downloadUrl: string;
}
