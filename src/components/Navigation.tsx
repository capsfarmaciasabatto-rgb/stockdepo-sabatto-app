/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { translations } from '../translations';
import { User, Role } from '../types';
import farmaciaLogo from '../assets/images/farmacia_logo_1780424589468.png';
import { 
  LogOut, 
  Globe, 
  Moon, 
  Sun, 
  Volume2, 
  VolumeX, 
  Bell, 
  Activity,
  ChevronDown
} from 'lucide-react';

interface NavigationProps {
  currentUser: User;
  allUsers: User[];
  onSwitchUser: (user: User) => void;
  onLogout: () => void;
  lang: 'es' | 'en';
  setLang: (l: 'es' | 'en') => void;
  darkMode: boolean;
  setDarkMode: (d: boolean) => void;
  soundMuted: boolean;
  setSoundMuted: (m: boolean) => void;
  alerts: { id: string; text: string; type: 'critical' | 'new_order' | 'info' | 'expiring' }[];
  onClearAlert: (id: string) => void;
}

export default function Navigation({
  currentUser,
  allUsers,
  onSwitchUser,
  onLogout,
  lang,
  setLang,
  darkMode,
  setDarkMode,
  soundMuted,
  setSoundMuted,
  alerts,
  onClearAlert
}: NavigationProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const t = translations[lang];

  // Identificar el color del indicador de perfil
  const getRoleColor = (role: Role) => {
    switch (role) {
      case Role.FARMACEUTICO:
        return 'bg-orange-600 text-white';
      case Role.TECNICO:
        return 'bg-slate-700 text-white';
      case Role.ENFERMERO:
        return 'bg-slate-600 text-white';
      case Role.DIRECTOR:
        return 'bg-teal-700 text-white';
      default:
        return 'bg-zinc-500 text-white';
    }
  };

  const getRoleLabel = (role: Role) => {
    switch (role) {
      case Role.FARMACEUTICO:
        return t.farmaceutico;
      case Role.TECNICO:
        return t.tecnico;
      case Role.ENFERMERO:
        return t.enfermero;
      case Role.DIRECTOR:
        return t.director;
      default:
        return role;
    }
  };
  
  // Solo Farmacéutico Principal (Admin) y Director pueden simular otros roles
  const canSwitchRoles = (role: Role) => {
    return role === Role.FARMACEUTICO || role === Role.DIRECTOR;
  };
  
  return (
    <nav className="bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-900 sticky top-0 z-50 transition-colors duration-300 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          
          {/* Logo y Nombre */}
          <div className="flex items-center gap-3">
            <img 
              src={farmaciaLogo} 
              alt="Farmacia Sabatto Logo" 
              className="size-11 object-contain rounded-xl shadow-xs border border-zinc-200 dark:border-zinc-800"
              referrerPolicy="no-referrer"
            />
            <div>
              <span className="font-sans font-extrabold tracking-tight text-slate-900 dark:text-white text-sm block leading-none">
                StockDepo
              </span>
              <span className="text-[10px] font-bold tracking-wide text-orange-600 dark:text-orange-400 select-none block mt-0.5">
                Farmacia Sabatto
              </span>
            </div>
          </div>

          {/* Menú de herramientas laterales */}
          <div className="flex items-center gap-2 sm:gap-4 relative text-sm">
            
            {/* Toggle de Modo Oscuro */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition duration-200 cursor-pointer"
              title={darkMode ? t.themeLight : t.themeDark}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Toggle de Sonido */}
            <button
              onClick={() => setSoundMuted(!soundMuted)}
              className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition duration-200 cursor-pointer"
              title={soundMuted ? t.soundOn : t.soundOff}
            >
              {soundMuted ? <VolumeX size={18} className="text-red-500" /> : <Volume2 size={18} className="text-orange-600 dark:text-orange-400" />}
            </button>

            {/* Selector de Idiomas */}
            <div className="relative">
              <button
                onClick={() => setLangOpen(!langOpen)}
                className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition duration-200 flex items-center gap-1 cursor-pointer"
              >
                <Globe size={18} />
                <span className="text-xs font-semibold uppercase font-mono">{lang}</span>
              </button>
              {langOpen && (
                <div className="absolute right-0 mt-2 w-28 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg py-1 z-50">
                  <button
                    onClick={() => { setLang('es'); setLangOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs font-sans hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between cursor-pointer ${lang === 'es' ? 'text-orange-600 font-bold' : 'text-zinc-700 dark:text-zinc-300'}`}
                  >
                    <span>Español</span>
                    {lang === 'es' && <span className="size-1.5 bg-orange-500 rounded-full"></span>}
                  </button>
                  <button
                    onClick={() => { setLang('en'); setLangOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 text-xs font-sans hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between cursor-pointer ${lang === 'en' ? 'text-orange-600 font-bold' : 'text-zinc-700 dark:text-zinc-300'}`}
                  >
                    <span>English</span>
                    {lang === 'en' && <span className="size-1.5 bg-orange-500 rounded-full"></span>}
                  </button>
                </div>
              )}
            </div>

            {/* Alertas Centro */}
            <div className="relative">
              <button
                onClick={() => setAlertsOpen(!alertsOpen)}
                className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition duration-200 relative cursor-pointer"
              >
                <Bell size={18} className={alerts.length > 0 ? 'animate-bounce text-amber-500' : ''} />
                {alerts.length > 0 && (
                  <span className="absolute top-1 right-1 size-4 bg-red-600 text-[9px] text-white font-bold rounded-full flex items-center justify-center">
                    {alerts.length}
                  </span>
                )}
              </button>
              {alertsOpen && (
                <div className="absolute right-[-2.5rem] sm:right-0 mt-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl py-2 z-50 max-h-96 overflow-y-auto">
                  <div className="px-3 pb-2 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Alarmas y Alertas ({alerts.length})</span>
                  </div>
                  {alerts.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-400">
                      Sin novedades por el momento.
                    </div>
                  ) : (
                    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {alerts.map((al) => (
                        <div key={al.id} className="p-3 text-xs flex gap-2 justify-between items-start">
                          <div className="space-y-0.5">
                            <span className={`inline-block size-1.5 rounded-full ${al.type === 'critical' ? 'bg-red-500' : al.type === 'new_order' ? 'bg-amber-500' : 'bg-orange-500'}`}></span>
                            <p className="text-zinc-800 dark:text-zinc-200 font-sans tracking-tight">{al.text}</p>
                          </div>
                          <button
                            onClick={() => onClearAlert(al.id)}
                            className="text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 font-semibold cursor-pointer"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="h-6 w-[1px] bg-zinc-200 dark:bg-zinc-800 hidden sm:block"></div>

            {/* Selector de Roles / Perfiles Rápido (Requisito) */}
            <div className="relative">
              <button
                id="role-dropdown-btn"
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-1.5 pl-2 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 cursor-pointer text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 transition duration-150"
              >
                <span className={`size-6 rounded-full flex items-center justify-center font-bold text-xs uppercase font-mono ${getRoleColor(currentUser.role)}`}>
                  {currentUser.name.charAt(0)}
                </span>
                <div className="hidden md:block leading-tight max-w-[124px] overflow-hidden truncate">
                  <p className="text-xs font-bold text-zinc-800 dark:text-zinc-100 font-sans">{currentUser.name.split(' ')[0]}</p>
                  <p className="text-[10px] text-zinc-400 font-mono italic">{getRoleLabel(currentUser.role)}</p>
                </div>
                <ChevronDown size={14} className="text-zinc-400" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl py-3 z-50">
                  <div className="px-4 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                    <p className="text-xs font-bold text-zinc-950 dark:text-zinc-50 truncate">{currentUser.name}</p>
                    <p className="text-[11px] text-zinc-400 font-mono truncate">{currentUser.email}</p>
                  </div>

              {/* Alternar perfiles rápido - Solo visible para Admin y Director */}
                  {canSwitchRoles(currentUser.role) && (
                    <div className="p-2 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase font-mono tracking-widest text-orange-600 dark:text-orange-400 block px-2 pt-1 pb-1">
                        Simular Otro Rol
                      </span>
                      {allUsers.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            onSwitchUser(u);
                            setProfileOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold font-sans flex items-center justify-between cursor-pointer transition duration-150 ${currentUser.id === u.id ? 'bg-orange-50/50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 border border-orange-500/10' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300'}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`size-2 rounded-full ${u.role === Role.FARMACEUTICO ? 'bg-orange-600' : u.role === Role.TECNICO ? 'bg-slate-700' : u.role === Role.DIRECTOR ? 'bg-teal-600' : 'bg-slate-500'}`}></span>
                            <span>{u.name.split(' ')[0]} <span className="font-mono text-[10px] text-zinc-400">({u.role === Role.ENFERMERO ? u.service : (u.role === Role.DIRECTOR ? 'Dirección' : 'Depósito')})</span></span>
                          </div>
                          {currentUser.id === u.id && <span className="text-[9px] text-orange-600 dark:text-orange-400 uppercase font-bold font-mono">Activo</span>}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-zinc-100 dark:border-zinc-800 mt-2 pt-1 px-2">
                    <button
                      onClick={() => {
                        onLogout();
                        setProfileOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-bold font-sans text-red-600 dark:text-red-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/65 rounded-xl cursor-pointer flex items-center gap-2 transition"
                    >
                      <LogOut size={14} />
                      <span>{t.logoutBtn}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </nav>
  );
}
