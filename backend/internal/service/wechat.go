package service

import (
	"encoding/base64"

	"github.com/CatHeadTab/backend/internal/config"
	"github.com/CatHeadTab/backend/internal/logger"
)

// WeChatService holds the credentials needed to verify and (optionally) decrypt
// callbacks from a WeChat Official Account.
//
// The login flow is "follow + verification code": the user follows the account
// and sends a short code shown in the browser; WeChat pushes that text message
// to our callback, and we match the code to a pending session. This is fully
// passive — the backend never calls outbound WeChat APIs — so it works on
// personal, UNVERIFIED subscription accounts, which lack the parametric-QR and
// user-info API permissions (those require 微信认证).
//
// Message signature verification and AES crypto live in wechat_crypto.go.
type WeChatService struct {
	appID  string
	token  string
	aesKey []byte // decoded EncodingAESKey (32 bytes) or nil for 明文 (plaintext) mode
}

// NewWeChatService builds a WeChatService from config. An invalid EncodingAESKey
// is logged and disables encrypted mode rather than failing startup.
func NewWeChatService(cfg *config.Config) *WeChatService {
	var aesKey []byte
	if cfg.WeChatAESKey != "" {
		// EncodingAESKey is 43 chars of base64 without padding; append "=".
		if k, err := base64.StdEncoding.DecodeString(cfg.WeChatAESKey + "="); err == nil && len(k) == 32 {
			aesKey = k
		} else {
			logger.Error("invalid WECHAT_AES_KEY, encrypted callback mode disabled", "len", len(k), "error", err)
		}
	}
	return &WeChatService{
		appID:  cfg.WeChatAppID,
		token:  cfg.WeChatToken,
		aesKey: aesKey,
	}
}
