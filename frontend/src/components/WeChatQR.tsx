import React, { useState, useEffect, useRef, useCallback } from 'react';
import client from '../api/client';
import { useTranslation } from '../i18n/useTranslation';
// Bundled Official Account QR. Replace this file with your own account's QR;
// a configured WECHAT_QR_IMAGE_URL still overrides it at runtime.
import wechatQrAsset from '../assets/wechat-qr.png';

interface WeChatLoginData {
  token: string;
  user: unknown;
}

interface WeChatQRProps {
  /** 'login' starts a public login; 'link' binds WeChat to the logged-in user. */
  mode: 'login' | 'link';
  /** Called once the code is confirmed. In login mode it receives the token + user. */
  onSuccess: (data?: WeChatLoginData) => void;
}

type FlowStatus = 'loading' | 'pending' | 'confirmed' | 'expired' | 'error';

/**
 * WeChatQR drives the "follow + verification code" login for a WeChat Official
 * Account: it shows the account QR (to follow) plus a one-time code the user
 * sends in the chat, and polls the backend until the code is confirmed. This
 * works on personal, unverified subscription accounts. It is presentational
 * inner content; the parent supplies any surrounding modal chrome.
 */
export const WeChatQR: React.FC<WeChatQRProps> = ({ mode, onSuccess }) => {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [accountName, setAccountName] = useState('');
  const [status, setStatus] = useState<FlowStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Keep the latest onSuccess without re-subscribing the polling effect.
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback((c: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await client.get('/api/v1/auth/wechat/poll', { params: { code: c } });
        const data = res.data;
        if (data.status === 'confirmed') {
          stopPolling();
          setStatus('confirmed');
          // Brief success flash before handing off to the parent.
          setTimeout(() => {
            if (mode === 'login') {
              onSuccessRef.current({ token: data.token, user: data.user });
            } else {
              onSuccessRef.current();
            }
          }, 600);
        } else if (data.status === 'expired') {
          stopPolling();
          setStatus('expired');
        } else if (data.status === 'error') {
          stopPolling();
          setStatus('error');
          setErrorMsg(data.error || t('auth.wechatFailed'));
        }
      } catch {
        // Transient network error — keep polling.
      }
    }, 2000);
  }, [mode, stopPolling, t]);

  const startSession = useCallback(async () => {
    stopPolling();
    setStatus('loading');
    setErrorMsg('');
    setCode('');
    setCopied(false);
    try {
      const endpoint = mode === 'login' ? '/api/v1/auth/wechat/login' : '/api/v1/user/link/wechat';
      const res = await client.post(endpoint);
      setCode(res.data.code);
      setQrImageUrl(res.data.qr_image_url || '');
      setAccountName(res.data.account_name || '');
      setStatus('pending');
      startPolling(res.data.code);
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.response?.data?.error || t('auth.wechatFailed'));
    }
  }, [mode, startPolling, stopPolling, t]);

  useEffect(() => {
    startSession();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — user can still read and type the code.
    }
  };

  const wechatLogo = (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#07c160"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 4.882-1.932 7.621-.55C20.811 6.5 16.873 2.188 8.691 2.188zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.111 2.351-.348a.825.825 0 0 1 .654.087l1.546.902a.272.272 0 0 0 .136.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.318-1.21a.49.49 0 0 1 .178-.554c1.526-1.124 2.514-2.81 2.514-4.7 0-3.366-3.219-6.09-7.192-6.45a8.29 8.29 0 0 0-.295-.003zm-3.151 1.99c.534 0 .967.44.967.982a.976.976 0 0 1-.967.982.976.976 0 0 1-.967-.982c0-.542.433-.982.967-.982zm4.84 0c.534 0 .967.44.967.982a.976.976 0 0 1-.967.982.976.976 0 0 1-.968-.982c0-.542.434-.982.968-.982z"/></svg>
  );

  // Prefer a runtime-configured QR (WECHAT_QR_IMAGE_URL); otherwise the bundled asset.
  const qrSrc = qrImageUrl || wechatQrAsset;

  return (
    <div className="flex flex-col items-center text-center gap-4 w-full">
      <p className="text-white/50 text-[13px] leading-relaxed">{t('auth.wechatScanHint')}</p>

      {/* Account QR (to follow) or a search hint */}
      <div className="relative w-44 h-44 rounded-2xl bg-white p-2 flex items-center justify-center overflow-hidden">
        {status === 'loading' ? (
          <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        ) : qrSrc ? (
          <img src={qrSrc} alt="WeChat Official Account QR" className="w-full h-full object-contain" />
        ) : (
          <div className="px-3 flex flex-col items-center">
            {wechatLogo}
            <p className="text-gray-700 text-[12px] mt-2 font-medium leading-snug">
              {accountName ? t('auth.wechatSearchAccount', { name: accountName }) : t('auth.wechatFollowAccount')}
            </p>
          </div>
        )}

        {status === 'expired' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3">
            <p className="text-white/80 text-[13px]">{t('auth.wechatExpired')}</p>
            <button
              type="button"
              onClick={startSession}
              className="px-4 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-[13px] font-medium transition-colors"
            >
              {t('auth.wechatRefresh')}
            </button>
          </div>
        )}

        {status === 'confirmed' && (
          <div className="absolute inset-0 bg-[#07c160]/90 flex flex-col items-center justify-center gap-2">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <p className="text-white text-[13px] font-medium">{t('auth.wechatSuccess')}</p>
          </div>
        )}
      </div>

      {/* Verification code */}
      {status === 'pending' && code && (
        <div className="w-full flex flex-col items-center gap-1.5">
          <span className="text-white/40 text-[11px] uppercase tracking-widest font-bold">{t('auth.wechatCodeLabel')}</span>
          <div className="flex items-center gap-2">
            <span className="text-white text-[26px] font-bold tracking-[0.3em] pl-[0.3em] font-mono select-all">{code}</span>
            <button
              type="button"
              onClick={copyCode}
              className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 text-[11px] transition-colors"
            >
              {copied ? t('auth.wechatCopied') : t('auth.wechatCopy')}
            </button>
          </div>
          <span className="text-white/30 text-[11px]">{t('auth.wechatCodeCaseInsensitive')}</span>
        </div>
      )}

      {status === 'error' && (
        <>
          {errorMsg && (
            <div className="w-full text-red-500 text-[13px] font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">
              {errorMsg}
            </div>
          )}
          <button
            type="button"
            onClick={startSession}
            className="text-white/60 hover:text-white text-[13px] transition-colors"
          >
            {t('auth.wechatRefresh')}
          </button>
        </>
      )}

      <p className="text-white/30 text-[12px]">{t('auth.wechatFollowHint')}</p>
    </div>
  );
};
