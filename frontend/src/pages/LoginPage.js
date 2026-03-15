import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

// ── Voice waveform bars ───────────────────────────────────────────────────
function VoiceWaveform({ active }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:3, height:20 }}>
      {[1.2,1.8,1.4,2.0,1.6,2.2,1.3,1.9,1.5,1.7].map((h,i) => (
        <div key={i} style={{
          width: 3, borderRadius: 3,
          background: active ? '#ef4444' : 'rgba(255,255,255,0.5)',
          height: active ? `${h * 7}px` : '3px',
          transition: 'height 0.12s ease, background 0.3s',
          animation: active ? `voiceBar 0.55s ${i*0.06}s ease-in-out infinite alternate` : 'none',
        }}/>
      ))}
      <style>{`
        @keyframes voiceBar {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1.4); }
        }
      `}</style>
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const [form,   setForm]    = useState({ username:'', password:'' });
  const [error,  setError]   = useState('');
  const [loading,setLoad]    = useState(false);
  const [focus,  setFocus]   = useState('');
  const [hov,    setHov]     = useState('');
  const [showPw, setShowPw]  = useState(false);

  // ── Voice state ──────────────────────────────────────────────────────
  const [voiceField,    setVoiceField]    = useState(null);   // 'username' | 'password' | null
  const [isListening,   setIsListening]   = useState(false);
  const [voiceStatus,   setVoiceStatus]   = useState('');
  const [voiceSupported,setVoiceSupported]= useState(false);
  const [transcript,    setTranscript]    = useState('');
  const recRef        = useRef(null);
  const voiceFieldRef = useRef(null);   // ref so onresult closure always reads latest field

  // Keep ref in sync with state
  useEffect(() => { voiceFieldRef.current = voiceField; }, [voiceField]);

  // Set up SpeechRecognition ONCE on mount — never reinitialize
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    setVoiceSupported(true);
    const rec = new SR();
    rec.continuous     = false;
    rec.interimResults = true;
    rec.lang           = 'en-IN';

    rec.onstart  = () => { setIsListening(true); setVoiceStatus('Listening...'); setTranscript(''); };
    rec.onerror  = (e) => {
      setIsListening(false); setVoiceField(null);
      const msg = {
        'not-allowed': 'Microphone blocked — allow access in browser settings.',
        'no-speech':   'No speech detected. Please try again.',
        'network':     'Network error. Check connection.',
      };
      setVoiceStatus(msg[e.error] || `Error: ${e.error}`);
    };
    rec.onend = () => { setIsListening(false); setVoiceField(null); };
    rec.onresult = (e) => {
      let interim='', final='';
      for (let i=e.resultIndex; i<e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t; else interim += t;
      }
      const heard = (final || interim).trim();
      setTranscript(heard);
      if (final && heard) {
        // Use ref (not stale state) to get the current target field
        setForm(f => ({ ...f, [voiceFieldRef.current]: heard }));
        setVoiceStatus(`✅ Got it!`);
        setTimeout(() => setVoiceStatus(''), 2000);
      }
    };
    recRef.current = rec;

    // Cleanup on unmount
    return () => { try { rec.abort(); } catch(_) {} };
  }, []); // ← runs once only

  const startVoice = useCallback((field) => {
    if (!voiceSupported || isListening) return;
    setVoiceField(field);
    setVoiceStatus('');
    setTranscript('');
    try { recRef.current?.start(); }
    catch(e) { setVoiceStatus('Mic already in use — try again.'); }
  }, [voiceSupported, isListening]);

  const stopVoice = useCallback(() => {
    recRef.current?.stop();
    setIsListening(false);
    setVoiceField(null);
    setVoiceStatus('');
  }, []);

  const submit = async e => {
    e.preventDefault(); setError(''); setLoad(true);
    try { await login(form.username, form.password); }
    catch(err) { setError(err.response?.data?.message || 'Invalid credentials. Please try again.'); }
    finally { setLoad(false); }
  };

  const demos = [
    { label:'Admin',   u:'admin',   p:'admin123', color:'#f97316', bg:'#fff7ed', icon:'⚙️' },
    { label:'DEO CSE', u:'deo_cse', p:'deo123',   color:'#2563eb', bg:'#eff6ff', icon:'🎓' },
    { label:'DEO ECE', u:'deo_ece', p:'deo123',   color:'#0ea5e9', bg:'#f0f9ff', icon:'🎓' },
    { label:'HOD CSE', u:'hod_cse', p:'hod123',   color:'#7c3aed', bg:'#faf5ff', icon:'👨‍💼' },
  ];

  const fields = [
    { k:'username', label:'Username', type:'text',                    ph:'Enter username or 🎤 speak it', icon:'👤' },
    { k:'password', label:'Password', type:showPw?'text':'password',  ph:'Enter password',                icon:'🔒' },
  ];

  return (
    <div style={S.root}>

      {/* ══ LEFT — Only N-Block (clear) + Chairman ══ */}
      <div style={S.left}>
        {/* N-Block photo — single, clear, no slideshow */}
        <img
          src="/campus/n_block.jpg"
          alt="N-Block — Vignan's FSTR"
          style={S.bgImg}
          onError={e => { e.target.style.display='none'; }}
        />
        {/* Very soft overlay — campus remains clearly visible */}
        <div style={S.softGrad}/>

        {/* University badge */}
        <div style={S.uniBadge}>
          <div style={S.logoCircle}>V</div>
          <div>
            <div style={S.uniName}>VIGNAN'S FSTR</div>
            <div style={S.uniSub}>Deemed to be University · NAAC A+</div>
          </div>
        </div>

        {/* Label */}
        <div style={S.photoLabel}>
          <div style={S.labelDot}/>
          <span>N-Block Academic Building — Vignan's Campus, Vadlamudi</span>
        </div>

        {/* Chairman card */}
        <div style={S.chairCard}>
          <img
            src="/campus/chairman.jpg"
            alt="Chairman Sri Lavu Ratan Rao"
            style={S.chairPhoto}
            onError={e => e.target.style.display='none'}
          />
          <div style={S.chairInfo}>
            <div style={S.chairTitle}>Our Honorable Chairman</div>
            <div style={S.chairName}>Sri Lavu Ratan Rao</div>
            <div style={S.chairSub}>Vignan's Foundation for Science,<br/>Technology and Research</div>
          </div>
        </div>
      </div>

      {/* ══ RIGHT — Login card ══ */}
      <div style={S.right}>
        <div style={S.card}>
          {/* Animated rainbow stripe */}
          <div style={S.rainbow}/>

          <div style={S.body}>
            {/* Header */}
            <div style={S.head}>
              <span style={S.badge}>🎓 DEO Academic Portal</span>
              <h2 style={S.h2}>Welcome Back!</h2>
              <p style={S.subTxt}>Vignan's FSTR — Department Reports System</p>
              {voiceSupported && (
                <div style={S.voiceSupportBadge}>
                  <span style={{ fontSize:14 }}>🎤</span>
                  <span>Voice Sign-In Available</span>
                </div>
              )}
            </div>

            {/* Form */}
            <form onSubmit={submit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {fields.map(f => {
                const isActiveVoice = isListening && voiceField===f.k;
                return (
                  <div key={f.k}>
                    <label style={S.lbl}>{f.label}</label>
                    <div style={{
                      ...S.inputWrap,
                      borderColor: isActiveVoice ? '#ef4444'
                                 : focus===f.k   ? '#3b82f6'
                                 : hov===f.k     ? '#93c5fd'
                                 : '#e2e8f8',
                      boxShadow: isActiveVoice  ? '0 0 0 3px rgba(239,68,68,0.15)'
                               : focus===f.k    ? '0 0 0 3px rgba(59,130,246,0.12)'
                               : 'none',
                      transform: focus===f.k || isActiveVoice ? 'translateY(-1px)' : 'none',
                    }}>
                      <span style={{ fontSize:16, flexShrink:0 }}>{f.icon}</span>

                      <input
                        style={S.inp}
                        type={f.type}
                        placeholder={isActiveVoice ? '🎤 Listening...' : f.ph}
                        value={form[f.k]}
                        onChange={e => setForm({ ...form, [f.k]: e.target.value })}
                        onFocus={() => setFocus(f.k)}
                        onBlur={() => setFocus('')}
                        onMouseEnter={() => setHov(f.k)}
                        onMouseLeave={() => setHov('')}
                        required
                      />

                      {/* Live waveform inside input when listening */}
                      {isActiveVoice && <VoiceWaveform active={true}/>}

                      {/* Password toggle */}
                      {f.k==='password' && !isActiveVoice && (
                        <button type="button"
                          onClick={() => setShowPw(p=>!p)}
                          style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:16, lineHeight:1, padding:'0 2px' }}>
                          {showPw ? '🙈' : '👁️'}
                        </button>
                      )}

                      {/* Mic button — only for username field */}
                      {voiceSupported && f.k==='username' && (
                        <button
                          type="button"
                          onClick={() => isActiveVoice ? stopVoice() : startVoice(f.k)}
                          title={isActiveVoice ? 'Stop' : 'Speak username'}
                          style={{
                            width: 32, height: 32, borderRadius: 8, border: 'none',
                            cursor: 'pointer', flexShrink: 0, display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 16, transition: 'all 0.25s',
                            background: isActiveVoice
                              ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                              : 'linear-gradient(135deg,#f97316,#ea580c)',
                            boxShadow: isActiveVoice ? '0 0 0 3px rgba(239,68,68,0.3)' : '0 2px 8px rgba(249,115,22,0.35)',
                            transform: isActiveVoice ? 'scale(1.1)' : 'scale(1)',
                          }}
                        >
                          {isActiveVoice ? '⏹' : '🎤'}
                        </button>
                      )}
                    </div>

                    {/* Live transcript below username field */}
                    {isActiveVoice && transcript && (
                      <div style={S.transcript}>
                        <span style={{ color:'#94a3b8', fontSize:10 }}>Heard: </span>
                        <span style={{ color:'#1e2d4a', fontWeight:700 }}>"{transcript}"</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Voice status banner */}
              {(voiceStatus || (isListening && !transcript)) && (
                <div style={{
                  ...S.voiceBar,
                  background: voiceStatus.startsWith('✅') ? '#f0fdf4' : isListening ? '#fff7ed' : '#fff1f2',
                  borderColor: voiceStatus.startsWith('✅') ? '#a7f3d0' : isListening ? '#fed7aa' : '#fecdd3',
                  color: voiceStatus.startsWith('✅') ? '#065f46' : isListening ? '#c2410c' : '#be123c',
                }}>
                  {isListening && <VoiceWaveform active={true}/>}
                  <span style={{ fontSize:13, fontWeight:600 }}>
                    {isListening && !voiceStatus ? '🎤 Listening — speak your username clearly...' : voiceStatus}
                  </span>
                </div>
              )}

              {error && (
                <div style={S.errBox}>
                  <span style={{ fontSize:16 }}>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" disabled={loading}
                style={{
                  ...S.loginBtn,
                  background: loading ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#4f46e5)',
                  transform: hov==='btn' && !loading ? 'translateY(-3px)' : 'none',
                  boxShadow: hov==='btn' ? '0 12px 30px rgba(29,78,216,0.4)' : '0 4px 14px rgba(29,78,216,0.25)',
                }}
                onMouseEnter={() => setHov('btn')} onMouseLeave={() => setHov('')}
              >
                {loading
                  ? <span style={{ display:'inline-block', animation:'spin 0.8s linear infinite' }}>⟳ &nbsp;Signing in...</span>
                  : '→  Sign In'
                }
              </button>
            </form>

            {/* Voice tip */}
            {voiceSupported && (
              <div style={S.voiceTip}>
                <span style={{ fontSize:15 }}>🎤</span>
                <span><strong>Voice tip:</strong> Click the orange mic button next to Username and speak your username. Works best in Chrome or Edge.</span>
              </div>
            )}

            {/* Demo */}
            <div style={S.demoSection}>
              <div style={S.divRow}>
                <div style={S.divLine}/><span style={S.divTxt}>Quick Demo Access</span><div style={S.divLine}/>
              </div>
              <div style={S.demoGrid}>
                {demos.map(d => (
                  <button key={d.label}
                    style={{
                      ...S.demoBtn,
                      background:  hov===d.label ? d.bg : '#f8faff',
                      borderColor: hov===d.label ? d.color : '#e2e8f8',
                      color:       hov===d.label ? d.color : '#64748b',
                      transform:   hov===d.label ? 'translateY(-3px)' : 'none',
                      boxShadow:   hov===d.label ? `0 6px 20px ${d.color}30` : 'none',
                    }}
                    onClick={() => setForm({ username:d.u, password:d.p })}
                    onMouseEnter={() => setHov(d.label)} onMouseLeave={() => setHov('')}
                  >
                    <span style={{ fontSize:16 }}>{d.icon}</span>
                    <span style={{ fontWeight:700, fontSize:12 }}>{d.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <p style={{ textAlign:'center', color:'#cbd5e1', fontSize:11, marginTop:16 }}>
              Vignan's Foundation for Science, Technology and Research<br/>
              (Deemed to be University) · Vadlamudi, Guntur, AP
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  root: {
    display:'flex', minHeight:'100vh',
    fontFamily:"'Plus Jakarta Sans',sans-serif",
    background:'#f0f4ff',
  },

  /* LEFT */
  left: {
    flex:1.2, position:'relative', overflow:'hidden',
    background:'#dbeafe',
  },
  bgImg: {
    width:'100%', height:'100%',
    objectFit:'cover', objectPosition:'center 30%',
    display:'block',
    // Crisp and clear — only very slight adjustment
    filter:'brightness(0.92) saturate(1.08)',
  },
  softGrad: {
    position:'absolute', inset:0,
    // Just enough gradient for text readability at top and bottom
    background:'linear-gradient(180deg, rgba(10,25,70,0.22) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)',
  },

  uniBadge: {
    position:'absolute', top:20, left:20, zIndex:10,
    display:'flex', alignItems:'center', gap:10,
    background:'rgba(255,255,255,0.92)', backdropFilter:'blur(14px)',
    borderRadius:12, padding:'10px 14px',
    boxShadow:'0 4px 20px rgba(0,0,0,0.1)',
    border:'1px solid rgba(255,255,255,0.8)',
    animation:'fadeUp 0.6s ease both',
  },
  logoCircle: {
    width:38, height:38, borderRadius:'50%',
    background:'linear-gradient(135deg,#f97316,#f59e0b)',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontFamily:"'Sora',sans-serif", fontSize:19, fontWeight:900, color:'#fff',
    boxShadow:'0 3px 10px rgba(249,115,22,0.4)', flexShrink:0,
    animation:'float 3s ease-in-out infinite',
  },
  uniName: { fontFamily:"'Sora',sans-serif", color:'#1e2d4a', fontWeight:800, fontSize:13 },
  uniSub:  { color:'#64748b', fontSize:10, marginTop:1 },

  photoLabel: {
    position:'absolute', bottom:18, left:20, zIndex:10,
    display:'flex', alignItems:'center', gap:8,
    color:'rgba(255,255,255,0.88)', fontSize:11, fontWeight:600,
    textShadow:'0 1px 4px rgba(0,0,0,0.5)',
    background:'rgba(0,0,0,0.22)', backdropFilter:'blur(6px)',
    padding:'5px 12px', borderRadius:20,
  },
  labelDot: {
    width:7, height:7, borderRadius:'50%',
    background:'#10b981', boxShadow:'0 0 8px #10b981',
    animation:'pulse 2s ease-in-out infinite', flexShrink:0,
  },

  chairCard: {
    position:'absolute', bottom:52, left:20, zIndex:10,
    display:'flex', alignItems:'center', gap:12,
    background:'rgba(255,255,255,0.93)', backdropFilter:'blur(16px)',
    borderRadius:14, padding:'12px 16px',
    boxShadow:'0 8px 30px rgba(0,0,0,0.14)',
    border:'1px solid rgba(255,255,255,0.85)',
    maxWidth:310, animation:'fadeUp 0.8s 0.15s ease both',
  },
  chairPhoto: {
    width:52, height:52, borderRadius:10,
    objectFit:'cover', objectPosition:'center top',
    border:'2px solid #f0f4ff', flexShrink:0,
    boxShadow:'0 2px 10px rgba(0,0,0,0.12)',
  },
  chairInfo: {},
  chairTitle:{ color:'#f97316', fontSize:9, fontWeight:800, textTransform:'uppercase', letterSpacing:'1px', marginBottom:2 },
  chairName: { color:'#1e2d4a', fontSize:13, fontWeight:800, fontFamily:"'Sora',sans-serif" },
  chairSub:  { color:'#64748b', fontSize:10, marginTop:3, lineHeight:1.4 },

  /* RIGHT */
  right: {
    width:460, background:'#f0f4ff',
    display:'flex', alignItems:'center', justifyContent:'center',
    padding:'28px 24px',
  },
  card: {
    width:'100%', background:'#fff',
    borderRadius:22, overflow:'hidden',
    boxShadow:'0 20px 60px rgba(37,99,235,0.12), 0 0 0 1px rgba(37,99,235,0.06)',
    animation:'scalePop 0.6s ease both',
  },
  rainbow: {
    height:5,
    background:'linear-gradient(90deg,#2563eb,#7c3aed,#ec4899,#f97316,#10b981,#0ea5e9)',
    backgroundSize:'300% 100%', animation:'gradMove 4s ease infinite',
  },
  body: { padding:'26px 28px 26px' },
  head: { marginBottom:20 },
  badge: {
    display:'inline-block',
    background:'linear-gradient(135deg,#eff6ff,#f5f3ff)',
    border:'1px solid #c7d2fe', color:'#4f46e5',
    fontSize:11, padding:'5px 14px', borderRadius:20, fontWeight:700, marginBottom:12,
  },
  h2:    { fontFamily:"'Sora',sans-serif", fontSize:25, fontWeight:800, color:'#1e2d4a', margin:0 },
  subTxt:{ color:'#94a3b8', fontSize:12, marginTop:5 },
  voiceSupportBadge: {
    display:'inline-flex', alignItems:'center', gap:6, marginTop:10,
    background:'linear-gradient(135deg,#fff7ed,#fffbeb)',
    border:'1px solid #fed7aa', color:'#c2410c',
    fontSize:11, padding:'4px 12px', borderRadius:20, fontWeight:700,
  },

  lbl: { display:'block', color:'#4f46e5', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:7 },
  inputWrap: {
    display:'flex', alignItems:'center', gap:10,
    background:'#f8faff', border:'1.5px solid',
    borderRadius:10, padding:'0 12px',
    transition:'all 0.25s',
  },
  inp: {
    flex:1, background:'transparent', border:'none', outline:'none',
    color:'#1e2d4a', fontSize:14, padding:'12px 0',
    fontFamily:"'Plus Jakarta Sans',sans-serif",
  },
  transcript: {
    marginTop:5, padding:'5px 10px', background:'#f0f9ff',
    border:'1px solid #bae6fd', borderRadius:8, fontSize:12,
  },

  voiceBar: {
    display:'flex', alignItems:'center', gap:10,
    padding:'9px 14px', borderRadius:10, border:'1px solid',
    transition:'all 0.3s',
  },
  errBox: {
    display:'flex', alignItems:'center', gap:10,
    background:'#fff1f2', border:'1px solid #fecdd3',
    color:'#e11d48', padding:'10px 14px', borderRadius:9, fontSize:13, fontWeight:500,
  },
  loginBtn: {
    color:'#fff', border:'none', borderRadius:10, padding:'13px',
    fontSize:15, fontWeight:700, cursor:'pointer', transition:'all 0.25s',
    fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:'0.3px',
  },

  voiceTip: {
    display:'flex', alignItems:'flex-start', gap:8,
    background:'#fff7ed', border:'1px solid #fed7aa',
    borderRadius:10, padding:'9px 13px', fontSize:11, color:'#92400e',
    marginTop:14, lineHeight:1.5,
  },

  demoSection: { marginTop:18, paddingTop:16, borderTop:'1px solid #f1f5f9' },
  divRow:  { display:'flex', alignItems:'center', gap:12, marginBottom:12 },
  divLine: { flex:1, height:1, background:'#e2e8f8' },
  divTxt:  { color:'#94a3b8', fontSize:11, fontWeight:600, whiteSpace:'nowrap' },
  demoGrid:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 },
  demoBtn: {
    display:'flex', alignItems:'center', gap:8,
    border:'1.5px solid', borderRadius:10, padding:'9px 12px',
    cursor:'pointer', transition:'all 0.2s',
    fontFamily:"'Plus Jakarta Sans',sans-serif",
  },
};