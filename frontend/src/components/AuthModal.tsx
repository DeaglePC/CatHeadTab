import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useConfigStore, isEnvConfigured } from '../store/configStore';
import client from '../api/client';
import { useTranslation } from '../i18n/useTranslation';
import { isPasswordAcceptable } from '../utils/passwordStrength';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';
import { useFloatingWindow } from '../hooks/useFloatingWindow';
import { WeChatQR } from './WeChatQR';

// 参考 Twitter 规则：4-15 字符，只允许字母、数字、下划线
const USERNAME_REGEX = /^[a-zA-Z0-9_]{4,15}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

type AuthView = 'login' | 'register' | 'forgot' | 'verify-pending' | 'wechat';
type ModalStep = 'server' | 'auth';

export const AuthModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { serverUrl, setServerUrl, setJwtToken, setUserProfile } = useConfigStore();
  const { t } = useTranslation();
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const floatingWindow = useFloatingWindow({
    defaultSize: () => ({
      width: 384,
      height: typeof window === 'undefined' ? 400 : Math.min(400, window.innerHeight - 96),
    }),
    minHeight: 360,
    minWidth: 340,
  });

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Skip server step if env variable is set OR serverUrl is already configured
  const [step, setStep] = useState<ModalStep>((isEnvConfigured || serverUrl) ? 'auth' : 'server');
  const [serverInput, setServerInput] = useState(serverUrl);
  const [serverLoading, setServerLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const [view, setView] = useState<AuthView>('login');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthConfig, setOAuthConfig] = useState<{ github_client_id: string; google_client_id: string; oauth_callback_url: string; wechat_enabled?: boolean } | null>(null);
  const [pendingEmail, setPendingEmail] = useState('');

  // Rate limit countdown
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCooldown = useCallback((seconds: number) => {
    if (cooldownRef.current) {
      clearInterval(cooldownRef.current);
    }
    setCooldown(seconds);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          cooldownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  // Clear rate-limit error when cooldown ends
  useEffect(() => {
    if (cooldown === 0 && error === t('auth.rateLimited')) {
      setError('');
    }
  }, [cooldown, error, t]);

  // Validate and save server URL
  const handleServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = serverInput.replace(/\/+$/, '').trim();
    if (!url) {
      setServerError(t('auth.serverUrlRequired'));
      return;
    }
    setServerLoading(true);
    setServerError('');
    try {
      const res = await fetch(`${url}/api/v1/health`);
      if (!res.ok) throw new Error('unhealthy');
      setServerUrl(url);
      setStep('auth');
    } catch {
      setServerError(t('auth.serverConnectFailed'));
    } finally {
      setServerLoading(false);
    }
  };

  // Fetch OAuth config once we are on the auth step
  useEffect(() => {
    if (step !== 'auth') return;
    client.get('/api/v1/auth/oauth-config')
      .then(res => setOAuthConfig(res.data))
      .catch(() => { /* OAuth not configured, buttons will be hidden */ });
  }, [step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      if (view === 'login') {
        const res = await client.post('/api/v1/auth/login', { identifier, password });
        setJwtToken(res.data.token);
        // Immediately fetch profile after login so ProfileModal has data
        try {
          const profileRes = await client.get('/api/v1/user/profile');
          setUserProfile(profileRes.data);
        } catch {
          // Profile fetch will be retried by App.tsx useEffect
        }
        onClose();
      } else if (view === 'register') {
        // 校验邮箱格式
        if (!EMAIL_REGEX.test(email)) {
          setError(t('auth.invalidEmail'));
          setLoading(false);
          return;
        }
        // 校验用户名格式（4-15 字符，仅字母/数字/下划线）
        if (!USERNAME_REGEX.test(username)) {
          setError(t('auth.invalidUsername'));
          setLoading(false);
          return;
        }
        // 校验密码强度
        if (!isPasswordAcceptable(password)) {
          setError(t('password.tooWeak'));
          setLoading(false);
          return;
        }
        // 校验两次密码一致
        if (password !== confirmPassword) {
          setError(t('auth.passwordMismatch'));
          setLoading(false);
          return;
        }
        await client.post('/api/v1/auth/register', { email, username, password });
        // Registration no longer returns a JWT — show verification pending view
        setPendingEmail(email);
        setView('verify-pending');
      } else if (view === 'forgot') {
        await client.post('/api/v1/auth/forgot-password', { email });
        setSuccess(t('auth.resetEmailSent'));
      }
    } catch (err: any) {
      // Handle email-not-verified on login (HTTP 403)
      if (err.response?.status === 403 && err.response?.data?.email_not_verified) {
        setPendingEmail(err.response.data.email || identifier);
        setView('verify-pending');
      } else if (err.response?.status === 429) {
        // Rate limited — start countdown
        const retryAfter = err.response?.data?.retry_after || 60;
        startCooldown(retryAfter);
        setError(t('auth.rateLimited'));
      } else {
        setError(err.response?.data?.error || t('auth.authFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!pendingEmail) return;
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await client.post('/api/v1/auth/resend-verification', { email: pendingEmail });
      setSuccess(t('auth.verificationResent'));
    } catch (err: any) {
      if (err.response?.status === 429) {
        const retryAfter = err.response?.data?.retry_after || 60;
        startCooldown(retryAfter);
        setError(t('auth.rateLimited'));
      } else {
        setError(t('auth.authFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = (provider: 'github' | 'google') => {
    if (!oauthConfig) return;

    const callbackBase = oauthConfig.oauth_callback_url;
    if (!callbackBase) {
      setError(t('auth.oauthNotConfigured'));
      return;
    }

    const redirectUri = encodeURIComponent(callbackBase + '/' + provider);

    let authUrl = '';
    if (provider === 'github') {
      if (!oauthConfig.github_client_id) {
        setError(t('auth.oauthNotConfigured'));
        return;
      }
      authUrl = `https://github.com/login/oauth/authorize?client_id=${oauthConfig.github_client_id}&redirect_uri=${redirectUri}&scope=read:user,user:email&state=${provider}`;
    } else {
      if (!oauthConfig.google_client_id) {
        setError(t('auth.oauthNotConfigured'));
        return;
      }
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${oauthConfig.google_client_id}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email%20profile&state=${provider}&access_type=offline&prompt=consent`;
    }

    // Open OAuth popup
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(authUrl, 'oauth', `width=${width},height=${height},left=${left},top=${top}`);

    // Listen for the callback message
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'oauth_callback' && event.data?.code) {
        window.removeEventListener('message', handleMessage);
        popup?.close();

        setLoading(true);
        setError('');
        try {
          const res = await client.post(`/api/v1/auth/${event.data.provider}`, { code: event.data.code });
          setJwtToken(res.data.token);
          // Immediately fetch profile after OAuth login so ProfileModal has data
          try {
            const profileRes = await client.get('/api/v1/user/profile');
            setUserProfile(profileRes.data);
          } catch {
            // Profile fetch will be retried by App.tsx useEffect
          }
          onClose();
        } catch (err: any) {
          setError(err.response?.data?.error || t('auth.oauthFailed'));
        } finally {
          setLoading(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Cleanup if popup is closed manually
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
      }
    }, 500);
  };

  // WeChat scan login confirmed — store the token and fetch the profile,
  // mirroring the OAuth success path.
  const handleWeChatSuccess = async (data?: { token: string; user: unknown }) => {
    if (!data) return;
    setJwtToken(data.token);
    try {
      const profileRes = await client.get('/api/v1/user/profile');
      setUserProfile(profileRes.data);
    } catch {
      // Profile fetch will be retried by App.tsx useEffect
    }
    onClose();
  };

  const switchView = (newView: AuthView) => {
    setView(newView);
    setError('');
    setSuccess('');
    setConfirmPassword('');
    setCooldown(0);
    if (cooldownRef.current) {
      clearInterval(cooldownRef.current);
      cooldownRef.current = null;
    }
    if (newView !== 'verify-pending') {
      setPendingEmail('');
    }
  };

  const showOAuth = oauthConfig && (oauthConfig.github_client_id || oauthConfig.google_client_id || oauthConfig.wechat_enabled);

  const measureAndResize = useCallback(() => {
    if (typeof window === 'undefined' || window.innerWidth < 640) return;
    const headerElement = headerRef.current;
    const contentElement = contentRef.current;
    if (!headerElement || !contentElement) return;

    // offsetHeight (layout box), not getBoundingClientRect (visual box): the
    // window plays a scaleIn transform on open, and a transformed bounding rect
    // would report the header a few px shorter than its laid-out height, fitting
    // the window too small and leaving a stray scrollbar until the next resize.
    const nextHeight = Math.ceil(
      headerElement.offsetHeight
      + contentElement.scrollHeight
      + 2,
    );

    floatingWindow.setWindowSize((currentSize) => ({
      width: currentSize.width,
      height: nextHeight,
    }));
  }, [floatingWindow.setWindowSize]);

  // Re-measure synchronously when the rendered content changes (view switches,
  // errors, password indicator, etc.), AND observe the content box so async
  // views resize too — e.g. WeChat scan login grows the content after its
  // session loads (loading spinner → QR + verification code), long after the
  // `view` switch that a fixed dependency list keys off. The ResizeObserver is
  // the part that fixes WeChat; the deps keep the immediate resize (and cover
  // browsers without ResizeObserver).
  useLayoutEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) return;
    measureAndResize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measureAndResize());
    observer.observe(contentElement);
    return () => observer.disconnect();
  }, [measureAndResize, step, view, error, success, cooldown, password, showOAuth]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4 sm:p-12" onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      {/* Dimmed Background Overlay */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px] pointer-events-auto transition-opacity animate-fadeIn"
        onClick={onClose}
      />

      {/* App Window container */}
      <div 
        ref={floatingWindow.shellRef}
        className={`relative w-full max-w-sm sm:fixed sm:left-[var(--floating-window-left)] sm:top-[var(--floating-window-top)] sm:w-[var(--floating-window-width)] sm:h-[var(--floating-window-height)] sm:max-w-[calc(100vw-3rem)] sm:max-h-[calc(100vh-3rem)] bg-black/30 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden select-none transition-all ${floatingWindow.isInteracting ? 'duration-0' : 'duration-300'}`}
        style={floatingWindow.style}
        onClick={e => e.stopPropagation()}
      >
        {/* Window Header */}
        <div
          ref={headerRef}
          onPointerDown={floatingWindow.handleDragPointerDown}
          className="h-12 md:h-14 border-b border-white/10 flex items-center px-3 md:px-5 shrink-0 bg-white/[0.02] select-none sm:cursor-default"
        >
          {/* Left: Mac traffic lights on desktop */}
          <div className="flex items-center gap-2 w-auto md:w-20">
            <div className="hidden md:flex gap-2.5">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-[#ff5f56] hover:bg-[#ff5f56]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-red-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#ffbd2e] hover:bg-[#ffbd2e]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-yellow-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14"/></svg>
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-[#27c93f] hover:bg-[#27c93f]/80 flex items-center justify-center transition-colors group border border-black/20 !cursor-default">
                <svg className="w-2 h-2 text-green-900 opacity-0 group-hover:opacity-100" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
              </button>
            </div>
          </div>
          
          {/* Center title */}
          <div className="flex-1 flex justify-center">
            <span className="text-[13px] font-semibold text-white/70">
              {step === 'server' ? t('auth.serverSetupTitle') :
               view === 'forgot' ? t('auth.forgotPassword') :
               view === 'verify-pending' ? t('auth.emailNotVerifiedTitle') :
               view === 'wechat' ? t('auth.wechat') :
               t('auth.signIn')}
            </span>
          </div>
          
          {/* Right spacer */}
          <div className="flex items-center w-auto md:w-20 justify-end">
            <div className="hidden md:block w-20" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto desktop-scrollbar">
        {/* Inner wrapper measured for auto-resize — its natural height is independent
            of the stretched flex parent, so the window shrinks when switching to a
            shorter view (e.g. register → login) instead of leaving a blank gap. */}
        <div ref={contentRef} className="p-8">
        {/* ===== Step 1: Server URL Configuration ===== */}
        {step === 'server' && (
          <>
            <div className="mb-6 text-center">
              <h2 className="text-xl font-bold text-white mb-2">{t('auth.serverSetupTitle')}</h2>
              <p className="text-white/50 text-[13px]">{t('auth.serverSetupDesc')}</p>
            </div>

            {serverError && (
              <div className="mb-4 text-red-500 text-[13px] font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{serverError}</div>
            )}

            <form onSubmit={handleServerSubmit} className="flex flex-col gap-4">
              <input
                type="text"
                placeholder={t('auth.serverUrlPlaceholder')}
                value={serverInput}
                onChange={e => setServerInput(e.target.value)}
                required
                className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
              />
              <button
                type="submit"
                disabled={serverLoading}
                className="w-full mt-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-colors shadow-lg disabled:opacity-50"
              >
                {serverLoading ? t('auth.processing') : t('auth.serverConnect')}
              </button>
            </form>
          </>
        )}

        {/* ===== Step 2: Auth (Login / Register / Forgot / Verify-Pending) ===== */}
        {step === 'auth' && view !== 'forgot' && view !== 'verify-pending' && view !== 'wechat' && (
          <div className="flex justify-center mb-6">
            <div className="bg-black/40 backdrop-blur-xl p-1 rounded-full flex gap-1 border border-white/10">
              <button 
                type="button"
                className={`px-6 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all ${view === 'login' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:text-white/80'}`}
                onClick={() => switchView('login')}
              >
                {t('auth.signIn')}
              </button>
              <button 
                type="button"
                className={`px-6 py-2 rounded-full text-[13px] font-bold tracking-wide transition-all ${view === 'register' ? 'bg-white/20 text-white shadow-md' : 'text-white/50 hover:text-white/80'}`}
                onClick={() => switchView('register')}
              >
                {t('auth.signUp')}
              </button>
            </div>
          </div>
        )}

        {/* Forgot password header */}
        {step === 'auth' && view === 'forgot' && (
          <div className="mb-6 text-center">
            <h2 className="text-xl font-bold text-white mb-2">{t('auth.forgotPassword')}</h2>
            <p className="text-white/50 text-[13px]">{t('auth.forgotPasswordDesc')}</p>
          </div>
        )}

        {/* Email verification pending */}
        {step === 'auth' && view === 'verify-pending' && (
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <polyline points="22,7 12,13 2,7"/>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">{t('auth.emailNotVerifiedTitle')}</h2>
            <p className="text-white/50 text-[13px] leading-relaxed">{t('auth.emailNotVerifiedDesc')}</p>
            {pendingEmail && (
              <p className="text-white/70 text-[14px] font-medium break-all">{pendingEmail}</p>
            )}

            {error && <div className="w-full text-red-500 text-[13px] font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}
            {success && <div className="w-full text-[#72d565] text-[13px] font-medium text-center bg-[#72d565]/10 p-3 rounded-xl border border-[#72d565]/20">{success}</div>}

            <button
              type="button"
              disabled={loading || cooldown > 0}
              onClick={handleResendVerification}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-colors shadow-lg disabled:opacity-50"
            >
              {loading ? t('auth.processing') : cooldown > 0 ? `${t('auth.resendVerification')} (${cooldown}s)` : t('auth.resendVerification')}
            </button>

            <button
              type="button"
              onClick={() => switchView('login')}
              className="text-white/40 hover:text-white/70 text-[13px] transition-colors"
            >
              ← {t('auth.backToLogin')}
            </button>
          </div>
        )}

        {/* WeChat scan login */}
        {step === 'auth' && view === 'wechat' && (
          <div className="flex flex-col items-center gap-4">
            <WeChatQR mode="login" onSuccess={handleWeChatSuccess} />
            <button
              type="button"
              onClick={() => switchView('login')}
              className="text-white/40 hover:text-white/70 text-[13px] transition-colors"
            >
              ← {t('auth.backToLogin')}
            </button>
          </div>
        )}

        {step === 'auth' && view !== 'verify-pending' && view !== 'wechat' && (
          <>
            {error && <div className="mb-4 text-red-500 text-[13px] font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{error}</div>}
            {success && <div className="mb-4 text-[#72d565] text-[13px] font-medium text-center bg-[#72d565]/10 p-3 rounded-xl border border-[#72d565]/20">{success}</div>}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {view === 'login' && (
                <input 
                  type="text" 
                  placeholder={t('auth.usernameOrEmail')} 
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  required
                  className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
                />
              )}

              {view === 'register' && (
                <>
                  <input 
                    type="email" 
                    placeholder={t('auth.email')} 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
                  />
                  <input 
                    type="text" 
                    placeholder={t('auth.username')} 
                    value={username}
                    onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    minLength={4}
                    maxLength={15}
                    pattern="^[a-zA-Z0-9_]{4,15}$"
                    required
                    className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
                  />
                  <p className="text-white/30 text-[11px] -mt-2 px-1">{t('auth.usernameHint')}</p>
                </>
              )}

              {view === 'forgot' && (
                <input 
                  type="email" 
                  placeholder={t('auth.email')} 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
                />
              )}

              {view !== 'forgot' && (
                <input 
                  type="password" 
                  placeholder={t('auth.password')} 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
                />
              )}

              {view === 'register' && (
                <input 
                  type="password" 
                  placeholder={t('auth.confirmPassword')} 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-black/40 border border-white/10 hover:border-white/30 rounded-xl px-4 py-3 text-[15px] text-white focus:outline-none focus:border-white/50 transition-all shadow-inner placeholder-white/40"
                />
              )}

              {/* 注册时显示密码强度指示器 */}
              {view === 'register' && password && (
                <PasswordStrengthIndicator password={password} />
              )}

              {/* Forgot password link */}
              {view === 'login' && (
                <button 
                  type="button"
                  onClick={() => switchView('forgot')}
                  className="text-right text-white/40 hover:text-white/70 text-[12px] transition-colors -mt-2"
                >
                  {t('auth.forgotPassword')}
                </button>
              )}

              <button 
                type="submit" 
                disabled={loading || cooldown > 0}
                className="w-full mt-1 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold transition-colors shadow-lg disabled:opacity-50"
              >
                {loading ? t('auth.processing') : cooldown > 0 ? (
                  `${view === 'forgot' ? t('auth.sendResetLink') : view === 'register' ? t('auth.createAccount') : t('auth.continue')} (${cooldown}s)`
                ) : (
                  view === 'login' ? t('auth.continue') : 
                  view === 'register' ? t('auth.createAccount') : 
                  t('auth.sendResetLink')
                )}
              </button>
            </form>

            {/* Back to login from forgot */}
            {view === 'forgot' && (
              <button 
                type="button"
                onClick={() => switchView('login')}
                className="mt-4 text-white/40 hover:text-white/70 text-[13px] transition-colors text-center"
              >
                ← {t('auth.backToLogin')}
              </button>
            )}

            {/* OAuth section */}
            {view !== 'forgot' && showOAuth && (
              <>
                <div className="relative flex items-center justify-center my-6">
                  <div className="absolute inset-x-0 h-[1px] bg-white/10" />
                  <span className="relative bg-transparent px-4 text-[11px] uppercase font-bold tracking-widest text-white/40">{t('auth.or')}</span>
                </div>

                <div className="flex flex-col gap-3">
                  {oauthConfig?.github_client_id && (
                    <button 
                      type="button" 
                      onClick={() => handleOAuth('github')}
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-black/50 hover:bg-black/70 border border-white/10 text-white font-medium transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
                      {t('auth.github')}
                    </button>
                  )}
                  {oauthConfig?.google_client_id && (
                    <button 
                      type="button" 
                      onClick={() => handleOAuth('google')}
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-white text-black hover:bg-gray-100 border border-white/10 font-bold transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                      {t('auth.google')}
                    </button>
                  )}
                  {oauthConfig?.wechat_enabled && (
                    <button
                      type="button"
                      onClick={() => switchView('wechat')}
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-[#07c160] hover:bg-[#06ad56] border border-white/10 text-white font-bold transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 4.882-1.932 7.621-.55C20.811 6.5 16.873 2.188 8.691 2.188zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.111 2.351-.348a.825.825 0 0 1 .654.087l1.546.902a.272.272 0 0 0 .136.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.318-1.21a.49.49 0 0 1 .178-.554c1.526-1.124 2.514-2.81 2.514-4.7 0-3.366-3.219-6.09-7.192-6.45a8.29 8.29 0 0 0-.295-.003zm-3.151 1.99c.534 0 .967.44.967.982a.976.976 0 0 1-.967.982.976.976 0 0 1-.967-.982c0-.542.433-.982.967-.982zm4.84 0c.534 0 .967.44.967.982a.976.976 0 0 1-.967.982.976.976 0 0 1-.968-.982c0-.542.434-.982.968-.982z"/></svg>
                      {t('auth.wechat')}
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
        </div>
        </div>
        {floatingWindow.resizeHandle}
      </div>
    </div>
  );
};
