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

// WeChatSession is a pending login (or link) request keyed by the verification
// code shown to the user. They follow the Official Account and send this code
// as a chat message to complete the flow.
type WeChatSession struct {
	Code   string
	Mode   WeChatSessionMode
	UserID uuid.UUID // target user, link mode only
	Status WeChatSessionStatus
	Token  string      // JWT, set on confirmed login
	User   *model.User // resolved user, set on confirmed login
	ErrMsg string
	// ExpiresAt mirrors the code's expiry; the poll endpoint reports "expired"
	// once passed while still pending.
	ExpiresAt time.Time
	// processing guards against WeChat re-pushing the same message (it retries
	// up to 3 times within ~5s) causing duplicate user creation.
	processing bool
}

// WeChatSessionStore is an in-memory, TTL-bounded store of pending sessions.
// Adequate for single-instance deployments (matching the project's in-memory
// rate limiters / wallpaper cache); swap for Redis to scale horizontally.
type WeChatSessionStore struct {
	mu       sync.RWMutex
	sessions map[string]*WeChatSession
}

// NewWeChatSessionStore creates the store and starts a background reaper.
func NewWeChatSessionStore() *WeChatSessionStore {
	store := &WeChatSessionStore{sessions: make(map[string]*WeChatSession)}
	go store.cleanupLoop()
	return store
}

func (s *WeChatSessionStore) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		now := time.Now()
		s.mu.Lock()
		for k, v := range s.sessions {
			// Keep a grace window past expiry so a slow poll can still observe
			// a terminal (confirmed/error/expired) status.
			if now.After(v.ExpiresAt.Add(2 * time.Minute)) {
				delete(s.sessions, k)
			}
		}
		s.mu.Unlock()
	}
}

// Create registers a new pending session. userID is uuid.Nil for login mode.
func (s *WeChatSessionStore) Create(code string, mode WeChatSessionMode, userID uuid.UUID, ttl time.Duration) {
	s.mu.Lock()
	s.sessions[code] = &WeChatSession{
		Code:      code,
		Mode:      mode,
		UserID:    userID,
		Status:    WeChatStatusPending,
		ExpiresAt: time.Now().Add(ttl),
	}
	s.mu.Unlock()
}

// Get returns a value copy of the session so callers can read fields without
// racing the callback goroutine's mutations.
func (s *WeChatSessionStore) Get(code string) (WeChatSession, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[code]
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
	sess, ok := s.sessions[code]
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
	sess, ok := s.sessions[code]
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
	sess, ok := s.sessions[code]
	if !ok {
		return false
	}
	sess.Status = WeChatStatusError
	sess.ErrMsg = msg
	return true
}
