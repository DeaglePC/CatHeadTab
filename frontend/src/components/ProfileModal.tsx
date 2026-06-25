import React, { useState, useEffect, useRef } from 'react';
import { useConfigStore } from '../store/configStore';
import { useLayoutStore } from '../store/layoutStore';
import { useTranslation } from '../i18n/useTranslation';
import { compressAvatarToWebP } from '../utils/imageStore';
import { isPasswordAcceptable } from '../utils/passwordStrength';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';
import client from '../api/client';
import { useFloatingWindow } from '../hooks/useFloatingWindow';
import { WeChatQR } from './WeChatQR';

interface LinkedAccount {
  provider: string;
  provider_username: string;
  provider_email: string;
  avatar_url: string;
  linked_at: string;
}

export const ProfileModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { userProfile, logout, setUserProfile } = useConfigStore();
  const { uploadLayoutToCloud, pullLayoutFromCloud, mergeLayoutWithCloud } = useLayoutStore();
  const { t } = useTranslation();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const floatingWindow = useFloatingWindow({
    defaultSize: () => ({
      width: 448,
      height: typeof window === 'undefined' ? 680 : Math.min(720, window.innerHeight - 96),
    }),
    minHeight: 420,
    minWidth: 360,
  });

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);
  const [errorMsg, setErrorMsg] = useState('');

  // Change password
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Linked accounts
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [oauthConfig, setOAuthConfig] = useState<{ github_client_id: string; google_client_id: string; oauth_callback_url: string; wechat_enabled?: boolean } | null>(null);
  // WeChat bind QR overlay
  const [showWeChatBind, setShowWeChatBind] = useState(false);
  // Account deletion (typed confirmation)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Avatar upload
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const MAX_AVATAR_FILE_SIZE = 20 * 1024 * 1024; // 20 MB before compression

  useEffect(() => {
    // Fallback: if userProfile is missing, fetch it now
    if (!userProfile) {
      client.get('/api/v1/user/profile')
        .then(res => setUserProfile(res.data))
        .catch(() => {});
    }

    // Fetch linked accounts
    client.get('/api/v1/user/linked-accounts')
      .then(res => setLinkedAccounts(res.data.accounts || []))
      .catch(() => {});

    // Fetch OAuth config
    client.get('/api/v1/auth/oauth-config')
      .then(res => setOAuthConfig(res.data))
      .catch(() => {});
  }, []);

  const handleAction = async (actionName: string, actionFn: () => Promise<void>) => {
    if (loadingAction) return;
    
    if (actionName === 'Pull' && !window.confirm(t('profile.pullWarning'))) {
      return;
    }

    setLoadingAction(actionName);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await actionFn();
      setSuccessMsg(`${actionName} completed successfully!`);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(`Failed to perform ${actionName}. ${err?.message || ''}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setErrorMsg('');
    setSuccessMsg('');

    if (newPassword !== confirmPassword) {
      setPasswordError(t('auth.passwordMismatch'));
      return;
    }

    if (!isPasswordAcceptable(newPassword)) {
      setPasswordError(t('password.tooWeak'));
      return;
    }

    setLoadingAction('ChangePassword');
    try {
      await client.post('/api/v1/user/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setSuccessMsg(t('profile.passwordChanged'));
      setShowChangePassword(false);
      setPasswordError('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setPasswordError(err.response?.data?.error || t('profile.passwordChangeFailed'));
      // Keep the form open so user can retry
    } finally {
      setLoadingAction(null);
    }
  };

  const handleResendVerification = async () => {
    setLoadingAction('Verify');
    setErrorMsg('');
    try {
      await client.post('/api/v1/user/resend-verification');
      setSuccessMsg(t('profile.verificationSent'));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to send verification email');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleLinkOAuth = (provider: 'github' | 'google') => {
    if (!oauthConfig) return;

    const callbackBase = oauthConfig.oauth_callback_url;
    if (!callbackBase) return;

    const redirectUri = encodeURIComponent(callbackBase + '/' + provider);
    let authUrl = '';

    if (provider === 'github') {
      if (!oauthConfig.github_client_id) return;
      authUrl = `https://github.com/login/oauth/authorize?client_id=${oauthConfig.github_client_id}&redirect_uri=${redirectUri}&scope=read:user,user:email&state=link_${provider}`;
    } else {
      if (!oauthConfig.google_client_id) return;
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${oauthConfig.google_client_id}&redirect_uri=${redirectUri}&response_type=code&scope=openid%20email%20profile&state=link_${provider}&access_type=offline&prompt=consent`;
    }

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(authUrl, 'oauth_link', `width=${width},height=${height},left=${left},top=${top}`);

    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === 'oauth_callback' && event.data?.code) {
        window.removeEventListener('message', handleMessage);
        popup?.close();

        setLoadingAction('Link');
        setErrorMsg('');
        try {
          await client.post(`/api/v1/user/link/${provider}`, { code: event.data.code });
          // Refresh linked accounts
          const res = await client.get('/api/v1/user/linked-accounts');
          setLinkedAccounts(res.data.accounts || []);
          setSuccessMsg(t('profile.accountLinked'));
          setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err: any) {
          setErrorMsg(err.response?.data?.error || 'Failed to link account');
        } finally {
          setLoadingAction(null);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
      }
    }, 500);
  };

  const handleUnlinkOAuth = async (provider: string) => {
    if (!window.confirm(t('profile.unlinkConfirm', { provider }))) return;

    setLoadingAction('Unlink');
    setErrorMsg('');
    try {
      await client.delete(`/api/v1/user/link/${provider}`);
      setLinkedAccounts(prev => prev.filter(a => a.provider !== provider));
      setSuccessMsg(t('profile.accountUnlinked'));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to unlink account');
    } finally {
      setLoadingAction(null);
    }
  };

  // WeChat scan-to-bind confirmed — refresh the linked accounts list.
  const handleWeChatBindSuccess = async () => {
    setShowWeChatBind(false);
    try {
      const res = await client.get('/api/v1/user/linked-accounts');
      setLinkedAccounts(res.data.accounts || []);
      setSuccessMsg(t('profile.accountLinked'));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      // Non-fatal; the list will refresh on next open.
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input so the same file can be re-selected
    e.target.value = '';

    if (file.size > MAX_AVATAR_FILE_SIZE) {
      setErrorMsg(t('profile.avatarTooLarge'));
      return;
    }

    setAvatarUploading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      // Compress to WebP, square-cropped, max 512px
      const compressed = await compressAvatarToWebP(file);

      const formData = new FormData();
      formData.append('avatar', compressed, 'avatar.webp');

      const res = await client.post('/api/v1/user/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Update local profile with new avatar URL
      if (userProfile && res.data.avatar_url) {
        setUserProfile({ ...userProfile, avatar_url: res.data.avatar_url });
      }
      setSuccessMsg(t('profile.avatarUpdated'));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to upload avatar');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    if (!window.confirm(t('profile.avatarRemoveConfirm'))) return;

    setAvatarUploading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await client.delete('/api/v1/user/avatar');
      if (userProfile) {
        setUserProfile({ ...userProfile, avatar_url: '' });
      }
      setSuccessMsg(t('profile.avatarRemoved'));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to remove avatar');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleLogout = () => {
    if (window.confirm(t('profile.logoutWarning'))) {
      logout();
      onClose();
    }
  };

  // Permanently delete the account, then sign out locally.
  const handleDeleteAccount = async () => {
    setLoadingAction('Delete');
    setErrorMsg('');
    try {
      await client.delete('/api/v1/user');
      logout();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || t('profile.deleteAccountFailed'));
      setLoadingAction(null);
    }
  };

  const isLinked = (provider: string) => linkedAccounts.some(a => a.provider === provider);
  const getLinked = (provider: string) => linkedAccounts.find(a => a.provider === provider);

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
        className={`relative w-full max-w-md sm:fixed sm:left-[var(--floating-window-left)] sm:top-[var(--floating-window-top)] sm:w-[var(--floating-window-width)] sm:h-[var(--floating-window-height)] sm:max-w-[calc(100vw-3rem)] sm:max-h-[calc(100vh-3rem)] bg-black/30 backdrop-blur-xl border border-white/10 rounded-[1.5rem] md:rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.55)] flex flex-col pointer-events-auto transform animate-scaleIn overflow-hidden max-h-[90vh] select-none transition-all ${floatingWindow.isInteracting ? 'duration-0' : 'duration-300'}`}
        style={floatingWindow.style}
        onClick={e => e.stopPropagation()}
      >
        {/* Window Header */}
        <div
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
            <span className="text-[13px] font-semibold text-white/70">{userProfile?.username || 'Profile'}</span>
          </div>
          
          {/* Right: close button on mobile */}
          <div className="flex items-center w-auto md:w-20 justify-end">
            <button
              onClick={onClose}
              className="md:hidden w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/70">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
            <div className="hidden md:block w-20" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 desktop-scrollbar">
          {/* Avatar & Name */}
          <div className="flex flex-col items-center mb-6">
            {/* Avatar with upload overlay */}
            <div className="relative group mb-4">
              <div
                className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#72d565] to-[#24a148] flex items-center justify-center text-3xl font-bold text-black shadow-lg ring-4 ring-[#72d565]/20 overflow-hidden cursor-pointer"
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatarUploading ? (
                  <svg className="animate-spin w-8 h-8 text-black/60" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : userProfile?.avatar_url ? (
                  <img src={userProfile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  userProfile?.username?.charAt(0).toUpperCase() || '?'
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </div>
              </div>
              {/* Remove avatar button (only when user has a custom avatar) */}
              {userProfile?.avatar_url && !avatarUploading && (
                <button
                  onClick={handleAvatarRemove}
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500/80 hover:bg-red-500 border-2 border-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title={t('profile.avatarRemove')}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              )}
              {/* Hidden file input */}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
                disabled={avatarUploading}
              />
            </div>
            <h2 className="text-2xl font-bold text-white">{userProfile?.username || 'User'}</h2>
            <p className="text-white/50 text-[14px] mt-1">{userProfile?.email || 'Connected Account'}</p>

            {/* Email verification badge */}
            {userProfile && !userProfile.email_verified && (
              <button 
                onClick={handleResendVerification}
                disabled={loadingAction === 'Verify'}
                className="mt-2 flex items-center gap-1.5 text-amber-400 text-[12px] bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                {loadingAction === 'Verify' ? t('auth.processing') : t('profile.verifyEmail')}
              </button>
            )}
            {userProfile?.email_verified && (
              <span className="mt-2 flex items-center gap-1.5 text-[#72d565] text-[12px] bg-[#72d565]/10 px-3 py-1.5 rounded-full border border-[#72d565]/20">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                {t('profile.emailVerified')}
              </span>
            )}

            {/* Role badge */}
            {userProfile?.role && (
              userProfile.role === 'admin' ? (
                <span className="mt-2 flex items-center gap-1.5 text-amber-400 text-[12px] bg-amber-400/10 px-3 py-1.5 rounded-full border border-amber-400/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  {t('profile.roleAdmin')}
                </span>
              ) : userProfile.role === 'pro' ? (
                <span className="mt-2 flex items-center gap-1.5 text-purple-400 text-[12px] bg-purple-400/10 px-3 py-1.5 rounded-full border border-purple-400/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  {t('profile.rolePro')}
                </span>
              ) : (
                <span className="mt-2 flex items-center gap-1.5 text-blue-400 text-[12px] bg-blue-400/10 px-3 py-1.5 rounded-full border border-blue-400/20">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  {t('profile.roleUser')}
                </span>
              )
            )}
          </div>

          {errorMsg && <div className="mb-4 text-red-500 text-[13px] font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{errorMsg}</div>}
          {successMsg && <div className="mb-4 text-[#72d565] text-[13px] font-medium text-center bg-[#72d565]/10 p-3 rounded-xl border border-[#72d565]/20">{successMsg}</div>}

          {/* Linked Accounts Section */}
          <div className="space-y-3 mb-6">
            <h3 className="text-[11px] uppercase tracking-widest font-bold text-white/40 ml-1 mb-2">{t('profile.linkedAccounts')}</h3>
            
            {/* GitHub */}
            <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.161 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
                <div>
                  <span className="text-white font-medium text-[14px]">GitHub</span>
                  {isLinked('github') && (
                    <p className="text-white/40 text-[12px]">{getLinked('github')?.provider_username || getLinked('github')?.provider_email}</p>
                  )}
                </div>
              </div>
              {isLinked('github') ? (
                <button 
                  onClick={() => handleUnlinkOAuth('github')}
                  disabled={!!loadingAction}
                  className="text-red-400 text-[12px] font-medium hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {t('profile.unlink')}
                </button>
              ) : (
                <button 
                  onClick={() => handleLinkOAuth('github')}
                  disabled={!!loadingAction || !oauthConfig?.github_client_id}
                  className="text-blue-400 text-[12px] font-medium hover:text-blue-300 transition-colors disabled:opacity-50"
                >
                  {oauthConfig?.github_client_id ? t('profile.link') : t('profile.notConfigured')}
                </button>
              )}
            </div>

            {/* Google */}
            <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <svg width="24" height="24" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                <div>
                  <span className="text-white font-medium text-[14px]">Google</span>
                  {isLinked('google') && (
                    <p className="text-white/40 text-[12px]">{getLinked('google')?.provider_email || getLinked('google')?.provider_username}</p>
                  )}
                </div>
              </div>
              {isLinked('google') ? (
                <button 
                  onClick={() => handleUnlinkOAuth('google')}
                  disabled={!!loadingAction}
                  className="text-red-400 text-[12px] font-medium hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {t('profile.unlink')}
                </button>
              ) : (
                <button 
                  onClick={() => handleLinkOAuth('google')}
                  disabled={!!loadingAction || !oauthConfig?.google_client_id}
                  className="text-blue-400 text-[12px] font-medium hover:text-blue-300 transition-colors disabled:opacity-50"
                >
                  {oauthConfig?.google_client_id ? t('profile.link') : t('profile.notConfigured')}
                </button>
              )}
            </div>

            {/* WeChat */}
            <div className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="#07c160"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 4.882-1.932 7.621-.55C20.811 6.5 16.873 2.188 8.691 2.188zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.111 2.351-.348a.825.825 0 0 1 .654.087l1.546.902a.272.272 0 0 0 .136.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.318-1.21a.49.49 0 0 1 .178-.554c1.526-1.124 2.514-2.81 2.514-4.7 0-3.366-3.219-6.09-7.192-6.45a8.29 8.29 0 0 0-.295-.003zm-3.151 1.99c.534 0 .967.44.967.982a.976.976 0 0 1-.967.982.976.976 0 0 1-.967-.982c0-.542.433-.982.967-.982zm4.84 0c.534 0 .967.44.967.982a.976.976 0 0 1-.967.982.976.976 0 0 1-.968-.982c0-.542.434-.982.968-.982z"/></svg>
                <div>
                  <span className="text-white font-medium text-[14px]">{t('profile.wechat')}</span>
                  {isLinked('wechat') && (
                    <p className="text-white/40 text-[12px]">{getLinked('wechat')?.provider_username || t('profile.wechatLinked')}</p>
                  )}
                </div>
              </div>
              {isLinked('wechat') ? (
                <button
                  onClick={() => handleUnlinkOAuth('wechat')}
                  disabled={!!loadingAction}
                  className="text-red-400 text-[12px] font-medium hover:text-red-300 transition-colors disabled:opacity-50"
                >
                  {t('profile.unlink')}
                </button>
              ) : (
                <button
                  onClick={() => setShowWeChatBind(true)}
                  disabled={!!loadingAction || !oauthConfig?.wechat_enabled}
                  className="text-blue-400 text-[12px] font-medium hover:text-blue-300 transition-colors disabled:opacity-50"
                >
                  {oauthConfig?.wechat_enabled ? t('profile.link') : t('profile.notConfigured')}
                </button>
              )}
            </div>
          </div>

          {/* Change Password Section */}
          {userProfile?.has_password && (
            <div className="mb-6">
              <h3 className="text-[11px] uppercase tracking-widest font-bold text-white/40 ml-1 mb-2">{t('profile.security')}</h3>
              {!showChangePassword ? (
                <button 
                  onClick={() => setShowChangePassword(true)}
                  className="w-full rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-4 text-left transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-400">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-[15px]">{t('profile.changePassword')}</h4>
                      <p className="text-[12px] text-white/50 mt-0.5">{t('profile.changePasswordDesc')}</p>
                    </div>
                  </div>
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
                  {passwordError && (
                    <div className="text-red-500 text-[13px] font-medium text-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">{passwordError}</div>
                  )}
                  <input 
                    type="password" 
                    placeholder={t('auth.currentPassword')} 
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    required
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-[14px] text-white focus:outline-none focus:border-white/50 transition-all placeholder-white/40"
                  />
                  <input 
                    type="password" 
                    placeholder={t('auth.newPassword')} 
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-[14px] text-white focus:outline-none focus:border-white/50 transition-all placeholder-white/40"
                  />
                  {newPassword && (
                    <PasswordStrengthIndicator password={newPassword} />
                  )}
                  <input 
                    type="password" 
                    placeholder={t('auth.confirmPassword')} 
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-[14px] text-white focus:outline-none focus:border-white/50 transition-all placeholder-white/40"
                  />
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => { setShowChangePassword(false); setPasswordError(''); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                      className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 font-medium text-[13px] transition-colors"
                    >
                      {t('settings.cancel')}
                    </button>
                    <button 
                      type="submit"
                      disabled={loadingAction === 'ChangePassword'}
                      className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-[13px] transition-colors disabled:opacity-50"
                    >
                      {loadingAction === 'ChangePassword' ? t('auth.processing') : t('profile.updatePassword')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Cloud Sync */}
          <div className="space-y-3 mb-6">
            <h3 className="text-[11px] uppercase tracking-widest font-bold text-white/40 ml-1 mb-2">{t('profile.cloudSync')}</h3>
            
            <button 
              onClick={() => handleAction('Upload', uploadLayoutToCloud)}
              disabled={!!loadingAction}
              className="w-full relative group overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <div>
                  <h4 className="font-bold text-white text-[15px]">{t('profile.upload')}</h4>
                  <p className="text-[12px] text-white/50 mt-0.5">{t('profile.uploadDesc')}</p>
                </div>
                {loadingAction === 'Upload' && <div className="ml-auto animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />}
              </div>
            </button>

            <button 
              onClick={() => handleAction('Merge', mergeLayoutWithCloud)}
              disabled={!!loadingAction}
              className="w-full relative group overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="7.5 4.21 12 6.81 16.5 4.21"/><polyline points="7.5 19.79 7.5 14.6 3 12"/><polyline points="21 12 16.5 14.6 16.5 19.79"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                </div>
                <div>
                  <h4 className="font-bold text-white text-[15px]">{t('profile.merge')}</h4>
                  <p className="text-[12px] text-white/50 mt-0.5">{t('profile.mergeDesc')}</p>
                </div>
                {loadingAction === 'Merge' && <div className="ml-auto animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />}
              </div>
            </button>

            <button 
              onClick={() => handleAction('Pull', pullLayoutFromCloud)}
              disabled={!!loadingAction}
              className="w-full relative group overflow-hidden rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 p-4 text-left transition-all active:scale-[0.98] disabled:opacity-50"
            >
              <div className="flex items-center gap-4 relative z-10">
                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </div>
                <div>
                  <h4 className="font-bold text-white text-[15px]">{t('profile.pull')}</h4>
                  <p className="text-[12px] text-white/50 mt-0.5 text-orange-400/80">{t('profile.pullDesc')}</p>
                </div>
                {loadingAction === 'Pull' && <div className="ml-auto animate-spin w-5 h-5 border-2 border-white/20 border-t-white rounded-full" />}
              </div>
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="w-full py-3.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 font-bold transition-colors"
          >
            {t('profile.signOut')}
          </button>

          {/* Danger zone: permanent account deletion */}
          <div className="mt-3 pt-3 border-t border-white/10">
            {!showDeleteConfirm ? (
              <button
                onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(''); setErrorMsg(''); }}
                className="w-full py-2.5 text-red-400/70 hover:text-red-400 text-[13px] font-medium transition-colors"
              >
                {t('profile.deleteAccount')}
              </button>
            ) : (
              <div className="rounded-xl bg-red-500/5 border border-red-500/20 p-4 space-y-3">
                <p className="text-[13px] text-red-400 font-bold">{t('profile.deleteAccount')}</p>
                <p className="text-[12px] text-white/50 leading-relaxed">{t('profile.deleteAccountDesc')}</p>
                <p className="text-[12px] text-white/60">{t('profile.deleteAccountConfirm', { username: userProfile?.username || '' })}</p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder={userProfile?.username || ''}
                  autoComplete="off"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-[14px] text-white focus:outline-none focus:border-red-500/50 transition-colors"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                    className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 font-medium text-[13px] transition-colors"
                  >
                    {t('settings.cancel')}
                  </button>
                  <button
                    onClick={handleDeleteAccount}
                    disabled={loadingAction === 'Delete' || !userProfile?.username || deleteConfirmText !== userProfile.username}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/80 hover:bg-red-500 text-white font-bold text-[13px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loadingAction === 'Delete' ? t('auth.processing') : t('profile.deleteAccountButton')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {floatingWindow.resizeHandle}
      </div>

      {/* WeChat bind QR overlay (stacked above the profile window) */}
      {showWeChatBind && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-auto">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setShowWeChatBind(false)} />
          <div className="relative w-full max-w-xs bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-[0_30px_80px_rgba(0,0,0,0.55)] p-6 flex flex-col items-center gap-4 animate-scaleIn">
            <div className="w-full flex items-center justify-between">
              <h3 className="text-white font-semibold text-[15px]">{t('profile.wechatBindTitle')}</h3>
              <button onClick={() => setShowWeChatBind(false)} className="text-white/40 hover:text-white/80 transition-colors">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            <WeChatQR mode="link" onSuccess={handleWeChatBindSuccess} />
          </div>
        </div>
      )}
    </div>
  );
};
