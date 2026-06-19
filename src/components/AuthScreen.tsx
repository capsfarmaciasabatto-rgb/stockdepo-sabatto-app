/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { translations } from '../translations';
import { User, Role } from '../types';
import farmaciaLogo from '../assets/images/farmacia_logo_1780424589468.png';
import { KeyRound, ShieldCheck, Mail, Lock, Stethoscope } from 'lucide-react';

interface AuthScreenProps {
  users: User[];
  onLoginSuccess: (user: User) => void;
  lang: 'es' | 'en';
}

export default function AuthScreen({ users, onLoginSuccess, lang }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('123456');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const t = translations[lang];

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    setTimeout(() => {
      const foundUser = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
      if (foundUser) {
        // Validación de constraseña real
        const expectedPassword = foundUser.password || '123456';
        if (password.trim() === expectedPassword.trim()) {
          onLoginSuccess(foundUser);
        } else {
          setErrorMsg(lang === 'es' ? 'Contraseña incorrecta para el usuario.' : 'Incorrect password.');
        }
      } else {
        setErrorMsg(lang === 'es' ? 'Usuario no encontrado en los registros.' : 'User not found in system.');
      }
      setLoading(false);
    }, 600);
  };

  const loginAsDemo = (demoEmail: string) => {
    setLoading(true);
    setErrorMsg('');
    setTimeout(() => {
      const foundUser = users.find(u => u.email === demoEmail);
      if (foundUser) {
        onLoginSuccess(foundUser);
      }
      setLoading(false);
    }, 450);
  };

  return (
    <div className="min-h-screen bg-[var(--app-bg)] flex flex-col justify-center items-center px-4 py-8 select-none transition-colors duration-300">
      <div 
        id="login-card"
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-xl overflow-hidden transition-all duration-300"
      >
        <div className="bg-slate-900 px-6 py-8 text-white relative overflow-hidden border-b border-slate-800">
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4 text-orange-500">
            <ShieldCheck size={180} />
          </div>
          <div className="relative z-10 flex flex-col items-center">
            <img 
              src={farmaciaLogo} 
              alt="Farmacia Sabatto Brand Icon" 
              className="size-20 object-contain rounded-2xl mb-3 shadow-md border-2 border-slate-700" 
              referrerPolicy="no-referrer"
            />
            <h1 className="text-2xl font-bold tracking-tight font-sans text-center">
              StockDepo <span className="text-orange-500">Sabatto</span>
            </h1>
            <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1 select-none">
              {t.subtitle}
            </p>
          </div>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-1">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {t.loginTitle}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
              {t.loginSubtitle}
            </p>
          </div>

          {/* Quick Demo Logins - Multi-perfil amigable */}
          <div className="space-y-2">
            <span className="text-[11px] uppercase tracking-wider font-extrabold text-orange-600 dark:text-orange-400 font-mono block">
              {t.demoAccount}
            </span>
            <div className="grid grid-cols-1 gap-2">
              <button
                id="demo_enfermero"
                type="button"
                onClick={() => loginAsDemo('enfermero@test.com')}
                disabled={loading}
                className="flex items-center justify-between text-left px-4 py-2.5 text-xs font-semibold rounded-xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/55 dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300 transition duration-150 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="size-2 bg-orange-500 rounded-full inline-block"></span>
                  <span>{t.enfermero} <span className="font-mono text-zinc-400 font-normal">(Guardia)</span></span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">enfermero@test.com</span>
              </button>

              <button
                id="demo_irab"
                type="button"
                onClick={() => loginAsDemo('irab@test.com')}
                disabled={loading}
                className="flex items-center justify-between text-left px-4 py-2.5 text-xs font-semibold rounded-xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/55 dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300 transition duration-150 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="size-2 bg-indigo-500 rounded-full inline-block"></span>
                  <span>{t.enfermero} <span className="font-mono text-zinc-400 font-normal">(IRAB)</span></span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">irab@test.com</span>
              </button>

              <button
                id="demo_tecnico"
                type="button"
                onClick={() => loginAsDemo('tecnico@test.com')}
                disabled={loading}
                className="flex items-center justify-between text-left px-4 py-2.5 text-xs font-semibold rounded-xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/55 dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300 transition duration-150 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="size-2 bg-amber-500 rounded-full inline-block"></span>
                  <span>{t.tecnico}</span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">tecnico@test.com</span>
              </button>

              <button
                id="demo_caps_admin"
                type="button"
                onClick={() => loginAsDemo('capsfarmaciasabatto@gmail.com')}
                disabled={loading}
                className="flex items-center justify-between text-left px-4 py-2.5 text-xs font-semibold rounded-xl bg-orange-50/40 hover:bg-orange-50/80 dark:bg-orange-950/20 dark:hover:bg-orange-950/30 border border-orange-500/20 dark:border-orange-500/10 text-orange-700 dark:text-orange-400 transition duration-150 cursor-pointer disabled:opacity-50 font-sans"
              >
                <div className="flex items-center gap-2">
                  <span className="size-2 bg-orange-600 rounded-full inline-block animate-pulse"></span>
                  <span>Farmacéutico Principal (Admin)</span>
                </div>
                <span className="text-[10px] text-orange-600 dark:text-orange-400 font-mono">capsfarmaciasabatto@gmail.com</span>
              </button>

              <button
                id="demo_farmaceutico"
                type="button"
                onClick={() => loginAsDemo('farmaceutico@test.com')}
                disabled={loading}
                className="flex items-center justify-between text-left px-4 py-2.5 text-xs font-semibold rounded-xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/55 dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300 transition duration-150 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="size-2 bg-orange-500 rounded-full inline-block"></span>
                  <span>{t.farmaceutico} <span className="font-mono text-zinc-400 font-normal">(Demo)</span></span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">farmaceutico@test.com</span>
              </button>

              <button
                id="demo_director"
                type="button"
                onClick={() => loginAsDemo('director@test.com')}
                disabled={loading}
                className="flex items-center justify-between text-left px-4 py-2.5 text-xs font-semibold rounded-xl bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-800/55 dark:hover:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 text-zinc-700 dark:text-zinc-300 transition duration-150 cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <span className="size-2 bg-teal-600 rounded-full inline-block"></span>
                  <span>{t.director}</span>
                </div>
                <span className="text-[10px] text-zinc-400 font-mono">director@test.com</span>
              </button>
            </div>
          </div>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
            <span className="flex-shrink mx-4 text-[10px] uppercase font-semibold text-zinc-400 font-sans">
              O CREDENCIALES
            </span>
            <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
          </div>

          {/* Formulario tradicional */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block">
                {t.email}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                  <Mail size={16} />
                </span>
                <input
                  id="login-email-input"
                  type="email"
                  required
                  placeholder="ejemplo@test.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-sm pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-colors"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block">
                {t.password}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400 dark:text-zinc-500">
                  <Lock size={16} />
                </span>
                <input
                  id="login-pass-input"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-sm pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition-colors"
                />
              </div>
            </div>

            {errorMsg && (
              <div id="login-error" className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl text-red-600 dark:text-red-400 text-xs text-center font-sans">
                {errorMsg}
              </div>
            )}

            <button
              id="login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm rounded-xl cursor-pointer disabled:opacity-50 transition duration-150 shadow-md shadow-orange-500/10 hover:shadow-orange-500/20"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <KeyRound size={16} />
                  <span>{t.loginBtn}</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
      <div className="mt-8 text-center text-xs text-zinc-400 font-mono">
        StockDepo Sabatto v1.2.0 • CAPS Sabatto Argentina • 2026
      </div>
    </div>
  );
}
