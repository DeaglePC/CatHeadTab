package router

import (
	"time"

	"github.com/gin-gonic/gin"

	"github.com/CatHeadTab/backend/internal/cache"
	"github.com/CatHeadTab/backend/internal/config"
	"github.com/CatHeadTab/backend/internal/handler"
	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/CatHeadTab/backend/internal/middleware"
	"github.com/CatHeadTab/backend/internal/model"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/CatHeadTab/backend/internal/service"
)

// Setup configures all API routes and middleware.
func Setup(cfg *config.Config) *gin.Engine {
	r := gin.New()
	r.SetTrustedProxies([]string{
		"127.0.0.1", "::1",
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
	})
	r.Use(logger.GinLogger(), logger.GinRecovery())

	// Global middleware
	r.Use(middleware.CORS())
	r.Use(middleware.DevIPMiddleware())
	r.Use(middleware.APIAccessStats(repository.NewAPIAccessStatsRepository(repository.DB)))

	// Health check (no auth required)
	r.GET("/api/v1/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":           "ok",
			"service":          "CatHeadTab API",
			"version":          "1.0.0",
			"pro_gate_enabled": cfg.ProGateEnabled,
			"ai_configured":    cfg.IsAIConfigured(),
		})
	})

	// Initialize repositories
	userRepo := repository.NewUserRepository(repository.DB)
	layoutRepo := repository.NewLayoutRepository(repository.DB)
	bgRepo := repository.NewBackgroundRepository(repository.DB)
	verifyRepo := repository.NewVerificationRepository(repository.DB)
	oauthRepo := repository.NewOAuthRepository(repository.DB)

	// Initialize services
	emailService := service.NewEmailService(cfg)
	wechatSvc := service.NewWeChatService(cfg)
	wechatSessions := service.NewWeChatSessionStore()

	// Initialize preset repository
	presetRepo := repository.NewPresetRepository(repository.DB)

	// Initialize wallpaper service (provider-based) with two-level cache:
	// L1: in-memory (ristretto, short TTL) for all requests
	// L2: PostgreSQL (long TTL) for slow-changing sorting types (toplist, views, favorites)
	wallhavenProvider := service.NewWallhavenProvider(cfg.WallhavenAPIKey, cfg.WallhavenPurity)
	cosProvider := service.NewCOSProvider(cfg.COSSecretID, cfg.COSSecretKey, cfg.COSBucket, cfg.COSRegion, cfg.COSOriginalPrefix, cfg.COSThumbPrefix)
	wpCacheRepo := repository.NewWallpaperCacheRepository(repository.DB)
	wpCache := cache.NewWallpaperCache(
		cache.WithTTL(cache.DefaultTTL),
		cache.WithMaxEntries(cache.DefaultMaxEntries),
		cache.WithDBStore(wpCacheRepo),
		cache.WithDBTTL(cache.DefaultDBTTL),
	)
	wallpaperSvc := service.NewWallpaperService(wpCache, wallhavenProvider, cosProvider)

	// Start background goroutine to periodically clean up expired tokens
	// (email verifications and used/expired password resets).
	go func() {
		ticker := time.NewTicker(cfg.TokenCleanupInterval)
		defer ticker.Stop()
		for range ticker.C {
			deleted, err := verifyRepo.CleanupExpiredTokens()
			if err != nil {
				logger.Error("[token-cleanup] error", "error", err)
			} else if deleted > 0 {
				logger.Info("[token-cleanup] removed expired tokens", "count", deleted)
			}
		}
	}()

	// Start background goroutine that extends the refresh deadline for stale
	// L2 entries that haven't been accessed recently. Entries accessed via
	// GetOrFetch are refreshed on-the-fly (compare & update); this job catches
	// entries sitting stale without being requested and keeps them alive.
	// Runs every hour, processes up to 100 stale entries per tick.
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			processed, err := wpCache.RefreshStale(wallpaperSvc.FetchFromProvider(), 100)
			if err != nil {
				logger.Error("[wallpaper-cache] refresh error", "error", err)
			} else if processed > 0 {
				logger.Info("[wallpaper-cache] refresh completed", "processed", processed)
			}
		}
	}()

	// Initialize handlers
	authHandler := handler.NewAuthHandler(userRepo, verifyRepo, oauthRepo, emailService, wechatSvc, wechatSessions, cfg)
	bookmarkHandler := handler.NewBookmarkHandler(repository.NewBookmarkRepository())
	layoutHandler := handler.NewLayoutHandler(layoutRepo)
	userHandler := handler.NewUserHandler(userRepo, cfg)
	bgHandler := handler.NewBackgroundHandler(bgRepo)
	presetHandler := handler.NewPresetHandler(presetRepo)
	faviconHandler := handler.NewFaviconHandler(presetRepo)
	wallpaperHandler := handler.NewWallpaperHandler(wallpaperSvc)
	trendingHandler := handler.NewTrendingHandler()
	aiUsageRepo := repository.NewAIUsageRepository(repository.DB)
	aiHandler := handler.NewAIHandler(cfg, aiUsageRepo)
	adminHandler := handler.NewAdminHandler(repository.NewAdminDashboardRepository(repository.DB), wallpaperSvc)

	// Rate limiter for email-sending endpoints (1 request per 60 seconds per IP)
	emailRateLimiter := middleware.NewRateLimiter(60 * time.Second)

	// Rate limiter for resend-verification with exponential backoff:
	// 1 min → 2 min → 4 min → 8 min (cap), resets after 16 min idle
	resendVerifyLimiter := middleware.NewExponentialRateLimiter(1*time.Minute, 8*time.Minute)

	// Rate limiter for login endpoint (max 10 requests per minute per IP + progressive blocking)
	loginRateLimiter := middleware.NewLoginRateLimiter(10)

	// Rate limiter for WeChat verification-code issuance (1 per 3s per IP / user)
	// to avoid code spam. Polling is intentionally unlimited.
	wechatRateLimiter := middleware.NewRateLimiter(3 * time.Second)

	// Rate limiter for AI chat endpoint (RPM + daily token limit)
	aiRateLimiter := middleware.NewAIRateLimiter(cfg.AIRateLimitRPM, cfg.AIDailyTokenLimit, aiUsageRepo)

	// Public routes (no auth) — Preset sites (available to all users)
	r.GET("/api/v1/preset-sites", presetHandler.ListAll)                            // Legacy: returns everything
	r.GET("/api/v1/preset-sites/search", presetHandler.SearchSites)                 // New: search sites by keyword
	r.GET("/api/v1/preset-categories", presetHandler.ListCategories)                // New: categories with site count
	r.GET("/api/v1/preset-categories/:id/sites", presetHandler.ListSitesByCategory) // New: sites for one category

	// Public routes (no auth) — Favicon proxy with disk caching
	r.GET("/api/v1/favicon", faviconHandler.Get)

	// Public routes (no auth) — Wallpaper source browsing (config/providers are public for UI adaptation)
	r.GET("/api/v1/wallpapers/providers", wallpaperHandler.ListProviders)
	r.GET("/api/v1/wallpapers/config", wallpaperHandler.GetConfig)
	// COS image proxy: generates a fresh pre-signed URL and redirects.
	// Public because the redirect target (pre-signed URL) is itself authenticated.
	r.GET("/api/v1/wallpapers/cos/image", wallpaperHandler.COSImage)

	// Public routes (no auth) — Trending/Hot content (cached server-side)
	r.GET("/api/v1/trending/github", trendingHandler.GithubTrending)
	r.GET("/api/v1/trending/bilibili", trendingHandler.BilibiliHot)
	r.GET("/api/v1/trending/xiaohongshu", trendingHandler.XiaohongshuHot)
	r.GET("/api/v1/trending/weibo", trendingHandler.WeiboHot)
	r.GET("/api/v1/trending/bbc", trendingHandler.BBCNews)

	// Public routes (no auth) — Finance data (exchange rates & stock quotes, cached server-side)
	r.GET("/api/v1/weather", trendingHandler.GetWeather)
	r.POST("/api/v1/finance/exchange-rate", trendingHandler.ExchangeRate)
	r.POST("/api/v1/finance/stock-quotes", trendingHandler.StockQuotes)

	// Public routes (no auth) — AI config discovery (frontend needs to know if server-side AI is available)
	r.GET("/api/v1/ai/config", aiHandler.GetConfig)

	// Public routes (no auth)
	auth := r.Group("/api/v1/auth")
	{
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", middleware.LoginRateLimit(loginRateLimiter), authHandler.Login)
		auth.POST("/verify-email", authHandler.VerifyEmail)
		auth.POST("/forgot-password", middleware.EmailRateLimit(emailRateLimiter), authHandler.ForgotPassword)
		auth.POST("/reset-password", authHandler.ResetPassword)
		auth.GET("/oauth-config", authHandler.GetOAuthConfig)
		auth.POST("/resend-verification", middleware.EmailRateLimit(resendVerifyLimiter), authHandler.ResendVerificationPublic)

		// OAuth login (public — user is not yet authenticated)
		auth.POST("/github", authHandler.GitHubLogin)
		auth.POST("/google", authHandler.GoogleLogin)
		// OAuth callback endpoints (GitHub/Google redirect here after authorization)
		auth.GET("/callback/github", authHandler.GitHubOAuthCallback)
		auth.GET("/callback/google", authHandler.GoogleOAuthCallback)

		// WeChat Official Account "follow + verification code" login
		auth.POST("/wechat/login", middleware.EmailRateLimit(wechatRateLimiter), authHandler.WeChatLogin)
		auth.GET("/wechat/poll", authHandler.WeChatPoll)
		// WeChat server callback (configured in 公众号后台 服务器配置). Same path
		// serves GET (URL verification) and POST (message push).
		auth.GET("/wechat/callback", authHandler.WeChatCallback)
		auth.POST("/wechat/callback", authHandler.WeChatCallback)
	}

	// Protected routes (JWT required)
	api := r.Group("/api/v1")
	api.Use(middleware.Auth(cfg.JWTSecret))
	{
		// User profile & preferences (no email verification required — users
		// need to see their profile to trigger verification from the UI)
		user := api.Group("/user")
		{
			user.GET("/profile", userHandler.GetProfile)
			user.GET("/preferences", userHandler.GetPreferences)
			user.PUT("/preferences", userHandler.UpdatePreferences)

			// Account deletion (irreversible; the only exit for single-login accounts)
			user.DELETE("", userHandler.DeleteAccount)

			// Avatar upload/delete (no email verification required)
			user.POST("/avatar", userHandler.UploadAvatar)
			user.DELETE("/avatar", userHandler.DeleteAvatar)

			// Account management (authenticated, no verification required)
			user.POST("/change-password", authHandler.ChangePassword)
			user.POST("/resend-verification", middleware.EmailRateLimit(resendVerifyLimiter), authHandler.ResendVerification)
			user.GET("/linked-accounts", authHandler.GetLinkedAccounts)
			user.POST("/link/github", authHandler.GitHubLinkAccount)
			user.POST("/link/google", authHandler.GoogleLinkAccount)
			// WeChat bind: returns a verification code; the chat message links via the public callback.
			user.POST("/link/wechat", middleware.EmailRateLimit(wechatRateLimiter), authHandler.WeChatLinkStart)
			user.DELETE("/link/:provider", authHandler.UnlinkAccount)
		}

		// Routes below require verified email
		verified := api.Group("")
		verified.Use(middleware.RequireVerified(userRepo))
		{
			// Bookmarks
			bookmarks := verified.Group("/bookmarks")
			{
				bookmarks.GET("", bookmarkHandler.List)
				bookmarks.POST("", bookmarkHandler.Create)
				bookmarks.PUT("/:id", bookmarkHandler.Update)
				bookmarks.DELETE("/:id", bookmarkHandler.Delete)
				bookmarks.POST("/sync", bookmarkHandler.Sync)
			}

			// Desktop Layout
			verified.GET("/layout", layoutHandler.Get)
			verified.PUT("/layout", layoutHandler.Update)

			// Background (upload/download/delete)
			verified.POST("/user/background", bgHandler.Upload)
			verified.GET("/user/background", bgHandler.Download)
			verified.DELETE("/user/background", bgHandler.Delete)

			// Wallpaper search — available to all verified users (search input is admin-only in UI)
			verified.GET("/wallpapers/search", wallpaperHandler.Search)
		}

		// Admin-only routes (JWT + admin role required)
		admin := api.Group("")
		admin.Use(middleware.RequireRole(userRepo, model.RoleAdmin))
		{
			admin.GET("/admin/dashboard", adminHandler.GetDashboard)
			admin.GET("/wallpapers/cache/stats", wallpaperHandler.CacheStats)
		}

		// AI routes (JWT + Pro or Admin role required)
		ai := api.Group("/ai")
		ai.Use(middleware.RequireRole(userRepo, model.RolePro, model.RoleAdmin))
		{
			ai.POST("/chat/completions", middleware.AIRateLimit(aiRateLimiter), aiHandler.Chat)
			ai.GET("/models", aiHandler.Models)
			ai.GET("/usage", aiHandler.GetUsage)
		}
	}

	return r
}
