package config

import (
	"os"
	"strconv"
	"time"
)

// Config holds the application configuration loaded from environment variables.
type Config struct {
	DBDSN     string
	JWTSecret string
	Port      string
	GinMode   string

	// Frontend URL for building callback links (email verification, password reset)
	FrontendURL string

	// BackendURL is the externally accessible base URL of this backend server.
	// Used as the OAuth redirect_uri so that GitHub/Google always callback to
	// the backend regardless of where the frontend is hosted (web or extension).
	BackendURL string

	// SMTP email settings
	SMTPHost     string
	SMTPPort     string
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
	// SMTPSSL enables implicit TLS (port 465). When false, uses STARTTLS (port 587).
	SMTPSSL bool

	// GitHub OAuth
	GitHubClientID     string
	GitHubClientSecret string

	// Google OAuth
	GoogleClientID     string
	GoogleClientSecret string

	// WeChat Official Account (公众号) login via "follow + verification code".
	// The flow is fully passive (the backend never calls outbound WeChat APIs),
	// so it works on personal UNVERIFIED subscription accounts. Setting
	// WeChatToken enables it. AESKey is only needed for 安全/兼容 message mode.
	WeChatAppID string
	// WeChatToken is the Token configured in the Official Account "服务器配置".
	// Used to verify the signature of callbacks from WeChat servers.
	WeChatToken string
	// WeChatAESKey is the 43-character EncodingAESKey from "服务器配置".
	// Required for encrypted (安全/兼容) message mode; empty means 明文 (plaintext) mode.
	WeChatAESKey string
	// WeChatQRImageURL is a URL to the Official Account's permanent QR image
	// (downloaded from the 公众号后台) shown to users so they can follow. Optional.
	WeChatQRImageURL string
	// WeChatAccountName is the Official Account's display name, shown as a
	// fallback / hint so users can search for it. Optional.
	WeChatAccountName string

	// Wallpaper source: Wallhaven
	WallhavenAPIKey string
	// WallhavenPurity controls the allowed purity levels for wallhaven results.
	// Comma-separated values: "sfw", "sketchy". Default: "sfw".
	// "sketchy" requires a valid API key to work on wallhaven.cc.
	WallhavenPurity string

	// Wallpaper source: Tencent Cloud COS (Cloud Object Storage)
	// When all four fields are set, the COS wallpaper provider becomes available.
	COSSecretID  string
	COSSecretKey string
	COSBucket    string
	COSRegion    string
	// COSOriginalPrefix is the key prefix for full-size wallpaper images (e.g. "0000-c/").
	COSOriginalPrefix string
	// COSThumbPrefix is the key prefix for thumbnail images (e.g. "0000-s/").
	// Thumbnail filenames must match the originals exactly.
	COSThumbPrefix string

	// Token TTL settings
	// EmailVerifyTokenTTL controls how long email verification tokens remain valid.
	EmailVerifyTokenTTL time.Duration
	// PasswordResetTokenTTL controls how long password reset tokens remain valid. Default: 5 minutes.
	PasswordResetTokenTTL time.Duration
	// JWTTokenTTL controls how long JWT login tokens remain valid.
	JWTTokenTTL time.Duration
	// TokenCleanupInterval controls how often expired tokens are purged from the database.
	TokenCleanupInterval time.Duration

	// Pro membership gating
	// ProGateEnabled controls whether Pro role gating is enforced.
	// When false (default), all users have full access to Pro features (e.g. AI assistant).
	// When true, only users with role "pro" or "admin" can access Pro features.
	// Set to "true" for SaaS deployments; leave unset for self-hosted/open-source.
	ProGateEnabled bool
	// ProFreeUntil is an optional ISO 8601 datetime (e.g. "2026-06-01T00:00:00Z").
	// Users who register before this time automatically receive the "pro" role.
	// Leave empty to disable the promotion window.
	ProFreeUntil time.Time

	// Logging configuration
	// LogLevel controls the minimum log level: debug, info, warn, error. Default: info.
	LogLevel string
	// LogFile is the path to the log file. Leave empty to disable file logging (console only).
	LogFile string
	// LogMaxSize is the maximum size in MB of a single log file before rotation. Default: 100.
	LogMaxSize int
	// LogMaxAge is the maximum number of days to retain old log files. Default: 30.
	LogMaxAge int
	// LogMaxBackups is the maximum number of old log files to retain. Default: 10.
	LogMaxBackups int
	// LogCompress enables gzip compression for rotated log files. Default: false.
	LogCompress bool

	// Server-side AI configuration (optional).
	// When configured, Pro/Admin users can use AI features without their own API Key.
	// AIProvider is a label for the provider (e.g. "openai", "deepseek"). Informational only.
	AIProvider string
	// AIBaseURL is the OpenAI-compatible API base URL (e.g. "https://api.openai.com/v1").
	AIBaseURL string
	// AIAPIKey is the API key for the configured AI provider.
	AIAPIKey string
	// AIModel is the model identifier (e.g. "gpt-4o-mini", "deepseek-chat").
	AIModel string
	// AIRateLimitRPM is the max requests per minute per user for AI chat. Default: 20.
	AIRateLimitRPM int
	// AIDailyTokenLimit is the max total tokens per user per day. 0 = unlimited. Default: 100000.
	AIDailyTokenLimit int
}

