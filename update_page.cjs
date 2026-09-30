const fs = require('fs');

const file = 'apps/web/src/app/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace the return block entirely up to the right column logic
const returnStart = code.indexOf('  return (\n    <div className="min-h-screen');
const rightColumnStart = code.indexOf('{/* ── RIGHT COLUMN: Live Execution Sandbox');

if (returnStart === -1 || rightColumnStart === -1) {
  console.error("Could not find boundaries");
  process.exit(1);
}

const newJsx = `  return (
    <div className="min-h-screen font-sans selection:bg-brand-500/30 selection:text-amber-200 relative pb-20 theme-transition">
      {/* Ambient Glowing Orbs Background */}
      <div aria-hidden="true" className="ambient-gradient-mesh">
        <div className="gradient-orb-1"></div>
        <div className="gradient-orb-2"></div>
        <div className="gradient-orb-3"></div>
      </div>

      {/* ── Navigation Header ── */}
      <header className="sticky top-0 z-40 w-full border-b border-white/[0.08] bg-[#120e0c]/80 backdrop-blur-xl transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div 
              className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/25 via-neutral-900 to-sky-500/20 border border-white/15 shadow-inner group cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200"
              onClick={resetToOriginal}
            >
              <div className="absolute inset-0 rounded-xl bg-amber-500/15 blur-sm group-hover:bg-amber-500/30 transition-all"></div>
              <span className="material-symbols-outlined text-amber-400 relative z-10 text-[22px] group-hover:rotate-12 transition-transform duration-300">terminal</span>
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
              </span>
            </div>
            
            <div className="flex items-center space-x-2.5 cursor-pointer" onClick={resetToOriginal}>
              <div className="flex items-baseline space-x-1.5">
                <span className="font-bold tracking-tight text-lg text-white font-sans">Webtest</span>
                <span className="font-semibold tracking-tight text-lg text-transparent bg-clip-text bg-gradient-to-r from-sky-400 via-sky-300 to-amber-300 font-sans select-none">Scanner</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-sky-500/10 text-sky-300 border border-sky-500/30 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>v2.0
              </span>
            </div>
            
            <div className="hidden md:flex items-center pl-3.5 border-l border-white/10 text-xs font-medium">
              <button className="group hover:text-neutral-200 transition-all cursor-pointer flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 hover:border-white/15 active:scale-95" type="button">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] group-hover:animate-ping"></span>
                <span className="font-mono text-neutral-300 text-[11px] font-medium tracking-tight">production-workspace</span>
                <span className="material-symbols-outlined text-neutral-400 group-hover:text-neutral-200 text-sm group-hover:translate-y-0.5 transition-transform">expand_more</span>
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2.5">
            <Link href="/admin" className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300/90 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-400/60 transition-all duration-300 shadow-sm animate-amber-breathe hover:scale-105 active:scale-95 group">
              <span className="material-symbols-outlined text-amber-400 text-sm group-hover:scale-110 group-hover:rotate-12 transition-transform duration-200">verified_user</span>
              <span>Admin Console</span>
            </Link>
            
            <button type="button" onClick={() => setShowScheduleModal(true)} className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 group">
              <span className="material-symbols-outlined text-neutral-400 group-hover:text-amber-300 text-sm group-hover:rotate-6 transition-transform duration-200">calendar_month</span>
              <span>Schedules</span>
            </button>
            
            <button type="button" onClick={() => setShowHistoryModal(true)} className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-white/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 group">
              <span className="material-symbols-outlined text-neutral-400 group-hover:text-sky-400 text-sm group-hover:-rotate-45 transition-transform duration-300">history</span>
              <span>History</span>
              {historyRuns.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded text-[10px] bg-neutral-800/90 text-neutral-300 font-mono border border-white/10 group-hover:border-sky-400/40 group-hover:bg-neutral-800 group-hover:text-sky-300 transition-colors animate-badge-float">
                  {historyRuns.length}
                </span>
              )}
            </button>
            
            <button type="button" aria-label="Toggle light and dark mode" className="p-2 rounded-lg text-neutral-400 hover:text-amber-300 bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-amber-400/50 hover:shadow-[0_0_16px_rgba(251,191,36,0.35)] shadow-sm hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer flex items-center justify-center relative group" onClick={() => {
              document.documentElement.classList.toggle('dark');
              triggerToast(document.documentElement.classList.contains('dark') ? 'Obsidian Dark Mode restored' : 'Switched to Light preview mode');
            }}>
              <span className="material-symbols-outlined text-amber-400 text-lg transition-transform duration-500 ease-out group-hover:rotate-90 group-hover:scale-110 block dark:hidden">light_mode</span>
              <span className="material-symbols-outlined text-sky-300 text-lg transition-transform duration-500 ease-out group-hover:-rotate-90 group-hover:scale-110 hidden dark:block">dark_mode</span>
            </button>
            
            <div className="flex items-center space-x-2 pl-2 border-l border-white/10">
              <div className="flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/10 hover:border-white/25 hover:bg-white/[0.07] hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer group">
                <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-amber-600 via-amber-500 to-sky-600 flex items-center justify-center text-[10px] font-bold text-white uppercase shadow-sm group-hover:ring-2 group-hover:ring-amber-400/50 transition-all">
                  {(user?.email?.[0] || 'Y').toUpperCase()}
                </div>
                <span className="hidden lg:inline-block text-xs text-neutral-300 font-mono tracking-tight max-w-[135px] truncate group-hover:text-white transition-colors">
                  {user?.email || (typeof window !== 'undefined' && localStorage.getItem('wts_admin_user') ? JSON.parse(localStorage.getItem('wts_admin_user') || '{}').email : 'guest@webtest.dev')}
                </span>
              </div>
              <button onClick={handleLogout} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:bg-white/[0.06] hover:scale-105 active:scale-95 transition-all" type="button">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Toast Notification */}
      <div className={\`fixed top-20 right-6 z-50 transform transition-all duration-300 pointer-events-none flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1c1715] border border-amber-500/30 shadow-2xl text-xs font-mono text-neutral-200 \${showToast ? 'translate-y-0 opacity-100' : 'translate-y-[-150%] opacity-0'}\`}>
        <span className="material-symbols-outlined text-amber-400 text-base">info</span>
        <span>{toastMessage}</span>
      </div>

      <main className={isExecutionActive ? 'max-w-[1600px] mx-auto px-4 pt-6 pb-20 w-full grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10' : 'max-w-5xl mx-auto px-4 sm:px-6 pt-12 md:pt-16 pb-20 relative z-10'}>
        <div className={isExecutionActive ? 'w-full flex flex-col gap-4' : 'w-full'}>
            {result && (
              <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-2">
                <div className="flex p-1 bg-black/40 backdrop-blur-md rounded-xl border border-white/10 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setActiveLeftTab('config')}
                    className={\`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all \${activeLeftTab === 'config' ? 'bg-white/10 text-foreground shadow-sm' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'}\`}
                  >
                    <span className="material-symbols-outlined text-sm">tune</span> Edit Scan Setup
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveLeftTab('results')}
                    className={\`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all \${activeLeftTab === 'results' ? 'bg-white/10 text-foreground shadow-sm' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5'}\`}
                  >
                    <span className="material-symbols-outlined text-sm">analytics</span> Audit Report
                    <span className={\`px-1.5 py-0.5 rounded text-[10px] ml-1 \${result.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}\`}>
                      {result.totals.passed}/{result.totals.total} Passed
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={resetToOriginal}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 transition-all cursor-pointer"
                  title="Clear run and return to home"
                >
                  <span className="material-symbols-outlined text-sm">delete</span> Clear Run
                </button>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 mb-4 backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                    <span className="material-symbols-outlined text-lg">error</span> Execution Failed
                  </div>
                  <div className="flex gap-2">
                    <button onClick={resetToOriginal} className="px-2.5 py-1 text-xs rounded-md bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 transition-colors">
                      Reset
                    </button>
                    <button onClick={() => { setError(null); setRunStartedAt(null); }} className="px-2.5 py-1 text-xs rounded-md bg-white/5 hover:bg-white/10 text-neutral-300 border border-white/10 transition-colors">
                      Dismiss
                    </button>
                  </div>
                </div>
                <div className="mt-2 text-sm text-rose-300/80">
                  {error.findings?.[0]?.detail || (error as any).detail || (error as any).error || 'The run could not complete. Check URL connectivity.'}
                </div>
              </div>
            )}

            <div className={\`flex-col gap-6 w-full \${(activeLeftTab === 'config' || !result) ? 'flex' : 'hidden'}\`}>
              <section className={\`text-center max-w-3xl mx-auto \${isExecutionActive ? 'hidden' : 'mb-10 md:mb-12'}\`} data-purpose="hero-headline">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.03] border border-amber-500/30 mb-5 shadow-inner backdrop-blur-md">
                  <span className="material-symbols-outlined text-amber-400 text-sm">auto_awesome</span>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-amber-200/90 font-semibold">Autonomous QA &amp; Visual Intelligence</span>
                </div>
                <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-semibold tracking-tight text-white leading-[1.12]">
                  Intelligent Browser Audits in 
                  <span className="font-serif italic font-normal text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-300 to-amber-100 underline decoration-amber-500/40 decoration-wavy decoration-1 underline-offset-8 drop-shadow-[0_0_20px_rgba(245,158,11,0.3)] ml-2">
                    Plain English.
                  </span>
                </h1>
                <p className="mt-4 text-base sm:text-lg text-neutral-300/85 max-w-2xl mx-auto leading-relaxed font-normal">
                  Execute automated tests, visual diffs, and deep compliance audits using natural language commands.
                </p>
              </section>

              <section className="relative rounded-2xl bg-[#171311]/85 backdrop-blur-2xl border border-white/[0.09] shadow-card-glass shadow-glow p-5 sm:p-7 transition-all duration-300" data-purpose="audit-console">
                <div className="absolute inset-x-8 -top-px h-px bg-gradient-to-r from-transparent via-amber-400/50 to-transparent"></div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center justify-between text-xs tracking-wider uppercase font-semibold text-neutral-400">
                    <div className="flex items-center space-x-1.5 text-neutral-300">
                      <span className="material-symbols-outlined text-amber-400 text-base">edit_note</span>
                      <span className="font-mono text-xs font-semibold tracking-wider uppercase text-neutral-300">Audit Prompt &amp; Intent</span>
                    </div>
                    <div className="flex items-center space-x-1 font-mono text-[11px] text-neutral-400 bg-neutral-900/90 border border-white/10 px-2 py-0.5 rounded-md">
                      <kbd className="text-neutral-300 font-sans">⌘</kbd> + <kbd className="text-neutral-300">Enter</kbd> <span>to inspect</span>
                    </div>
                  </div>
                  <div className="relative group">
                    <textarea 
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value.slice(0, MAX_INSTRUCTIONS))}
                      onKeyDown={(e) => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && urlValid && !running) {
                          e.preventDefault();
                          run();
                        }
                      }}
                      className="w-full bg-[#110e0c]/90 border border-white/10 group-hover:border-white/20 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20 text-neutral-100 placeholder:text-neutral-500 text-sm sm:text-base rounded-xl p-4 transition-all duration-200 resize-none font-sans outline-none" 
                      placeholder="Describe what to test in plain English (e.g. 'Audit checkout flow, test responsive layout, check form validations, simulate 3G network throttle and verify WCAG contrast')..." 
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6 p-1.5 sm:p-2 rounded-2xl bg-gradient-to-b from-white/[0.04] to-transparent border border-white/[0.08] shadow-inner">
                  <div className="relative w-full flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
                      <span className="material-symbols-outlined text-sky-400 text-base">public</span>
                    </div>
                    <input 
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && urlValid && !running) {
                          e.preventDefault();
                          run();
                        }
                      }}
                      className="w-full pl-10 pr-10 py-3 bg-[#100c0a]/95 border border-white/10 focus:border-sky-500/60 focus:ring-2 focus:ring-sky-500/20 rounded-xl text-neutral-200 placeholder:text-neutral-500 text-sm font-mono transition-all outline-none" 
                      placeholder="https://your-domain.com or web app URL..." 
                    />
                    {url.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setUrl('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors p-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    )}
                  </div>
                  <div className="relative group shrink-0 w-full sm:w-auto">
                    <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 opacity-70 blur-lg group-hover:opacity-100 group-hover:blur-xl transition duration-500 pointer-events-none"></div>
                    <button 
                      onClick={() => run()}
                      disabled={!urlValid || running}
                      className="relative w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 hover:from-cyan-300 hover:via-sky-400 hover:to-blue-500 hover:scale-[1.03] active:scale-[0.97] text-white font-semibold text-sm tracking-wide flex items-center justify-center space-x-3 shadow-luminous hover:shadow-[0_0_35px_rgba(6,182,212,0.7)] border border-white/40 transition-all duration-300 cursor-pointer overflow-hidden group/btn disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none" 
                      type="button"
                    >
                      <div className="absolute inset-0 w-3/4 h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-gleam-slide pointer-events-none"></div>
                      
                      {running ? (
                        <>
                          <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                          <span className="relative z-10 text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">Inspecting Target…</span>
                        </>
                      ) : (
                        <>
                          <div className="relative flex items-center justify-center animate-icon-float">
                            <span className="absolute w-4 h-4 rounded-full bg-cyan-300/50 blur-xs animate-pulse-subtle"></span>
                            <span className="material-symbols-outlined text-white text-base drop-shadow-[0_0_8px_rgba(255,255,255,0.9)] relative z-10 fill-1 group-hover/btn:scale-115 transition-transform duration-200">play_arrow</span>
                          </div>
                          <span className="relative z-10 text-white font-medium drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">Inspect &amp; Run Audit</span>
                          <span className="relative z-10 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-black/35 backdrop-blur-md border border-white/30 text-cyan-100 font-mono text-[11px] font-medium tracking-tight shadow-inner animate-badge-float group-hover/btn:border-cyan-200/60 transition-colors">
                            <span className="text-[10px] leading-none opacity-80">⌘</span><span className="leading-none">↵</span>
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4 mb-6">
                  <div className="flex items-center space-x-2 text-xs font-medium text-neutral-400 mb-3">
                    <span className="material-symbols-outlined text-amber-400 text-sm">auto_fix_high</span>
                    <span className="tracking-wide uppercase text-[11px] font-semibold text-neutral-400 font-mono">Quick Presets</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'demo-errors') || AI_PRESETS[0]); triggerToast('Preset loaded: Console Errors Demo'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-neutral-300 hover:text-rose-200 border border-white/10 hover:border-rose-500/50 hover:shadow-[0_0_15px_rgba(244,63,94,0.22)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-rose-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">pest_control</span>
                      <span>Console Errors Demo</span>
                    </button>
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'health') || AI_PRESETS[1]); triggerToast('Preset loaded: Full Health Scan'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-amber-200 border border-amber-500/30 hover:border-amber-400/70 hover:shadow-[0_0_18px_rgba(245,158,11,0.3)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-amber-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">monitor_heart</span>
                      <span>Full Health Scan</span>
                    </button>
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'ecommerce') || AI_PRESETS[2]); triggerToast('Preset loaded: E-Commerce Flow'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-neutral-300 hover:text-sky-200 border border-white/10 hover:border-sky-400/60 hover:shadow-[0_0_16px_rgba(56,189,248,0.25)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-sky-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">shopping_bag</span>
                      <span>E-Commerce Flow</span>
                    </button>
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'auth') || AI_PRESETS[3]); triggerToast('Preset loaded: Auth Security Check'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-neutral-300 hover:text-emerald-200 border border-white/10 hover:border-emerald-400/60 hover:shadow-[0_0_16px_rgba(52,211,153,0.25)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-emerald-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">encrypted</span>
                      <span>Auth Security Check</span>
                    </button>
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'a11y') || AI_PRESETS[4]); triggerToast('Preset loaded: WCAG 2.1 AA Audit'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-sky-200 border border-sky-500/30 hover:border-sky-400/70 hover:shadow-[0_0_18px_rgba(56,189,248,0.3)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-sky-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">accessibility_new</span>
                      <span>WCAG 2.1 AA Audit</span>
                    </button>
                    <button 
                      onClick={() => { applyPreset(AI_PRESETS.find(p => p.id === 'mobile-nav') || AI_PRESETS[5]); triggerToast('Preset loaded: Mobile Nav & Layout'); }}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-neutral-300 hover:text-indigo-200 border border-white/10 hover:border-indigo-400/60 hover:shadow-[0_0_16px_rgba(129,140,248,0.25)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer" type="button"
                    >
                      <span className="material-symbols-outlined text-indigo-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">smartphone</span>
                      <span>Mobile Nav &amp; Layout</span>
                    </button>
                    <button 
                      onClick={generateAiTestForUrl}
                      disabled={!urlValid || autoGenLoading}
                      className="preset-pill preset-pill-sheen group inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e1917] hover:bg-[#251f1c] text-amber-300/90 border border-amber-500/20 hover:border-amber-400/70 hover:shadow-[0_0_18px_rgba(245,158,11,0.3)] transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 cursor-pointer disabled:opacity-50" type="button"
                    >
                      <span className="material-symbols-outlined text-amber-400 text-sm group-hover:scale-125 group-hover:rotate-6 transition-transform duration-200">psychology</span>
                      <span>Auto-Generate Site Tests</span>
                    </button>
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-neutral-400 text-sm">memory</span>
                      <span className="text-xs font-semibold tracking-wide uppercase text-neutral-400 font-mono">AI Engine &amp; Execution Profile</span>
                    </div>
                    <div className="text-[11px] font-mono text-neutral-500 tracking-wider">
                      RUNTIME: {device.toUpperCase()} • {browserType.toUpperCase()}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                    <div className="relative">
                      <label className="block text-[10px] font-mono uppercase text-neutral-500 mb-1">Intelligence</label>
                      <div className="relative">
                        <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value as any)} className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2 pl-2.5 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer hover:border-white/20 transition-colors">
                          <option value="auto">⚡ Claude 3.5 Sonnet</option>
                          <option value="local">🖥 Local LLM (Ollama)</option>
                          <option value="gemini">✨ Gemini 1.5 Pro</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">unfold_more</span>
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-[10px] font-mono uppercase text-neutral-500 mb-1">Browser Core</label>
                      <div className="relative">
                        <select value={browserType} onChange={(e) => setBrowserType(e.target.value as any)} className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2 pl-2.5 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer hover:border-white/20 transition-colors">
                          <option value="chromium">🌐 Chromium</option>
                          <option value="webkit">🧭 WebKit Safari</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">unfold_more</span>
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-[10px] font-mono uppercase text-neutral-500 mb-1">Target Viewport</label>
                      <div className="relative">
                        <select value={device} onChange={(e) => setDevice(e.target.value as DevicePreset)} className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2 pl-2.5 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer hover:border-white/20 transition-colors">
                          <option value="desktop">💻 Desktop (1280×800)</option>
                          <option value="laptop">🖥 Large (1440×900)</option>
                          <option value="mobile">📱 iPhone 14 (390×844)</option>
                          <option value="tablet">📟 Tablet iPad (820×1180)</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">unfold_more</span>
                      </div>
                    </div>
                    <div className="relative">
                      <label className="block text-[10px] font-mono uppercase text-neutral-500 mb-1">Environment</label>
                      <div className="relative">
                        <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2 pl-2.5 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer hover:border-white/20 transition-colors">
                          <option value="QA">QA Environment</option>
                          <option value="STAGING">Staging Mirror</option>
                          <option value="PRODUCTION">Production (Read-Only)</option>
                          <option value="LOCAL">Localhost:3000</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">unfold_more</span>
                      </div>
                    </div>
                    <div className="relative col-span-2 sm:col-span-1">
                      <label className="block text-[10px] font-mono uppercase text-neutral-500 mb-1">Safety Policy</label>
                      <div className="relative">
                        <select value={tier} onChange={(e) => setTier(e.target.value)} className="w-full appearance-none bg-[#120e0c] border border-white/10 text-neutral-200 text-xs rounded-lg py-2 pl-2.5 pr-8 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 cursor-pointer hover:border-white/20 transition-colors">
                          <option value="0">Tier 0 (Sandbox Safe)</option>
                          <option value="1">Tier 1 (Form Submissions)</option>
                          <option value="2">Tier 2 (Full Mutations)</option>
                        </select>
                        <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm pointer-events-none">unfold_more</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/[0.06] pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold tracking-wide uppercase text-neutral-400 font-mono">Test Suites &amp; Assertions</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/20 text-sky-400 border border-sky-500/30 font-semibold">{selected.length} ACTIVE</span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-neutral-400">
                      <label className="inline-flex items-center space-x-2 cursor-pointer select-none group">
                        <input type="checkbox" checked={strict} onChange={() => setStrict(!strict)} className="rounded bg-[#120e0c] border-white/20 text-sky-500 focus:ring-sky-500/30 focus:ring-offset-0 w-3.5 h-3.5 transition-colors cursor-pointer" />
                        <span className="group-hover:text-neutral-300 transition-colors">Strict assertions</span>
                      </label>
                      <label className={\`inline-flex items-center space-x-2 select-none group \${tierNumber < 1 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}\`}>
                        <input type="checkbox" checked={captureAssets} onChange={() => setCaptureAssets(!captureAssets)} disabled={tierNumber < 1} className="rounded bg-[#120e0c] border-white/20 text-sky-500 focus:ring-sky-500/30 focus:ring-offset-0 w-3.5 h-3.5 transition-colors cursor-pointer" />
                        <span className="group-hover:text-neutral-300 transition-colors">Capture HAR &amp; Assets</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {(available.length > 0 ? available : [
                      { id: 'functional', label: 'Functional', minTier: 0 },
                      { id: 'ui', label: 'UI / Visual Diff', minTier: 0 },
                      { id: 'design', label: 'Design & Assets', minTier: 0 },
                      { id: 'accessibility', label: 'Accessibility (WCAG 2.1 AA)', minTier: 0 },
                      { id: 'security-passive', label: 'Security (Passive)', minTier: 0 },
                      { id: 'performance', label: 'Performance & Vitals', minTier: 0 },
                      { id: 'api', label: 'API & Network Contract', minTier: 0 },
                      { id: 'unit', label: 'Unit Tests (Source Code)', minTier: 0 },
                      { id: 'scraper', label: 'Web Scraper & Crawler', minTier: 0 },
                    ]).map((cat) => {
                      const isSelected = selected.includes(cat.id);
                      const isTierRestricted = cat.minTier > tierNumber;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            if (!isTierRestricted) toggleCategory(cat.id);
                          }}
                          disabled={isTierRestricted}
                          className={\`suite-pill inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 cursor-pointer \${
                            isTierRestricted
                              ? 'opacity-40 cursor-not-allowed bg-[#110e0c]/40 text-neutral-500 border border-white/5'
                              : isSelected 
                                ? 'bg-neutral-800 text-white border border-white/30 shadow-sm hover:bg-neutral-700 hover:border-white/50 hover:scale-[1.03] active:scale-[0.95]' 
                                : 'bg-[#110e0c]/60 text-neutral-400 border border-white/5 hover:border-white/20 hover:text-neutral-200 hover:scale-[1.03] active:scale-[0.95]'
                          }\`}
                        >
                          {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-sky-400 active-pulse-dot" />}
                          <span>{cat.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>

            {/* VIEW 2: Results Panel */}
            {result && activeLeftTab === 'results' && (
              <div style={{ width: '100%', marginTop: 8 }}>
                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="results-sub-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {device === 'mobile' ? <span className="material-symbols-outlined text-[14px]">smartphone</span> : device === 'tablet' ? <span className="material-symbols-outlined text-[14px]">tablet_mac</span> : device === 'laptop' ? <span className="material-symbols-outlined text-[14px]">laptop_mac</span> : <span className="material-symbols-outlined text-[14px]">desktop_mac</span>}
                      Emulated: {device.toUpperCase()}
                    </span>
                  </div>
                </div>
                <ResultsPanel
                  result={result}
                  device={device}
                  onApplyFix={(fix) => {
                    setInstructions((prev) => (prev ? \`\${fix}\\n\${prev}\` : fix));
                    setActiveLeftTab('config');
                  }}
                  onDownload={async (aiSummary?: string, summaryData?: any) => {
                    setPdfing(true);
                    try {
                      await printReport(result, aiSummary, summaryData);
                    } catch (e) {
                      console.error('PDF generation error:', e);
                    } finally {
                      setPdfing(false);
                    }
                  }}
                  pdfing={pdfing}
                />
              </div>
            )}
        </div>
`;

const modified = code.substring(0, returnStart) + newJsx + code.substring(rightColumnStart);

fs.writeFileSync(file, modified);
