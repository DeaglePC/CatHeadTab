package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"

	"github.com/CatHeadTab/backend/internal/config"
	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/CatHeadTab/backend/internal/middleware"
	"github.com/CatHeadTab/backend/internal/model"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/CatHeadTab/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// usernameRegex 参考 Twitter 规则：4-15 字符，只允许字母、数字、下划线
var usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{4,15}$`)

// emailRegex 基本邮箱格式校验
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

// validateUsername 校验用户名格式
func validateUsername(username string) string {
	if len(username) < 4 {
		return "Username must be at least 4 characters"
	}
	if len(username) > 15 {
		return "Username must be no more than 15 characters"
	}
	if !usernameRegex.MatchString(username) {
		return "Username can only contain letters, numbers, and underscores"
	}
	return ""
}

// validateEmail 校验邮箱格式
func validateEmail(email string) string {
	if len(email) == 0 {
		return "Email is required"
	}
	if len(email) > 254 {
		return "Email address is too long"
	}
	if !emailRegex.MatchString(email) {
		return "Invalid email format"
	}
	return ""
}

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	userRepo       repository.UserRepository
	verifyRepo     repository.VerificationRepository
	oauthRepo      repository.OAuthRepository
	emailService   *service.EmailService
	wechatSvc      *service.WeChatService
	wechatSessions *service.WeChatSessionStore
	cfg            *config.Config
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(
	userRepo repository.UserRepository,
	verifyRepo repository.VerificationRepository,
	oauthRepo repository.OAuthRepository,
	emailService *service.EmailService,
	wechatSvc *service.WeChatService,
	wechatSessions *service.WeChatSessionStore,
	cfg *config.Config,
) *AuthHandler {
	return &AuthHandler{
		userRepo:       userRepo,
		verifyRepo:     verifyRepo,
		oauthRepo:      oauthRepo,
		emailService:   emailService,
		wechatSvc:      wechatSvc,
		wechatSessions: wechatSessions,
		cfg:            cfg,
	}
}

// RegisterInput represents the registration request body.
type RegisterInput struct {
	Email    string `json:"email" binding:"required,email"`
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
}

// Register handles user registration.
// Registration no longer returns a JWT immediately. The user must verify
// their email address before they can log in.
// POST /api/v1/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 校验邮箱格式
	if errMsg := validateEmail(input.Email); errMsg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": errMsg})
		return
	}

	// 校验用户名格式（参考 Twitter：4-15 字符，仅字母/数字/下划线）
	if errMsg := validateUsername(input.Username); errMsg != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": errMsg})
		return
	}

	if user, _ := h.userRepo.GetByEmail(input.Email); user != nil {
		if !user.EmailVerified {
			// Unverified user occupying this email — remove it so re-registration can proceed
			logger.Info("removing unverified user occupying email", "old_user_id", user.ID, "email", input.Email)
			if err := h.userRepo.DeleteByID(user.ID); err != nil {
				logger.Error("failed to remove unverified user by email", "user_id", user.ID, "error", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
				return
			}
		} else {
			c.JSON(http.StatusConflict, gin.H{"error": "Email already in use"})
			return
		}
	}
	if user, _ := h.userRepo.GetByUsername(input.Username); user != nil {
		if !user.EmailVerified {
			// Unverified user occupying this username — remove it so re-registration can proceed
			logger.Info("removing unverified user occupying username", "old_user_id", user.ID, "username", input.Username)
			if err := h.userRepo.DeleteByID(user.ID); err != nil {
				logger.Error("failed to remove unverified user by username", "user_id", user.ID, "error", err)
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
				return
			}
		} else {
			c.JSON(http.StatusConflict, gin.H{"error": "Username already taken"})
			return
		}
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	newUser := &model.User{
		Email:        input.Email,
		Username:     input.Username,
		PasswordHash: string(hashedPassword),
		Role:         model.UserRole(h.cfg.DefaultRoleForNewUser()),
	}

	if err := h.userRepo.Create(newUser); err != nil {
		logger.Error("failed to create user", "email", input.Email, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
		return
	}

	// Send verification email — user must verify before logging in
	verification, err := h.verifyRepo.CreateEmailVerification(newUser.ID, h.cfg.EmailVerifyTokenTTL)
	if err == nil && verification != nil {
		if sendErr := h.emailService.SendVerificationEmail(newUser.Email, verification.Token); sendErr != nil {
			logger.Error("failed to send verification email on register", "user_id", newUser.ID, "email", newUser.Email, "error", sendErr)
		}
	}

	logger.Info("user registered", "user_id", newUser.ID, "email", input.Email)
	c.JSON(http.StatusCreated, gin.H{
		"pending_verification": true,
		"message":              "Registration successful. Please check your email to verify your account before logging in.",
	})
}

// LoginInput represents the login request body.
type LoginInput struct {
	Identifier string `json:"identifier" binding:"required"`
	Password   string `json:"password" binding:"required"`
}

// Login handles user login.
// Users with unverified email addresses cannot log in; they will receive
// a special response that allows the frontend to offer a "resend" action.
// POST /api/v1/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 获取频控相关 context 值
	var limiter *middleware.LoginRateLimiter
	if l, exists := c.Get("loginRateLimiter"); exists {
		limiter, _ = l.(*middleware.LoginRateLimiter)
	}
	ipKey, _ := c.Get("loginIPKey")
	identKey, _ := c.Get("loginIdentKey")

	// recordFailure 在登录失败时记录失败次数
	recordFailure := func() {
		if limiter == nil {
			return
		}
		if k, ok := ipKey.(string); ok {
			limiter.RecordFailure(k)
		}
		if k, ok := identKey.(string); ok {
			limiter.RecordFailure(k)
		}
	}

	// recordSuccess 在登录成功时清除失败记录
	recordSuccess := func() {
		if limiter == nil {
			return
		}
		if k, ok := ipKey.(string); ok {
			limiter.RecordSuccess(k)
		}
		if k, ok := identKey.(string); ok {
			limiter.RecordSuccess(k)
		}
	}

	user, err := h.userRepo.GetByEmail(input.Identifier)
	if user == nil {
		user, err = h.userRepo.GetByUsername(input.Identifier)
	}

	if user == nil || err != nil {
		recordFailure()
		logger.Warn("login failed: user not found", "identifier", input.Identifier)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email/username or password"})
		return
	}

	if user.PasswordHash == "" {
		recordFailure()
		logger.Warn("login failed: SSO-only account", "user_id", user.ID, "identifier", input.Identifier)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "This account uses SSO login. Please sign in with GitHub or Google"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		recordFailure()
		logger.Warn("login failed: wrong password", "user_id", user.ID, "identifier", input.Identifier)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email/username or password"})
		return
	}

	// Block login for unverified email addresses
	if !user.EmailVerified {
		logger.Warn("login failed: email not verified", "user_id", user.ID, "email", user.Email)
		c.JSON(http.StatusForbidden, gin.H{
			"error":              "Email not verified. Please check your inbox and verify your email before logging in.",
			"email_not_verified": true,
			"email":              user.Email,
		})
		return
	}

	token, err := h.generateToken(user.ID.String())
	if err != nil {
		logger.Error("failed to generate token", "user_id", user.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	// 登录成功，清除失败记录
	recordSuccess()
	logger.Info("user logged in", "user_id", user.ID, "identifier", input.Identifier)

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":             user.ID,
			"username":       user.Username,
			"email":          user.Email,
			"email_verified": user.EmailVerified,
			"role":           user.Role,
		},
	})
}

// VerifyEmail validates the email verification token.
// POST /api/v1/auth/verify-email
func (h *AuthHandler) VerifyEmail(c *gin.Context) {
	var input struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	logger.Debug("verify email request", "token_length", len(input.Token), "token_prefix", input.Token[:min(16, len(input.Token))], "now", time.Now().Format(time.RFC3339))
	verification, err := h.verifyRepo.GetEmailVerification(input.Token)
	if err != nil {
		logger.Error("verify email DB error", "error", err)
	}
	if err != nil || verification == nil {
		logger.Warn("verify email failed: invalid or expired token", "token_prefix", input.Token[:min(16, len(input.Token))])
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired verification token"})
		return
	}

	logger.Debug("verify email token found", "user_id", verification.UserID, "expires_at", verification.ExpiresAt.Format(time.RFC3339), "now", time.Now().Format(time.RFC3339))

	if err := h.userRepo.SetEmailVerified(verification.UserID, true); err != nil {
		logger.Error("failed to set email verified", "user_id", verification.UserID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify email"})
		return
	}

	_ = h.verifyRepo.DeleteEmailVerifications(verification.UserID)

	logger.Info("email verified", "user_id", verification.UserID)
	c.JSON(http.StatusOK, gin.H{"message": "Email verified successfully"})
}

// ResendVerification resends the email verification link.
// POST /api/v1/user/resend-verification (authenticated)
func (h *AuthHandler) ResendVerification(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	user, err := h.userRepo.GetByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if user.EmailVerified {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Email already verified"})
		return
	}

	verification, err := h.verifyRepo.CreateEmailVerification(user.ID, h.cfg.EmailVerifyTokenTTL)
	if err != nil {
		logger.Error("failed to create verification token", "user_id", user.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create verification token"})
		return
	}

	if err := h.emailService.SendVerificationEmail(user.Email, verification.Token); err != nil {
		logger.Error("failed to send verification email", "user_id", user.ID, "email", user.Email, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to send verification email"})
		return
	}

	logger.Info("verification email resent", "user_id", user.ID, "email", user.Email)
	c.JSON(http.StatusOK, gin.H{"message": "Verification email sent"})
}

// ResendVerificationPublic resends the email verification link without requiring
// authentication. This allows users who registered but haven't verified yet to
// request a new verification email from the login screen.
// POST /api/v1/auth/resend-verification
func (h *AuthHandler) ResendVerificationPublic(c *gin.Context) {
	var input struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Always return success to prevent email enumeration
	user, _ := h.userRepo.GetByEmail(input.Email)
	if user == nil {
		c.JSON(http.StatusOK, gin.H{"message": "If an account exists with that email, a verification link has been sent"})
		return
	}

	if user.EmailVerified {
		c.JSON(http.StatusOK, gin.H{"message": "If an account exists with that email, a verification link has been sent"})
		return
	}

	verification, err := h.verifyRepo.CreateEmailVerification(user.ID, h.cfg.EmailVerifyTokenTTL)
	if err != nil {
		logger.Error("failed to create verification token (public)", "user_id", user.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create verification token"})
		return
	}

	if sendErr := h.emailService.SendVerificationEmail(user.Email, verification.Token); sendErr != nil {
		logger.Error("failed to send verification email (public resend)", "user_id", user.ID, "email", user.Email, "error", sendErr)
	}

	logger.Info("verification email resent (public)", "email", input.Email)
	c.JSON(http.StatusOK, gin.H{"message": "If an account exists with that email, a verification link has been sent"})
}

// ForgotPasswordInput represents the forgot password request body.
type ForgotPasswordInput struct {
	Email string `json:"email" binding:"required,email"`
}

// ForgotPassword sends a password reset email.
// POST /api/v1/auth/forgot-password
func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var input ForgotPasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Always return success to prevent email enumeration
	user, _ := h.userRepo.GetByEmail(input.Email)
	if user == nil {
		logger.Debug("forgot password: email not found", "email", input.Email)
		c.JSON(http.StatusOK, gin.H{"message": "If an account exists with that email, a reset link has been sent"})
		return
	}

	reset, err := h.verifyRepo.CreatePasswordReset(user.ID, h.cfg.PasswordResetTokenTTL)
	if err != nil {
		logger.Error("failed to create password reset token", "user_id", user.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create reset token"})
		return
	}

	if sendErr := h.emailService.SendPasswordResetEmail(user.Email, reset.Token); sendErr != nil {
		logger.Error("failed to send password reset email", "user_id", user.ID, "email", user.Email, "error", sendErr)
	}

	logger.Info("password reset email sent", "user_id", user.ID, "email", user.Email)
	c.JSON(http.StatusOK, gin.H{"message": "If an account exists with that email, a reset link has been sent"})
}

// ResetPasswordInput represents the password reset request body.
type ResetPasswordInput struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"new_password" binding:"required,min=6"`
}