// Load reads configuration from environment variables with sensible defaults.
func Load() *Config {
	return &Config{
		DBDSN:     getEnv("DB_DSN", "postgres://catheadtab:secretpassword@localhost:5432/catheadtab?sslmode=disable"),
		JWTSecret: getEnv("JWT_SECRET", "dev-secret-change-me"),
		Port:      getEnv("PORT", "8080"),
		GinMode:   getEnv("GIN_MODE", "debug"),

		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:5173"),
		BackendURL:  getEnv("BACKEND_URL", ""),

		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnv("SMTP_PORT", "587"),
		SMTPUser:     getEnv("SMTP_USER", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		SMTPFrom:     getEnv("SMTP_FROM", "noreply@catheadtab.com"),
		SMTPSSL:      getEnv("SMTP_SSL", "") == "true",

		GitHubClientID:     getEnv("GITHUB_CLIENT_ID", ""),
		GitHubClientSecret: getEnv("GITHUB_CLIENT_SECRET", ""),

		GoogleClientID:     getEnv("GOOGLE_CLIENT_ID", ""),
		GoogleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),

		WeChatAppID:       getEnv("WECHAT_APP_ID", ""),
		WeChatToken:       getEnv("WECHAT_TOKEN", ""),
		WeChatAESKey:      getEnv("WECHAT_AES_KEY", ""),
		WeChatQRImageURL:  getEnv("WECHAT_QR_IMAGE_URL", ""),
		WeChatAccountName: getEnv("WECHAT_ACCOUNT_NAME", ""),

		WallhavenAPIKey: getEnv("WALLHAVEN_API_KEY", ""),
		WallhavenPurity: getEnv("WALLHAVEN_PURITY", "sfw"),

		COSSecretID:       getEnv("COS_SECRET_ID", ""),
		COSSecretKey:      getEnv("COS_SECRET_KEY", ""),
		COSBucket:         getEnv("COS_BUCKET", ""),
		COSRegion:         getEnv("COS_REGION", ""),
		COSOriginalPrefix: getEnv("COS_ORIGINAL_PREFIX", ""),
		COSThumbPrefix:    getEnv("COS_THUMB_PREFIX", ""),

		EmailVerifyTokenTTL:   getDurationEnv("EMAIL_VERIFY_TOKEN_TTL_HOURS", 24) * time.Hour,
		PasswordResetTokenTTL: getDurationEnv("PASSWORD_RESET_TOKEN_TTL_MINUTES", 5) * time.Minute,
		JWTTokenTTL:           getDurationEnv("JWT_TOKEN_TTL_DAYS", 30) * 24 * time.Hour,
		TokenCleanupInterval:  getDurationEnv("TOKEN_CLEANUP_INTERVAL_HOURS", 6) * time.Hour,

		ProGateEnabled: getEnv("PRO_GATE_ENABLED", "") == "true",
		ProFreeUntil:   parseTimeEnv("PRO_FREE_UNTIL"),

		LogLevel:      getEnv("LOG_LEVEL", "info"),
		LogFile:       getEnv("LOG_FILE", ""),
		LogMaxSize:    int(getDurationEnv("LOG_MAX_SIZE_MB", 100)),
		LogMaxAge:     int(getDurationEnv("LOG_MAX_AGE_DAYS", 30)),
		LogMaxBackups: int(getDurationEnv("LOG_MAX_BACKUPS", 10)),
		LogCompress:   getEnv("LOG_COMPRESS", "") == "true",

		AIProvider: getEnv("AI_PROVIDER", ""),
		AIBaseURL:  getEnv("AI_BASE_URL", ""),
		AIAPIKey:   getEnv("AI_API_KEY", ""),
		AIModel:    getEnv("AI_MODEL", ""),
		AIRateLimitRPM:    int(getDurationEnv("AI_RATE_LIMIT_RPM", 20)),
		AIDailyTokenLimit: int(getDurationEnv("AI_DAILY_TOKEN_LIMIT", 100000)),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// GetBackendURL returns the externally accessible base URL of the backend.
// If BACKEND_URL is not explicitly set, it falls back to http://localhost:{Port}.
func (c *Config) GetBackendURL() string {
	if c.BackendURL != "" {
		return c.BackendURL
	}
	return "http://localhost:" + c.Port
}

// getDurationEnv reads an integer from the environment variable identified by
// key and returns it as a time.Duration. If the variable is not set or cannot
// be parsed, fallback is returned.
func getDurationEnv(key string, fallback int) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return time.Duration(fallback)
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return time.Duration(fallback)
	}
	return time.Duration(n)
}

