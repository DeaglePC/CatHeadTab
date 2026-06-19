package handler

import (
	crand "crypto/rand"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/CatHeadTab/backend/internal/logger"
	"github.com/CatHeadTab/backend/internal/model"
	"github.com/CatHeadTab/backend/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	// wechatCodeTTL is how long a verification code stays valid.
	wechatCodeTTL = 5 * time.Minute
	// wechatProvider is the provider key used in the oauth_accounts table.
	wechatProvider = "wechat"
	// wechatCodeLen is the length of the verification code the user types.
	wechatCodeLen = 6
	// wechatSessionIDBytes is the entropy (in bytes) of the opaque polling id.
	wechatSessionIDBytes = 32
	// wechatCodeCharset excludes visually ambiguous characters (0/O, 1/I/L).
	wechatCodeCharset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	// wechatWelcomeText is the passive reply sent when a user follows the account.
	wechatWelcomeText = "欢迎关注！请把网页上显示的验证码发送给我，即可完成登录 😊"
)

// wechatEventMessage is the subset of the WeChat callback XML we handle. It
// covers both event pushes (subscribe) and text messages (the code).
type wechatEventMessage struct {
	ToUserName   string `xml:"ToUserName"`
	FromUserName string `xml:"FromUserName"` // the sender's openid
	CreateTime   int64  `xml:"CreateTime"`
	MsgType      string `xml:"MsgType"`
	Event        string `xml:"Event"`   // for MsgType=event
	Content      string `xml:"Content"` // for MsgType=text (the verification code)
}

// wechatEncryptedEnvelope is the outer XML in 安全/兼容 (encrypted) mode.
type wechatEncryptedEnvelope struct {
	ToUserName string `xml:"ToUserName"`
	Encrypt    string `xml:"Encrypt"`
}

// wechatReplyKind selects how the callback responds to a message.
type wechatReplyKind int

const (
	wechatReplyNone       wechatReplyKind = iota // ack "success", no message
	wechatReplyText                              // passive text reply
	wechatReplyAITransfer                        // hand off to the official AI reply
)

// wechatReply is the decision returned by message handling.
type wechatReply struct {
	kind wechatReplyKind
	text string // used when kind == wechatReplyText
}

// looksLikeWeChatCode reports whether a (normalized) string has the shape of a
// verification code, so normal chat messages aren't mistaken for login attempts.
func looksLikeWeChatCode(s string) bool {
	if len(s) != wechatCodeLen {
		return false
	}
	for _, r := range s {
		if !strings.ContainsRune(wechatCodeCharset, r) {
			return false
		}
	}
	return true
}

// generateWeChatCode returns a short, unambiguous, uppercase verification code.
func generateWeChatCode() (string, error) {
	b := make([]byte, wechatCodeLen)
	if _, err := crand.Read(b); err != nil {
		return "", err
	}
	out := make([]byte, wechatCodeLen)
	for i, v := range b {
		out[i] = wechatCodeCharset[int(v)%len(wechatCodeCharset)]
	}
	return string(out), nil
}

// normalizeWeChatCode canonicalises a code typed by the user for matching.
func normalizeWeChatCode(s string) string {
	return strings.ToUpper(strings.TrimSpace(s))
}

// generateWeChatSessionID returns an opaque, high-entropy id the browser uses
// to poll login status. Unlike the human code, it is never shown to the user
// nor sent through WeChat, so the resulting token cannot be claimed by
// guessing or replaying the short verification code.
func generateWeChatSessionID() (string, error) {
	b := make([]byte, wechatSessionIDBytes)
	if _, err := crand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// WeChatLogin starts a login by issuing a verification code (public).
// POST /api/v1/auth/wechat/login
func (h *AuthHandler) WeChatLogin(c *gin.Context) {
	if !h.cfg.IsWeChatConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "WeChat login not configured"})
		return
	}
	h.startWeChatSession(c, service.WeChatModeLogin, uuid.Nil)
}

// WeChatLinkStart starts binding WeChat to the logged-in user.
// POST /api/v1/user/link/wechat
func (h *AuthHandler) WeChatLinkStart(c *gin.Context) {
	if !h.cfg.IsWeChatConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "WeChat login not configured"})
		return
	}
	userID, err := uuid.Parse(c.GetString("user_id"))
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid session"})
		return
	}
	h.startWeChatSession(c, service.WeChatModeLink, userID)
}

