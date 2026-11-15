-- Synthia: per-user projects (ownership of every job), brand kit, monthly quota period.
CREATE TABLE IF NOT EXISTS projects (
  id              VARCHAR(64)  NOT NULL PRIMARY KEY,
  user_id         INT          NOT NULL,
  mode            ENUM('ai','manual','narration') NOT NULL DEFAULT 'ai',
  title           VARCHAR(255) NULL,
  script          MEDIUMTEXT   NULL,
  hashtags        TEXT         NULL,
  status          ENUM('draft','rendering','ready','failed') NOT NULL DEFAULT 'draft',
  output_file     VARCHAR(255) NULL,
  thumb_file      VARCHAR(255) NULL,
  duration        INT          NULL,
  resolution      VARCHAR(16)  NULL,
  file_size       BIGINT       NULL,
  error           TEXT         NULL,
  platforms       TEXT         NULL,
  scheduled_at    DATETIME     NULL,
  publish_status  ENUM('none','scheduled','publishing','published','failed') NOT NULL DEFAULT 'none',
  publish_results TEXT         NULL,
  counted         TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_projects_user (user_id, created_at),
  KEY idx_projects_due (publish_status, scheduled_at),
  CONSTRAINT fk_projects_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS brand_kits (
  user_id         INT          NOT NULL PRIMARY KEY,
  watermark       VARCHAR(60)  NULL,
  caption_style   VARCHAR(20)  NOT NULL DEFAULT 'box',
  default_lang    VARCHAR(5)   NOT NULL DEFAULT 'fr',
  default_format  VARCHAR(16)  NOT NULL DEFAULT '1080x1920',
  default_voice   VARCHAR(64)  NULL,
  tone            VARCHAR(255) NULL,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_brand_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE users ADD COLUMN IF NOT EXISTS period_start DATE NULL;