// parseTimeEnv reads an ISO 8601 datetime from an environment variable.
// Returns zero time if the variable is not set or cannot be parsed.
func parseTimeEnv(key string) time.Time {
	v := os.Getenv(key)
	if v == "" {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339, v)
	if err != nil {
		// Try without timezone suffix (e.g. "2026-06-01T00:00:00")
		t, err = time.Parse("2006-01-02T15:04:05", v)
		if err != nil {
			// Try date-only (e.g. "2026-06-01")
			t, err = time.Parse("2006-01-02", v)
			if err != nil {
				return time.Time{}
			}
		}
	}
	return t
}

// IsProFreeNow reports whether the current time is within the free Pro
// promotion window (i.e. ProFreeUntil is set and has not passed yet).
func (c *Config) IsProFreeNow() bool {
	if c.ProFreeUntil.IsZero() {
		return false
	}
	return time.Now().Before(c.ProFreeUntil)
}

// DefaultRoleForNewUser returns the role that should be assigned to newly
// registered users. Returns "pro" during the free promotion window,
// otherwise "user".
func (c *Config) DefaultRoleForNewUser() string {
	if c.IsProFreeNow() {
		return string("pro")
	}
	return string("user")
}

// IsAIConfigured returns true if server-side AI is configured.
func (c *Config) IsAIConfigured() bool {
	return c.AIBaseURL != "" && c.AIAPIKey != ""
}

// IsWeChatConfigured reports whether WeChat Official Account login is available.
// Only the callback Token is required (the flow is passive); AppID/AESKey are
// optional and only used for 安全/兼容 encrypted message mode.
func (c *Config) IsWeChatConfigured() bool {
	return c.WeChatToken != ""
}