func (h *AuthHandler) startWeChatSession(c *gin.Context, mode service.WeChatSessionMode, userID uuid.UUID) {
	// Generate a code that isn't already pending (collisions are unlikely).
	var code string
	for attempt := 0; attempt < 6; attempt++ {
		candidate, err := generateWeChatCode()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create login session"})
			return
		}
		if !h.wechatSessions.CodeExists(candidate) {
			code = candidate
			break
		}
	}
	if code == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create login session"})
		return
	}

	// The browser polls with this opaque id, never with the human code.
	sessionID, err := generateWeChatSessionID()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create login session"})
		return
	}

	h.wechatSessions.Create(code, sessionID, mode, userID, wechatCodeTTL)

	c.JSON(http.StatusOK, gin.H{
		"code":           code,
		"session":        sessionID,
		"expire_seconds": int(wechatCodeTTL.Seconds()),
		"qr_image_url":   h.cfg.WeChatQRImageURL,
		"account_name":   h.cfg.WeChatAccountName,
	})
}

// WeChatPoll reports the status of a pending login/link. It is keyed by the
// opaque session id returned at issuance, not the human verification code, so
// the confirmed token can only be retrieved by the browser that started the
// flow.
// GET /api/v1/auth/wechat/poll?session=...
func (h *AuthHandler) WeChatPoll(c *gin.Context) {
	sessionID := strings.TrimSpace(c.Query("session"))
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing session"})
		return
	}

	sess, ok := h.wechatSessions.GetBySessionID(sessionID)
	if !ok {
		// Unknown session — already reaped or never existed; treat as expired.
		c.JSON(http.StatusOK, gin.H{"status": "expired"})
		return
	}

	switch sess.Status {
	case service.WeChatStatusConfirmed:
		if sess.Mode == service.WeChatModeLogin {
			c.JSON(http.StatusOK, gin.H{
				"status": "confirmed",
				"token":  sess.Token,
				"user":   wechatUserPublic(sess.User),
			})
		} else {
			c.JSON(http.StatusOK, gin.H{"status": "confirmed"})
		}
	case service.WeChatStatusError:
		c.JSON(http.StatusOK, gin.H{"status": "error", "error": sess.ErrMsg})
	default:
		if time.Now().After(sess.ExpiresAt) {
			c.JSON(http.StatusOK, gin.H{"status": "expired"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "pending"})
	}
}

// WeChatCallback handles both the GET server-config verification and the POST
// message push from WeChat servers. Registered for GET and POST on the same path.
// /api/v1/auth/wechat/callback
func (h *AuthHandler) WeChatCallback(c *gin.Context) {
	if !h.cfg.IsWeChatConfigured() {
		c.String(http.StatusServiceUnavailable, "")
		return
	}

	timestamp := c.Query("timestamp")
	nonce := c.Query("nonce")

	// GET: one-time URL verification — echo back echostr if the signature checks out.
	if c.Request.Method == http.MethodGet {
		if h.wechatSvc.VerifyURLSignature(c.Query("signature"), timestamp, nonce) {
			c.String(http.StatusOK, c.Query("echostr"))
		} else {
			logger.Warn("wechat callback: URL signature verification failed")
			c.String(http.StatusForbidden, "")
		}
		return
	}

	// POST: message push. Always ack with "success" on any parsing problem so
	// WeChat does not keep retrying.
	rawBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.String(http.StatusOK, "success")
		return
	}

	encryptType := c.Query("encrypt_type")
	msgSignature := c.Query("msg_signature")
	encrypted := encryptType == "aes" || msgSignature != ""

	msgXML := rawBody
	if encrypted {
		var envelope wechatEncryptedEnvelope
		if err := xml.Unmarshal(rawBody, &envelope); err != nil || envelope.Encrypt == "" {
			logger.Warn("wechat callback: failed to parse encrypted envelope", "error", err)
			c.String(http.StatusOK, "success")
			return
		}
		if !h.wechatSvc.VerifyMsgSignature(msgSignature, timestamp, nonce, envelope.Encrypt) {
			logger.Warn("wechat callback: msg_signature mismatch")
			c.String(http.StatusOK, "success")
			return
		}
		decrypted, err := h.wechatSvc.Decrypt(envelope.Encrypt)
		if err != nil {
			logger.Error("wechat callback: decrypt failed", "error", err)
			c.String(http.StatusOK, "success")
			return
		}
		msgXML = decrypted
	}

	var msg wechatEventMessage
	if err := xml.Unmarshal(msgXML, &msg); err != nil {
		logger.Warn("wechat callback: failed to parse message", "error", err)
		c.String(http.StatusOK, "success")
		return
	}

	reply := h.handleWeChatMessage(&msg)
	h.writeWeChatReply(c, &msg, reply, timestamp, nonce, encrypted)
}