// ResetPassword resets user password with a valid token.
// POST /api/v1/auth/reset-password
func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var input ResetPasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	reset, err := h.verifyRepo.GetPasswordReset(input.Token)
	if err != nil || reset == nil {
		logger.Warn("reset password failed: invalid or expired token")
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid or expired reset token"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		logger.Error("failed to hash password", "user_id", reset.UserID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	if err := h.userRepo.UpdatePassword(reset.UserID, string(hashedPassword)); err != nil {
		logger.Error("failed to update password", "user_id", reset.UserID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	_ = h.verifyRepo.MarkPasswordResetUsed(input.Token)

	logger.Info("password reset successfully", "user_id", reset.UserID)
	c.JSON(http.StatusOK, gin.H{"message": "Password reset successfully"})
}

// ChangePasswordInput represents the change password request body.
type ChangePasswordInput struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required,min=6"`
}

// ChangePassword changes the logged-in user's password.
// POST /api/v1/user/change-password
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var input ChangePasswordInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	user, err := h.userRepo.GetByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if user.PasswordHash == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This account uses SSO login and has no password set"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.CurrentPassword)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Current password is incorrect"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to hash password"})
		return
	}

	if err := h.userRepo.UpdatePassword(userID, string(hashedPassword)); err != nil {
		logger.Error("failed to update password", "user_id", userID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update password"})
		return
	}

	logger.Info("password changed", "user_id", userID)
	c.JSON(http.StatusOK, gin.H{"message": "Password changed successfully"})
}

