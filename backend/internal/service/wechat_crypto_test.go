package service

import (
	"strings"
	"testing"

	"github.com/CatHeadTab/backend/internal/config"
)

// newTestWeChatService builds a service with the canonical WeChat sample
// credentials (token / EncodingAESKey / appID) used throughout WeChat's docs.
func newTestWeChatService(t *testing.T) *WeChatService {
	t.Helper()
	svc := NewWeChatService(&config.Config{
		WeChatAppID:  "wx5823bf96d3bd56c7",
		WeChatToken:  "QDG6eK",
		WeChatAESKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
	})
	if !svc.EncryptedMode() {
		t.Fatal("expected encrypted mode to be enabled with a valid EncodingAESKey")
	}
	return svc
}

func TestWeChatEncryptDecryptRoundTrip(t *testing.T) {
	svc := newTestWeChatService(t)

	cases := []string{
		"",
		"hello",
		"<xml><Content><![CDATA[登录成功，请返回浏览器]]></Content></xml>",
		strings.Repeat("a", 32),  // exact PKCS7 block boundary
		strings.Repeat("中", 100), // multibyte payload
	}

	for _, msg := range cases {
		enc, err := svc.Encrypt([]byte(msg))
		if err != nil {
			t.Fatalf("Encrypt(%q) error: %v", msg, err)
		}
		dec, err := svc.Decrypt(enc)
		if err != nil {
			t.Fatalf("Decrypt of %q error: %v", msg, err)
		}
		if string(dec) != msg {
			t.Errorf("round trip mismatch: got %q want %q", string(dec), msg)
		}
	}
}

func TestWeChatDecryptRejectsAppIDMismatch(t *testing.T) {
	svc := newTestWeChatService(t)

	// Same AES key, different appID — decryption must detect the embedded
	// appID does not match and reject it.
	other := NewWeChatService(&config.Config{
		WeChatAppID:  "wxDIFFERENTappid01",
		WeChatToken:  "QDG6eK",
		WeChatAESKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
	})

	enc, err := other.Encrypt([]byte("hi"))
	if err != nil {
		t.Fatalf("Encrypt error: %v", err)
	}
	if _, err := svc.Decrypt(enc); err == nil {
		t.Error("expected appID mismatch error, got nil")
	}
}

func TestWeChatDecryptRejectsGarbage(t *testing.T) {
	svc := newTestWeChatService(t)
	if _, err := svc.Decrypt("not-valid-base64!!"); err == nil {
		t.Error("expected error decrypting invalid base64")
	}
}

func TestWeChatSignature(t *testing.T) {
	svc := newTestWeChatService(t)
	ts, nonce := "1409304348", "xxxxxx"

	sig := svc.sign(ts, nonce)
	if !svc.VerifyURLSignature(sig, ts, nonce) {
		t.Error("VerifyURLSignature should accept a signature it produced")
	}
	if svc.VerifyURLSignature("deadbeef", ts, nonce) {
		t.Error("VerifyURLSignature should reject a wrong signature")
	}

	encrypt := "c29tZS1lbmNyeXB0ZWQtcGF5bG9hZA=="
	msgSig := svc.sign(ts, nonce, encrypt)
	if !svc.VerifyMsgSignature(msgSig, ts, nonce, encrypt) {
		t.Error("VerifyMsgSignature should accept a signature it produced")
	}
	if svc.VerifyMsgSignature(msgSig, ts, nonce, "tampered") {
		t.Error("VerifyMsgSignature should reject a tampered payload")
	}
}

func TestWeChatPlaintextModeHasNoAESKey(t *testing.T) {
	svc := NewWeChatService(&config.Config{
		WeChatAppID: "wx5823bf96d3bd56c7",
		WeChatToken: "QDG6eK",
		// no AES key -> plaintext mode
	})
	if svc.EncryptedMode() {
		t.Error("expected plaintext mode when no EncodingAESKey is set")
	}
	if _, err := svc.Encrypt([]byte("x")); err == nil {
		t.Error("Encrypt should fail without an AES key")
	}
}

func TestPKCS7Padding(t *testing.T) {
	// A buffer already aligned to the block size must gain a full block of padding.
	aligned := make([]byte, wechatPadBlockSize)
	padded := pkcs7Pad(aligned, wechatPadBlockSize)
	if len(padded) != 2*wechatPadBlockSize {
		t.Fatalf("aligned input should add a full block: got %d", len(padded))
	}
	unpadded, err := pkcs7Unpad(padded)
	if err != nil {
		t.Fatalf("unpad error: %v", err)
	}
	if len(unpadded) != wechatPadBlockSize {
		t.Errorf("unpad length: got %d want %d", len(unpadded), wechatPadBlockSize)
	}
}