// handleWeChatMessage routes a callback message: code-shaped text messages are
// treated as login/link attempts, everything else is either handed to the
// official AI reply (when WECHAT_AI_REPLY is on) or acknowledged silently.
func (h *AuthHandler) handleWeChatMessage(msg *wechatEventMessage) wechatReply {
	switch msg.MsgType {
	case "event":
		// New followers get a welcome that explains the next step.
		if msg.Event == "subscribe" {
			return wechatReply{kind: wechatReplyText, text: wechatWelcomeText}
		}
		return wechatReply{kind: wechatReplyNone}
	case "text":
		code := normalizeWeChatCode(msg.Content)
		if looksLikeWeChatCode(code) {
			return wechatReply{kind: wechatReplyText, text: h.completeWeChatByCode(code, msg.FromUserName)}
		}
		// Not a login code — let the official AI handle it (or stay silent).
		return h.aiOrSilentReply()
	default:
		return h.aiOrSilentReply()
	}
}

// aiOrSilentReply hands off to the official AI reply when enabled, otherwise
// acknowledges without a message.
func (h *AuthHandler) aiOrSilentReply() wechatReply {
	if h.cfg.WeChatAIReply {
		return wechatReply{kind: wechatReplyAITransfer}
	}
	return wechatReply{kind: wechatReplyNone}
}

// completeWeChatByCode matches a code to a pending session and performs the
// login or link, returning the text to reply to the user.
func (h *AuthHandler) completeWeChatByCode(code, openid string) string {
	if openid == "" {
		return ""
	}

	// Claim atomically so concurrent WeChat retries don't double-process.
	sess, ok := h.wechatSessions.ClaimPending(code)
	if !ok {
		// Not one of our codes, already used, or expired.
		return "验证码无效或已过期，请在网页上重新获取。"
	}

	if sess.Mode == service.WeChatModeLink {
		if err := h.linkWeChatToUser(sess.UserID, openid); err != nil {
			logger.Warn("wechat link failed", "user_id", sess.UserID, "openid", openid, "error", err)
			h.wechatSessions.Fail(code, err.Error())
			return "绑定失败：" + err.Error()
		}
		h.wechatSessions.Confirm(code, "", nil)
		return "✅ 微信绑定成功，请返回浏览器。"
	}

	user, err := h.resolveWeChatUser(openid)
	if err != nil {
		logger.Error("wechat login: resolve user failed", "openid", openid, "error", err)
		h.wechatSessions.Fail(code, "登录失败，请重试")
		return "登录失败，请稍后重试。"
	}
	token, err := h.generateToken(user.ID.String())
	if err != nil {
		logger.Error("wechat login: token generation failed", "user_id", user.ID, "error", err)
		h.wechatSessions.Fail(code, "登录失败，请重试")
		return "登录失败，请稍后重试。"
	}
	h.wechatSessions.Confirm(code, token, user)
	logger.Info("wechat login", "user_id", user.ID, "openid", openid)
	return "✅ 登录成功，请返回浏览器。"
}