// ---- GitHub OAuth ----

// GitHubLogin handles GitHub OAuth callback.
// POST /api/v1/auth/github
func (h *AuthHandler) GitHubLogin(c *gin.Context) {
	var input struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.cfg.GitHubClientID == "" || h.cfg.GitHubClientSecret == "" {
		logger.Warn("GitHub OAuth not configured")
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "GitHub OAuth not configured"})
		return
	}

	// Exchange code for access token
	accessToken, err := h.exchangeGitHubCode(input.Code)
	if err != nil {
		logger.Error("GitHub code exchange failed", "error", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to authenticate with GitHub"})
		return
	}

	// Get GitHub user info
	ghUser, err := h.getGitHubUser(accessToken)
	if err != nil {
		logger.Error("failed to get GitHub user info", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get GitHub user info"})
		return
	}

	h.handleOAuthLogin(c, "github", ghUser.ID, ghUser.Email, ghUser.Login, ghUser.AvatarURL, accessToken, "")
}

// GitHubLinkAccount links GitHub to an existing logged-in user.
// POST /api/v1/user/link/github
func (h *AuthHandler) GitHubLinkAccount(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var input struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	accessToken, err := h.exchangeGitHubCode(input.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to authenticate with GitHub"})
		return
	}

	ghUser, err := h.getGitHubUser(accessToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get GitHub user info"})
		return
	}

	h.linkOAuthAccount(c, userID, "github", ghUser.ID, ghUser.Email, ghUser.Login, ghUser.AvatarURL, accessToken, "")
}

// ---- Google OAuth ----

// GoogleLogin handles Google OAuth callback.
// POST /api/v1/auth/google
func (h *AuthHandler) GoogleLogin(c *gin.Context) {
	var input struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.cfg.GoogleClientID == "" || h.cfg.GoogleClientSecret == "" {
		logger.Warn("Google OAuth not configured")
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Google OAuth not configured"})
		return
	}

	accessToken, err := h.exchangeGoogleCode(input.Code)
	if err != nil {
		logger.Error("Google code exchange failed", "error", err)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to authenticate with Google"})
		return
	}

	gUser, err := h.getGoogleUser(accessToken)
	if err != nil {
		logger.Error("failed to get Google user info", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get Google user info"})
		return
	}

	h.handleOAuthLogin(c, "google", gUser.ID, gUser.Email, gUser.Name, gUser.Picture, accessToken, "")
}

// GoogleLinkAccount links Google to an existing logged-in user.
// POST /api/v1/user/link/google
func (h *AuthHandler) GoogleLinkAccount(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var input struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	accessToken, err := h.exchangeGoogleCode(input.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to authenticate with Google"})
		return
	}

	gUser, err := h.getGoogleUser(accessToken)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get Google user info"})
		return
	}

	h.linkOAuthAccount(c, userID, "google", gUser.ID, gUser.Email, gUser.Name, gUser.Picture, accessToken, "")
}

// GetLinkedAccounts returns the user's linked OAuth accounts.
// GET /api/v1/user/linked-accounts
func (h *AuthHandler) GetLinkedAccounts(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	accounts, err := h.oauthRepo.ListByUserID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get linked accounts"})
		return
	}

	result := make([]gin.H, 0, len(accounts))
	for _, a := range accounts {
		result = append(result, gin.H{
			"provider":          a.Provider,
			"provider_username": a.ProviderUsername,
			"provider_email":    a.ProviderEmail,
			"avatar_url":        a.AvatarURL,
			"linked_at":         a.LinkedAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{"accounts": result})
}

// UnlinkAccount removes a linked OAuth provider.
// DELETE /api/v1/user/link/:provider
func (h *AuthHandler) UnlinkAccount(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)
	provider := c.Param("provider")

	// Ensure user has a password or at least one other linked account before unlinking
	user, _ := h.userRepo.GetByID(userID)
	accounts, _ := h.oauthRepo.ListByUserID(userID)

	hasPassword := user != nil && user.PasswordHash != ""
	otherAccounts := 0
	for _, a := range accounts {
		if a.Provider != provider {
			otherAccounts++
		}
	}

	if !hasPassword && otherAccounts == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot unlink the only login method. Set a password first"})
		return
	}

	if err := h.oauthRepo.Delete(userID, provider); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unlink account"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("%s account unlinked", provider)})
}

