package handler

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"

	"github.com/CatHeadTab/backend/internal/config"
	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/CatHeadTab/backend/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	// maxAvatarSize is the maximum allowed avatar upload size (2 MB).
	maxAvatarSize = 2 << 20
)

// UserHandler handles user preference operations.
type UserHandler struct {
	userRepo repository.UserRepository
	cfg      *config.Config
}

// NewUserHandler creates a new UserHandler.
func NewUserHandler(repo repository.UserRepository, cfg *config.Config) *UserHandler {
	return &UserHandler{userRepo: repo, cfg: cfg}
}

// DeleteAccount permanently deletes the logged-in user's account and all
// associated data (OAuth links, layout, bookmarks, background, etc. via
// ON DELETE CASCADE). Irreversible. This is the only way to remove a
// single-login account (e.g. WeChat-only), which cannot unlink its sole
// login method; afterwards the freed identity (openid/email) can be reused.
// DELETE /api/v1/user
func (h *UserHandler) DeleteAccount(c *gin.Context) {
	userID, err := uuid.Parse(c.GetString("user_id"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid session"})
		return
	}

	user, err := h.userRepo.GetByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	if err := h.userRepo.DeleteByID(userID); err != nil {
		logger.Error("failed to delete account", "user_id", userID, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete account"})
		return
	}

	logger.Info("account deleted", "user_id", userID, "username", user.Username)
	c.JSON(http.StatusOK, gin.H{"message": "Account deleted"})
}

// GetPreferences returns the user's preferences.
// GET /api/v1/user/preferences
func (h *UserHandler) GetPreferences(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	user, err := h.userRepo.GetByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"preferences": user.Preferences,
	})
}

// UpdatePreferences updates the user's preferences.
// PUT /api/v1/user/preferences
func (h *UserHandler) UpdatePreferences(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	var req map[string]interface{}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if err := h.userRepo.UpdatePreferences(userID, req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update preferences"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Preferences updated successfully"})
}

// GetProfile returns the user's profile info.
// GET /api/v1/user/profile
func (h *UserHandler) GetProfile(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, _ := uuid.Parse(userIDStr)

	user, err := h.userRepo.GetByID(userID)
	if err != nil || user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"user_id":          user.ID,
		"email":            user.Email,
		"username":         user.Username,
		"email_verified":   user.EmailVerified,
		"avatar_url":       user.AvatarURL,
		"has_password":     user.PasswordHash != "",
		"role":             user.Role,
		"pro_gate_enabled": h.cfg.ProGateEnabled,
	})
}

// UploadAvatar handles avatar image upload and stores it as a data URI.
// POST /api/v1/user/avatar
// Accepts multipart/form-data with field "avatar" or raw binary body.
// Max size: 2 MB. Allowed types: image/webp, image/jpeg, image/png, image/gif.
func (h *UserHandler) UploadAvatar(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	// Limit request body size
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAvatarSize)

	var imageData []byte
	var contentType string

	// Try multipart form first
	file, header, err := c.Request.FormFile("avatar")
	if err == nil {
		defer file.Close()

		if header.Size > maxAvatarSize {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": fmt.Sprintf("file too large: %d bytes, max allowed: %d bytes", header.Size, maxAvatarSize),
			})
			return
		}

		imageData, err = io.ReadAll(file)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read uploaded file"})
			return
		}
		contentType = header.Header.Get("Content-Type")
	} else {
		// Fallback: read raw body
		imageData, err = io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read request body"})
			return
		}
		contentType = c.ContentType()
	}

	if len(imageData) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "empty image data"})
		return
	}

	// Validate content type
	if contentType == "" {
		contentType = http.DetectContentType(imageData)
	}

	allowedTypes := map[string]bool{
		"image/webp": true,
		"image/jpeg": true,
		"image/png":  true,
		"image/gif":  true,
	}
	if !allowedTypes[contentType] {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": fmt.Sprintf("unsupported content type: %s", contentType),
		})
		return
	}

	// Encode as data URI and store in the avatar_url column
	dataURI := "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(imageData)

	if err := h.userRepo.UpdateAvatar(userID, dataURI); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update avatar"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Avatar updated successfully",
		"avatar_url": dataURI,
		"file_size":  len(imageData),
	})
}

// DeleteAvatar removes the user's custom avatar.
// DELETE /api/v1/user/avatar
func (h *UserHandler) DeleteAvatar(c *gin.Context) {
	userIDStr := c.GetString("user_id")
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user id"})
		return
	}

	if err := h.userRepo.UpdateAvatar(userID, ""); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete avatar"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "Avatar removed successfully",
		"avatar_url": "",
	})
}