// resolveWeChatUser finds the user linked to this openid or creates a new
// email-less account. WeChat-authenticated accounts are marked email-verified
// so they aren't blocked by the RequireVerified middleware. No nickname/avatar
// is fetched because the user-info API requires 微信认证.
func (h *AuthHandler) resolveWeChatUser(openid string) (*model.User, error) {
	existing, _ := h.oauthRepo.GetByProviderAndID(wechatProvider, openid)
	if existing != nil {
		user, err := h.userRepo.GetByID(existing.UserID)
		if err != nil {
			return nil, err
		}
		if user == nil {
			return nil, fmt.Errorf("linked user not found")
		}
		return user, nil
	}

	user := &model.User{
		Username:      h.ensureUniqueUsername(randomWeChatUsername()),
		EmailVerified: true, // SSO-authenticated; there is no email to verify
		Role:          model.UserRole(h.cfg.DefaultRoleForNewUser()),
	}
	if err := h.userRepo.Create(user); err != nil {
		return nil, err
	}

	account := &model.OAuthAccount{
		UserID:         user.ID,
		Provider:       wechatProvider,
		ProviderUserID: openid,
	}
	if err := h.oauthRepo.Create(account); err != nil {
		return nil, err
	}
	logger.Info("wechat new user created", "user_id", user.ID, "openid", openid)
	return user, nil
}

// linkWeChatToUser binds an openid to an existing user, rejecting an openid
// that is already linked elsewhere.
func (h *AuthHandler) linkWeChatToUser(userID uuid.UUID, openid string) error {
	existing, _ := h.oauthRepo.GetByProviderAndID(wechatProvider, openid)
	if existing != nil {
		if existing.UserID == userID {
			return nil // already linked to this same user
		}
		return fmt.Errorf("该微信已绑定其他账号")
	}

	account := &model.OAuthAccount{
		UserID:         userID,
		Provider:       wechatProvider,
		ProviderUserID: openid,
	}
	if err := h.oauthRepo.Create(account); err != nil {
		return err
	}
	logger.Info("wechat account linked", "user_id", userID, "openid", openid)
	return nil
}

// writeWeChatReply sends the chosen passive reply, encrypting it when the
// callback arrived in 安全/兼容 mode. A "none" reply (or a misconfiguration)
// acks "success" so WeChat stops retrying.
func (h *AuthHandler) writeWeChatReply(c *gin.Context, msg *wechatEventMessage, reply wechatReply, timestamp, nonce string, encrypted bool) {
	now := time.Now().Unix()

	var plainXML string
	switch reply.kind {
	case wechatReplyText:
		if reply.text == "" {
			c.String(http.StatusOK, "success")
			return
		}
		plainXML = fmt.Sprintf(
			`<xml><ToUserName><![CDATA[%s]]></ToUserName><FromUserName><![CDATA[%s]]></FromUserName><CreateTime>%d</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[%s]]></Content></xml>`,
			msg.FromUserName, msg.ToUserName, now, reply.text,
		)
	case wechatReplyAITransfer:
		// Hand the message to WeChat's official AI reply.
		plainXML = fmt.Sprintf(
			`<xml><ToUserName><![CDATA[%s]]></ToUserName><FromUserName><![CDATA[%s]]></FromUserName><CreateTime>%d</CreateTime><MsgType><![CDATA[transfer_biz_ai_ivr]]></MsgType></xml>`,
			msg.FromUserName, msg.ToUserName, now,
		)
	default:
		c.String(http.StatusOK, "success")
		return
	}

	if encrypted {
		if !h.wechatSvc.EncryptedMode() {
			// Encrypted callback but no AES key configured — ack without reply.
			c.String(http.StatusOK, "success")
			return
		}
		out, err := h.wechatSvc.BuildEncryptedReply(plainXML, timestamp, nonce)
		if err != nil {
			logger.Error("wechat reply encrypt failed", "error", err)
			c.String(http.StatusOK, "success")
			return
		}
		c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(out))
		return
	}

	c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(plainXML))
}

// randomWeChatUsername generates a username base like "wx_3f9a1c08" since the
// nickname is unavailable for unverified accounts.
func randomWeChatUsername() string {
	b := make([]byte, 4)
	_, _ = crand.Read(b)
	return "wx_" + hex.EncodeToString(b)
}

// wechatUserPublic shapes the user object returned to the frontend, matching
// the OAuth login response.
func wechatUserPublic(u *model.User) gin.H {
	if u == nil {
		return nil
	}
	return gin.H{
		"id":             u.ID,
		"username":       u.Username,
		"email":          u.Email,
		"email_verified": u.EmailVerified,
		"avatar_url":     u.AvatarURL,
		"role":           u.Role,
	}
}