// GetOAuthConfig returns the configured OAuth client IDs and callback URL for the frontend.
// GET /api/v1/auth/oauth-config
func (h *AuthHandler) GetOAuthConfig(c *gin.Context) {
	backendURL := h.cfg.GetBackendURL()
	c.JSON(http.StatusOK, gin.H{
		"github_client_id":   h.cfg.GitHubClientID,
		"google_client_id":   h.cfg.GoogleClientID,
		"oauth_callback_url": backendURL + "/api/v1/auth/callback",
		"wechat_enabled":     h.cfg.IsWeChatConfigured(),
	})
}

// oauthCallbackHTML is the HTML page served after OAuth provider redirects back.
// It uses postMessage to send the authorization code and provider back to the
// opener window (works for both web pages and Chrome extension popups).
const oauthCallbackHTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>OAuth Callback</title></head>
<body style="background:#1c1c1e;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
<div style="width:32px;height:32px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:s 1s linear infinite;margin:0 auto 16px"></div>
<p style="color:rgba(255,255,255,.6);font-size:14px">Authenticating...</p>
</div>
<style>@keyframes s{to{transform:rotate(360deg)}}</style>
<script>
(function(){
  var params = new URLSearchParams(window.location.search);
  var code = params.get("code");
  var state = params.get("state") || "";
  if (code && window.opener) {
    window.opener.postMessage({type:"oauth_callback",code:code,provider:state.replace("link_","")}, "*");
  }
  setTimeout(function(){ window.close(); }, 800);
})();
</script>
</body>
</html>`

// GitHubOAuthCallback handles the redirect from GitHub after user authorization.
// GET /api/v1/auth/callback/github
func (h *AuthHandler) GitHubOAuthCallback(c *gin.Context) {
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(oauthCallbackHTML))
}

// GoogleOAuthCallback handles the redirect from Google after user authorization.
// GET /api/v1/auth/callback/google
func (h *AuthHandler) GoogleOAuthCallback(c *gin.Context) {
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(oauthCallbackHTML))
}

// ---- Shared OAuth logic ----

func (h *AuthHandler) handleOAuthLogin(c *gin.Context, provider, providerUserID, email, username, avatarURL, accessToken, refreshToken string) {
	// Check if this OAuth account is already linked
	existing, _ := h.oauthRepo.GetByProviderAndID(provider, providerUserID)
	if existing != nil {
		// User exists — log in
		_ = h.oauthRepo.UpdateTokens(existing.ID, accessToken, refreshToken)

		user, _ := h.userRepo.GetByID(existing.UserID)
		if user == nil {
			logger.Error("OAuth linked user not found", "provider", provider, "provider_user_id", providerUserID)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Linked user not found"})
			return
		}

		token, err := h.generateToken(user.ID.String())
		if err != nil {
			logger.Error("failed to generate token for OAuth user", "user_id", user.ID, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
			return
		}

		logger.Info("OAuth login", "provider", provider, "user_id", user.ID, "email", user.Email)

		c.JSON(http.StatusOK, gin.H{
			"token": token,
			"user": gin.H{
				"id":             user.ID,
				"username":       user.Username,
				"email":          user.Email,
				"email_verified": user.EmailVerified,
				"avatar_url":     user.AvatarURL,
				"role":           user.Role,
			},
		})
		return
	}

	// Check if user exists with this email
	var user *model.User
	if email != "" {
		user, _ = h.userRepo.GetByEmail(email)
	}

	if user == nil {
		// Create new user
		displayName := username
		if displayName == "" {
			displayName = fmt.Sprintf("%s_user", provider)
		}

		user = &model.User{
			Email:         email,
			Username:      h.ensureUniqueUsername(displayName),
			AvatarURL:     avatarURL,
			EmailVerified: email != "",
			Role:          model.UserRole(h.cfg.DefaultRoleForNewUser()),
		}
		if err := h.userRepo.Create(user); err != nil {
			logger.Error("failed to create OAuth user", "provider", provider, "email", email, "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user"})
			return
		}
		logger.Info("OAuth new user created", "provider", provider, "user_id", user.ID, "email", email)
	}

	// Link OAuth account
	oauthAccount := &model.OAuthAccount{
		UserID:           user.ID,
		Provider:         provider,
		ProviderUserID:   providerUserID,
		ProviderEmail:    email,
		ProviderUsername: username,
		AvatarURL:        avatarURL,
		AccessToken:      accessToken,
		RefreshToken:     refreshToken,
	}
	if err := h.oauthRepo.Create(oauthAccount); err != nil {
		logger.Error("failed to link OAuth account", "provider", provider, "user_id", user.ID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to link OAuth account"})
		return
	}

	// Update user avatar if empty
	if user.AvatarURL == "" && avatarURL != "" {
		_ = h.userRepo.UpdateAvatar(user.ID, avatarURL)
		user.AvatarURL = avatarURL
	}

	// If the user's email matches the OAuth email and isn't verified yet,
	// mark it as verified — the OAuth provider (GitHub/Google) has already
	// confirmed the email address.
	if !user.EmailVerified && email != "" && user.Email == email {
		_ = h.userRepo.SetEmailVerified(user.ID, true)
		user.EmailVerified = true
		logger.Info("auto-verified email via OAuth", "user_id", user.ID, "provider", provider, "email", email)
	}

	token, err := h.generateToken(user.ID.String())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":             user.ID,
			"username":       user.Username,
			"email":          user.Email,
			"email_verified": user.EmailVerified,
			"avatar_url":     user.AvatarURL,
			"role":           user.Role,
		},
	})
}

func (h *AuthHandler) linkOAuthAccount(c *gin.Context, userID uuid.UUID, provider, providerUserID, email, username, avatarURL, accessToken, refreshToken string) {
	// Check if already linked to someone else
	existing, _ := h.oauthRepo.GetByProviderAndID(provider, providerUserID)
	if existing != nil {
		if existing.UserID == userID {
			c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("%s account already linked", provider)})
			return
		}
		c.JSON(http.StatusConflict, gin.H{"error": fmt.Sprintf("This %s account is already linked to another user", provider)})
		return
	}

	oauthAccount := &model.OAuthAccount{
		UserID:           userID,
		Provider:         provider,
		ProviderUserID:   providerUserID,
		ProviderEmail:    email,
		ProviderUsername: username,
		AvatarURL:        avatarURL,
		AccessToken:      accessToken,
		RefreshToken:     refreshToken,
	}

	if err := h.oauthRepo.Create(oauthAccount); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to link account"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": fmt.Sprintf("%s account linked successfully", provider)})
}

func (h *AuthHandler) ensureUniqueUsername(base string) string {
	username := base
	attempt := 0
	for {
		existing, _ := h.userRepo.GetByUsername(username)
		if existing == nil {
			return username
		}
		attempt++
		username = fmt.Sprintf("%s_%d", base, attempt)
	}
}

// ---- GitHub API helpers ----

type githubTokenResponse struct {
	AccessToken string `json:"access_token"`
}

type githubUser struct {
	ID        string `json:"id"`
	Login     string `json:"login"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

