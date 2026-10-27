import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User, LogIn } from 'lucide-react';
import { checkCredentials } from '../lib/auth';
import { AUTHOR } from '../lib/author';
import { CENTER_NAME } from '../lib/academic';

// Màn hình đăng nhập: không gợi ý hay điền sẵn tên đăng nhập / mật khẩu
const LoginScreen: React.FC<{ onSuccess: () => void }> = ({ onSuccess }) => {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [failCount, setFailCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!user.trim() || !pass) return setError('Vui lòng nhập tên đăng nhập và mật khẩu.');
    setBusy(true);
    // Chậm dần khi nhập sai nhiều lần để hạn chế dò mật khẩu
    const delay = Math.min(failCount, 5) * 400;
    setTimeout(() => {
      if (checkCredentials(user, pass)) {
        onSuccess();
      } else {
        setFailCount(c => c + 1);
        setPass('');
        setError('Tên đăng nhập hoặc mật khẩu không đúng.');
      }
      setBusy(false);
    }, delay);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-800 overflow-y-auto">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl p-7">
          <div className="flex flex-col items-center text-center">
            <img src={AUTHOR.logo} alt="Logo" className="w-20 h-20 rounded-2xl object-contain border border-slate-100" />
            <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-blue-600">Hệ thống quản lý</div>
            <h1 className="text-[17px] font-bold text-slate-800 leading-snug mt-1">{CENTER_NAME}</h1>
            <p className="text-sm text-slate-500 mt-1">Vui lòng đăng nhập để tiếp tục</p>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4" autoComplete="off">
            <div>
              <label htmlFor="login-user" className="text-sm font-medium text-slate-700">Tên đăng nhập</label>
              <div className="relative mt-1">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input id="login-user" autoFocus autoComplete="off" value={user} onChange={e => { setUser(e.target.value); setError(''); }}
                  className="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label htmlFor="login-pass" className="text-sm font-medium text-slate-700">Mật khẩu</label>
              <div className="relative mt-1">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input id="login-pass" type={showPass ? 'text' : 'password'} autoComplete="new-password" value={pass} onChange={e => { setPass(e.target.value); setError(''); }}
                  className="w-full h-11 pl-10 pr-11 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600" aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
            <button type="submit" disabled={busy} className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold flex items-center justify-center gap-2">
              <LogIn className="w-4 h-4" /> {busy ? 'Đang kiểm tra...' : 'Đăng nhập'}
            </button>
          </form>
        </div>

        <div className="mt-5 flex items-center justify-center gap-3 text-white/90">
          <img src={AUTHOR.avatar} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-white/70" />
          <div className="text-sm leading-tight">
            <div className="text-[11px] text-white/70">Tác giả</div>
            <div className="font-semibold">{AUTHOR.name} — {AUTHOR.school}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;
