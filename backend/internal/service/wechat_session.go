package service

import (
	"sync"
	"time"

	"github.com/CatHeadTab/backend/internal/model"
	"github.com/google/uuid"
)

// WeChatSessionMode distinguishes a fresh login from linking to an existing user.
type WeChatSessionMode string

const (
	WeChatModeLogin WeChatSessionMode = "login"
	WeChatModeLink  WeChatSessionMode = "link"
)

// WeChatSessionStatus is the lifecycle state polled by the frontend.
type WeChatSessionStatus string

const (
	WeChatStatusPending   WeChatSessionStatus = "pending"
	WeChatStatusConfirmed WeChatSessionStatus = "confirmed"
	WeChatStatusError     WeChatSessionStatus = "error"
)

// WeChatSession is a pending login (or link) request. Two keys reach it:
//   - Code: the short, human verification code the user sends as a chat message
//     to the Official Account (matched in the callback).
//   - SessionID: an opaque, high-entropy id handed only to the browser, used to
//     poll status. Keeping the poll credential separate from the human code
//     means the token can't be claimed by guessing/replaying the short code.
type WeChatSession struct {
	Code      string
	SessionID string
	Mode      WeChatSessionMode
	UserID    uuid.UUID // target user, link mode only
	Status    WeChatSessionStatus
	Token     string      // JWT, set on confirmed login
	User      *model.User // resolved user, set on confirmed login
	ErrMsg    string
	// ExpiresAt mirrors the code's expiry; the poll endpoint reports "expired"
	// once passed while still pending.
	ExpiresAt time.Time
	// processing guards against WeChat re-pushing the same message (it retries
	// up to 3 times within ~5s) causing duplicate user creation.
	processing bool
}

// WeChatSessionStore is an in-memory, TTL-bounded store of pending sessions.
// Each session is indexed twice: by Code (for the callback message match) and
// by SessionID (for the browser's poll). Adequate for single-instance
// deployments (matching the project's in-memory rate limiters / wallpaper
// cache); swap for Redis to scale horizontally.
type WeChatSessionStore struct {
	mu       sync.RWMutex
	byCode   map[string]*WeChatSession
	bySessID map[string]*WeChatSession
}

// NewWeChatSessionStore creates the store and starts a background reaper.
func NewWeChatSessionStore() *WeChatSessionStore {
	store := &WeChatSessionStore{
		byCode:   make(map[string]*WeChatSession),
		bySessID: make(map[string]*WeChatSession),
	}
	go store.cleanupLoop()
	return store
}

func (s *WeChatSessionStore) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		s.mu.Lock()
		for k, v := range s.byCode {
			// Keep a grace window past expiry so a slow poll can still observe
			// a terminal (confirmed/error/expired) status.
			if now.After(v.ExpiresAt.Add(2 * time.Minute)) {
				delete(s.byCode, k)
				delete(s.bySessID, v.SessionID)
			}
		}
		s.mu.Unlock()
	}
}

// Create registers a new pending session, indexed by both code and sessionID.
// userID is uuid.Nil for login mode.
func (s *WeChatSessionStore) Create(code, sessionID string, mode WeChatSessionMode, userID uuid.UUID, ttl time.Duration) {
	sess := &WeChatSession{
		Code:      code,
		SessionID: sessionID,
		Mode:      mode,
		UserID:    userID,
		Status:    WeChatStatusPending,
		ExpiresAt: time.Now().Add(ttl),
	}
	s.mu.Lock()
	s.byCode[code] = sess
	s.bySessID[sessionID] = sess
	s.mu.Unlock()
}

// CodeExists reports whether a code is already in use, so issuance can avoid
// collisions.
func (s *WeChatSessionStore) CodeExists(code string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.byCode[code]
	return ok
}

// GetBySessionID returns a value copy of the session for the poll endpoint, so
// callers can read fields without racing the callback goroutine's mutations.
func (s *WeChatSessionStore) GetBySessionID(sessionID string) (WeChatSession, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.bySessID[sessionID]
	if !ok {
		return WeChatSession{}, false
	}
	return *sess, true
}

// ClaimPending atomically marks a pending session as being processed and
// returns a snapshot. It succeeds only for the first caller, so concurrent
// WeChat message retries don't each create a user. Status stays "pending" (so
// the poller keeps waiting) until Confirm/Fail produces a terminal state.
func (s *WeChatSessionStore) ClaimPending(code string) (WeChatSession, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.byCode[code]
	if !ok || sess.Status != WeChatStatusPending || sess.processing {
		return WeChatSession{}, false
	}
	sess.processing = true
	return *sess, true
}

// Confirm marks a session as successfully authenticated. token/user are only
// meaningful for login mode (link mode passes empty/nil). Returns false if the
// code is unknown (e.g. expired and reaped).
func (s *WeChatSessionStore) Confirm(code, token string, user *model.User) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.byCode[code]
	if !ok {
		return false
	}
	sess.Status = WeChatStatusConfirmed
	sess.Token = token
	sess.User = user
	return true
}

// Fail marks a session as errored with a user-facing message.
func (s *WeChatSessionStore) Fail(code, msg string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.byCode[code]
	if !ok {
		return false
	}
	sess.Status = WeChatStatusError
	sess.ErrMsg = msg
	return true
}