func (h *AuthHandler) exchangeGitHubCode(code string) (string, error) {
	req, _ := http.NewRequest("POST", "https://github.com/login/oauth/access_token", nil)
	q := req.URL.Query()
	q.Add("client_id", h.cfg.GitHubClientID)
	q.Add("client_secret", h.cfg.GitHubClientSecret)
	q.Add("code", code)
	req.URL.RawQuery = q.Encode()
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("github token exchange failed: %w", err)
	}
	defer resp.Body.Close()

	var tokenResp githubTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode github token: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("empty access token from github")
	}

	return tokenResp.AccessToken, nil
}

func (h *AuthHandler) getGitHubUser(accessToken string) (*githubUser, error) {
	req, _ := http.NewRequest("GET", "https://api.github.com/user", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	// GitHub returns id as integer, we need it as string
	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}

	user := &githubUser{
		ID:        fmt.Sprintf("%v", raw["id"]),
		Login:     fmt.Sprintf("%v", raw["login"]),
		AvatarURL: fmt.Sprintf("%v", raw["avatar_url"]),
	}

	if email, ok := raw["email"].(string); ok {
		user.Email = email
	}

	// If email is empty, try to get from /user/emails
	if user.Email == "" {
		user.Email = h.getGitHubPrimaryEmail(accessToken)
	}

	return user, nil
}

