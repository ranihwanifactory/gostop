
import React, { useState } from 'react';
// Fix: Ensuring all authentication functions are correctly exported from firebase/auth
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile 
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';

const AuthView: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (cred.user) {
          await updateProfile(cred.user, { 
            displayName: displayName || email.split('@')[0] 
          });
        }
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-cover bg-center" style={{backgroundImage: 'url("https://picsum.photos/1600/900?grayscale")'}}>
      <div className="bg-black/80 p-8 rounded-2xl w-full max-w-md backdrop-blur-md border border-red-900/50 shadow-2xl text-white">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-black text-red-600 italic tracking-tighter mb-2">MATGO MASTER</h1>
          <p className="text-neutral-400">최고의 화투 대결을 시작하세요</p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500 text-red-200 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailAuth} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">사용자 이름</label>
              <input 
                type="text" 
                value={displayName} 
                onChange={e => setDisplayName(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-3 focus:outline-none focus:border-red-600 text-white"
                placeholder="이름 입력"
                required
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">이메일</label>
            <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-3 focus:outline-none focus:border-red-600 text-white"
              placeholder="example@mail.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">비밀번호</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-700 rounded-lg p-3 focus:outline-none focus:border-red-600 text-white"
              placeholder="••••••••"
              required
            />
          </div>
          <button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-red-900/20">
            {isLogin ? '로그인' : '회원가입'}
          </button>
        </form>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-800"></div></div>
          <div className="relative flex justify-center text-xs uppercase"><span className="bg-transparent px-2 text-neutral-500 font-bold">또는</span></div>
        </div>

        <button 
          onClick={handleGoogleLogin}
          type="button"
          className="w-full bg-white hover:bg-neutral-100 text-black font-bold py-3 rounded-lg transition flex items-center justify-center gap-2"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
          Google로 계속하기
        </button>

        <p className="mt-8 text-center text-neutral-500 text-sm">
          {isLogin ? '계정이 없으신가요?' : '이미 계정이 있으신가요?'}
          <button 
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="ml-2 text-red-500 font-bold hover:underline"
          >
            {isLogin ? '가입하기' : '로그인'}
          </button>
        </p>
      </div>
    </div>
  );
};

export default AuthView;
