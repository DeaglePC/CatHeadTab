package repository

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/CatHeadTab/backend/internal/model"
	"github.com/google/uuid"
)

// UserRepository handles database operations for the User model.
type UserRepository interface {
	Create(user *model.User) error
	GetByID(id uuid.UUID) (*model.User, error)
	GetByEmail(email string) (*model.User, error)
	GetByUsername(username string) (*model.User, error)
	DeleteByID(id uuid.UUID) error
	UpdatePreferences(id uuid.UUID, prefs map[string]interface{}) error
	UpdatePassword(id uuid.UUID, passwordHash string) error
	SetEmailVerified(id uuid.UUID, verified bool) error
	UpdateAvatar(id uuid.UUID, avatarURL string) error
	UpdateRole(id uuid.UUID, role model.UserRole) error
}

type postgresUserRepository struct {
	db *sql.DB
}

// NewUserRepository creates a new UserRepository connected to the database.
func NewUserRepository(db *sql.DB) UserRepository {
	return &postgresUserRepository{db: db}
}

func (r *postgresUserRepository) Create(user *model.User) error {
	query := `
		INSERT INTO users (id, email, password_hash, oauth_provider, oauth_id, username, avatar_url, email_verified, role)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING created_at
	`

	if user.ID == uuid.Nil {
		user.ID = uuid.New()
	}

	// Default to regular user if no role is set
	if user.Role == "" {
		user.Role = model.RoleUser
	}

	// Insert NULL (not "") for an empty email so multiple accounts without an
	// email (e.g. WeChat-only logins) don't collide on the UNIQUE(email) index.
	var emailArg interface{}
	if user.Email != "" {
		emailArg = user.Email
	}

	err := r.db.QueryRow(
		query,
		user.ID,
		emailArg,
		user.PasswordHash,
		user.OAuthProvider,
		user.OAuthID,
		user.Username,
		user.AvatarURL,
		user.EmailVerified,
		string(user.Role),
	).Scan(&user.CreatedAt)

	return err
}

func (r *postgresUserRepository) GetByID(id uuid.UUID) (*model.User, error) {
	query := `
		SELECT id, email, password_hash, oauth_provider, oauth_id, username, avatar_url, preferences, email_verified, role, created_at 
		FROM users WHERE id = $1
	`
	return r.scanRow(r.db.QueryRow(query, id))
}

func (r *postgresUserRepository) GetByEmail(email string) (*model.User, error) {
	query := `
		SELECT id, email, password_hash, oauth_provider, oauth_id, username, avatar_url, preferences, email_verified, role, created_at 
		FROM users WHERE email = $1
	`
	return r.scanRow(r.db.QueryRow(query, email))
}

func (r *postgresUserRepository) GetByUsername(username string) (*model.User, error) {
	query := `
		SELECT id, email, password_hash, oauth_provider, oauth_id, username, avatar_url, preferences, email_verified, role, created_at 
		FROM users WHERE username = $1
	`
	return r.scanRow(r.db.QueryRow(query, username))
}

func (r *postgresUserRepository) scanRow(row *sql.Row) (*model.User, error) {
	var u model.User
	var oauthProvider, oauthID sql.NullString
	var email sql.NullString
	var passwordHash sql.NullString
	var prefsJSON []byte
	var role string

	err := row.Scan(
		&u.ID,
		&email,
		&passwordHash,
		&oauthProvider,
		&oauthID,
		&u.Username,
		&u.AvatarURL,
		&prefsJSON,
		&u.EmailVerified,
		&role,
		&u.CreatedAt,
	)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	if email.Valid {
		u.Email = email.String
	}
	if passwordHash.Valid {
		u.PasswordHash = passwordHash.String
	}
	if oauthProvider.Valid {
		provider := oauthProvider.String
		u.OAuthProvider = &provider
	}
	if oauthID.Valid {
		id := oauthID.String
		u.OAuthID = &id
	}
	if len(prefsJSON) > 0 {
		if err := json.Unmarshal(prefsJSON, &u.Preferences); err != nil {
			u.Preferences = make(map[string]interface{})
		}
	} else {
		u.Preferences = make(map[string]interface{})
	}

	// Map role string to UserRole; default to regular user for unknown values
	if model.ValidRoles[model.UserRole(role)] {
		u.Role = model.UserRole(role)
	} else {
		u.Role = model.RoleUser
	}

	return &u, nil
}

func (r *postgresUserRepository) UpdatePreferences(id uuid.UUID, prefs map[string]interface{}) error {
	// Merge: read existing preferences, apply new fields on top, then write back.
	// This prevents overwriting unrelated preference keys (e.g. saving
	// lockIdleTimeout should not erase backgroundImage and vice-versa).
	var existingJSON []byte
	err := r.db.QueryRow(`SELECT COALESCE(preferences, '{}') FROM users WHERE id = $1`, id).Scan(&existingJSON)
	if err != nil {
		return fmt.Errorf("read existing preferences: %w", err)
	}

	existing := make(map[string]interface{})
	if len(existingJSON) > 0 {
		if err := json.Unmarshal(existingJSON, &existing); err != nil {
			existing = make(map[string]interface{})
		}
	}

	// Apply incoming fields
	for k, v := range prefs {
		existing[k] = v
	}

	// Auto-inject update timestamp so the frontend can compare freshness
	existing["_updatedAt"] = time.Now().UTC().Format(time.RFC3339Nano)

	data, err := json.Marshal(existing)
	if err != nil {
		return err
	}
	_, err = r.db.Exec(`UPDATE users SET preferences = $1 WHERE id = $2`, data, id)
	return err
}

func (r *postgresUserRepository) UpdatePassword(id uuid.UUID, passwordHash string) error {
	_, err := r.db.Exec(`UPDATE users SET password_hash = $1 WHERE id = $2`, passwordHash, id)
	return err
}

func (r *postgresUserRepository) SetEmailVerified(id uuid.UUID, verified bool) error {
	_, err := r.db.Exec(`UPDATE users SET email_verified = $1 WHERE id = $2`, verified, id)
	return err
}

func (r *postgresUserRepository) UpdateAvatar(id uuid.UUID, avatarURL string) error {
	_, err := r.db.Exec(`UPDATE users SET avatar_url = $1 WHERE id = $2`, avatarURL, id)
	return err
}

func (r *postgresUserRepository) UpdateRole(id uuid.UUID, role model.UserRole) error {
	_, err := r.db.Exec(`UPDATE users SET role = $1 WHERE id = $2`, string(role), id)
	return err
}

// DeleteByID removes a user by ID. Related rows (email_verifications, password_resets,
// oauth_accounts, etc.) are cascade-deleted via foreign key constraints.
func (r *postgresUserRepository) DeleteByID(id uuid.UUID) error {
	_, err := r.db.Exec(`DELETE FROM users WHERE id = $1`, id)
	return err
}