func (h *AuthHandler) getGitHubPrimaryEmail(accessToken string) string {
	req, _ := http.NewRequest("GET", "https://api.github.com/user/emails", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var emails []struct {
		Email    string `json:"email"`
		Primary  bool   `json:"primary"`
		Verified bool   `json:"verified"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return ""
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email
		}
	}
	return ""
}

// ---- Google API helpers ----

type googleTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type googleUser struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func (h *AuthHandler) exchangeGoogleCode(code string) (string, error) {
	req, _ := http.NewRequest("POST", "https://oauth2.googleapis.com/token", nil)
	q := req.URL.Query()
	q.Add("client_id", h.cfg.GoogleClientID)
	q.Add("client_secret", h.cfg.GoogleClientSecret)
	q.Add("code", code)
	q.Add("grant_type", "authorization_code")
	q.Add("redirect_uri", h.cfg.GetBackendURL()+"/api/v1/auth/callback/google")
	req.URL.RawQuery = q.Encode()
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("google token exchange failed: %w", err)
	}
	defer resp.Body.Close()

	var tokenResp googleTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("failed to decode google token: %w", err)
	}

	if tokenResp.AccessToken == "" {
		return "", fmt.Errorf("empty access token from google")
	}

	return tokenResp.AccessToken, nil
}

func (h *AuthHandler) getGoogleUser(accessToken string) (*googleUser, error) {
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var user googleUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}

	return &user, nil
}

func (h *AuthHandler) generateToken(userID string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(h.cfg.JWTTokenTTL).Unix(),
	})
	return token.SignedString([]byte(h.cfg.JWTSecret))
}
