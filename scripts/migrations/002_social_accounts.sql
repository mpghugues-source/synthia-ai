-- Synthia: social accounts connected by each user (OAuth), tokens encrypted with SOCIAL_TOKEN_KEY.
CREATE TABLE IF NOT EXISTS social_accounts (
  id                 INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id            INT          NOT NULL,
  platform           VARCHAR(20)  NOT NULL,
  external_id        VARCHAR(128) NOT NULL,
  display_name       VARCHAR(255) NULL,
  avatar_url         VARCHAR(1024) NULL,
  access_token_enc   TEXT         NOT NULL,
  refresh_token_enc  TEXT         NULL,
  expires_at         DATETIME     NULL,
  refresh_expires_at DATETIME     NULL,
  scope              VARCHAR(512) NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_social_user_platform (user_id, platform),
  CONSTRAINT fk_social_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-publication choices (YouTube privacy, TikTok privacy/mode/interactions), kept for scheduled posts.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS publish_options TEXT NULL;
