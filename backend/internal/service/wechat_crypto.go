package service

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	crand "crypto/rand"
	"crypto/sha1"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
)

// wechatPadBlockSize is the PKCS#7 block size WeChat uses for message crypto.
// Note: this is 32, not the AES block size of 16 (per WeChat's WXBizMsgCrypt).
const wechatPadBlockSize = 32

// EncryptedMode reports whether a valid EncodingAESKey is configured, meaning
// the Official Account uses 安全模式/兼容模式 and callbacks are AES-encrypted.
func (s *WeChatService) EncryptedMode() bool {
	return len(s.aesKey) == 32
}

// sign computes the WeChat signature: SHA1 over the lexicographically sorted
// concatenation of the configured token and the given arguments.
func (s *WeChatService) sign(args ...string) string {
	list := make([]string, 0, len(args)+1)
	list = append(list, s.token)
	list = append(list, args...)
	sort.Strings(list)

	h := sha1.New()
	_, _ = io.WriteString(h, strings.Join(list, ""))
	return hex.EncodeToString(h.Sum(nil))
}

// VerifyURLSignature validates the GET server-config verification request.
func (s *WeChatService) VerifyURLSignature(signature, timestamp, nonce string) bool {
	return secureEqual(s.sign(timestamp, nonce), signature)
}

// VerifyMsgSignature validates the msg_signature of an encrypted callback.
func (s *WeChatService) VerifyMsgSignature(msgSignature, timestamp, nonce, encrypt string) bool {
	return secureEqual(s.sign(timestamp, nonce, encrypt), msgSignature)
}

// Decrypt decodes a base64 <Encrypt> payload and returns the inner message XML.
// Layout after AES-CBC decrypt + unpad: random(16) | msgLen(4, big-endian) | msg | appID.
func (s *WeChatService) Decrypt(encryptB64 string) ([]byte, error) {
	if len(s.aesKey) != 32 {
		return nil, errors.New("wechat AES key not configured")
	}

	cipherData, err := base64.StdEncoding.DecodeString(encryptB64)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}
	if len(cipherData) == 0 || len(cipherData)%aes.BlockSize != 0 {
		return nil, errors.New("invalid ciphertext length")
	}

	block, err := aes.NewCipher(s.aesKey)
	if err != nil {
		return nil, err
	}
	iv := s.aesKey[:aes.BlockSize]
	plain := make([]byte, len(cipherData))
	cipher.NewCBCDecrypter(block, iv).CryptBlocks(plain, cipherData)

	plain, err = pkcs7Unpad(plain)
	if err != nil {
		return nil, err
	}
	if len(plain) < 20 {
		return nil, errors.New("decrypted payload too short")
	}

	msgLen := binary.BigEndian.Uint32(plain[16:20])
	if int(msgLen) < 0 || 20+int(msgLen) > len(plain) {
		return nil, errors.New("invalid message length")
	}

	msg := plain[20 : 20+msgLen]
	appID := string(plain[20+msgLen:])
	if appID != s.appID {
		return nil, fmt.Errorf("appid mismatch")
	}
	return msg, nil
}

// Encrypt wraps a plaintext message into a base64 <Encrypt> payload.
func (s *WeChatService) Encrypt(msg []byte) (string, error) {
	if len(s.aesKey) != 32 {
		return "", errors.New("wechat AES key not configured")
	}

	var buf bytes.Buffer
	buf.Write(randomBytes(16))
	lenBuf := make([]byte, 4)
	binary.BigEndian.PutUint32(lenBuf, uint32(len(msg)))
	buf.Write(lenBuf)
	buf.Write(msg)
	buf.WriteString(s.appID)

	padded := pkcs7Pad(buf.Bytes(), wechatPadBlockSize)

	block, err := aes.NewCipher(s.aesKey)
	if err != nil {
		return "", err
	}
	iv := s.aesKey[:aes.BlockSize]
	out := make([]byte, len(padded))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(out, padded)
	return base64.StdEncoding.EncodeToString(out), nil
}

// BuildEncryptedReply encrypts a passive reply XML and wraps it in the
// envelope WeChat expects for 安全/兼容 mode responses.
func (s *WeChatService) BuildEncryptedReply(replyXML, timestamp, nonce string) (string, error) {
	encrypt, err := s.Encrypt([]byte(replyXML))
	if err != nil {
		return "", err
	}
	sig := s.sign(timestamp, nonce, encrypt)
	return fmt.Sprintf(
		`<xml><Encrypt><![CDATA[%s]]></Encrypt><MsgSignature><![CDATA[%s]]></MsgSignature><TimeStamp>%s</TimeStamp><Nonce><![CDATA[%s]]></Nonce></xml>`,
		encrypt, sig, timestamp, nonce,
	), nil
}

func secureEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}

func pkcs7Pad(data []byte, blockSize int) []byte {
	pad := blockSize - len(data)%blockSize
	if pad == 0 {
		pad = blockSize
	}
	return append(data, bytes.Repeat([]byte{byte(pad)}, pad)...)
}

func pkcs7Unpad(data []byte) ([]byte, error) {
	n := len(data)
	if n == 0 {
		return nil, errors.New("empty data")
	}
	pad := int(data[n-1])
	if pad < 1 || pad > wechatPadBlockSize || pad > n {
		return nil, errors.New("invalid padding")
	}
	return data[:n-pad], nil
}

func randomBytes(n int) []byte {
	b := make([]byte, n)
	if _, err := crand.Read(b); err != nil {
		// crypto/rand should never fail; degrade deterministically rather than panic.
		for i := range b {
			b[i] = byte(i)
		}
	}
	return b
}
