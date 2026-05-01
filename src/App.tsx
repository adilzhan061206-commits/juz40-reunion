// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Calendar, Clock, Trophy, Fingerprint, 
  ChevronRight, UserCheck, Timer, CloudSun, 
  Zap, ArrowUpRight, Award, Sparkles, Quote
} from 'lucide-react';

const THEME = {
  bg: "#050505",
  surface: "#0C0C0C",
  primary: "#007AFF", 
  accent: "#32D74B",
  text: "#FFFFFF",
  muted: "#86868B",
  border: "rgba(255, 255, 255, 0.08)",
};

const NeuralBackground = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let particles = [];
    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particles = [];
      const count = (canvas.width * canvas.height) / 15000;
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          size: Math.random() * 1.5
        });
      }
    };
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.fillStyle = "rgba(0, 113, 227, 0.25)";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      });
      requestAnimationFrame(animate);
    };
    window.addEventListener('resize', init);
    init(); animate();
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, background: THEME.bg }} />;
};

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const target = new Date("2026-05-02T19:00:00");
      const diff = target - now;
      if (diff > 0) {
        setTimeLeft({
          h: Math.floor(diff / (1000 * 60 * 60)),
          m: Math.floor((diff / 1000 / 60) % 60),
          s: Math.floor((diff / 1000) % 60)
        });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isReady) return <TerminalLoader onComplete={() => setIsReady(true)} />;

  return (
    <div style={{ color: THEME.text, fontFamily: 'Inter, sans-serif', backgroundColor: THEME.bg }}>
      <NeuralBackground />
      
      <nav style={{ position: 'fixed', top: 0, width: '100%', padding: '20px 40px', zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backdropFilter: 'blur(20px)', borderBottom: THEME.border }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Zap color={THEME.primary} size={20} fill={THEME.primary} />
          <span style={{ fontWeight: 900, fontSize: '16px', letterSpacing: '-0.5px' }}>JUZ40 <span style={{color: THEME.primary}}>ALUMNI</span></span>
        </div>
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '6px 14px', borderRadius: '100px', fontSize: '9px', fontWeight: 900, color: THEME.muted, border: '1px solid rgba(255, 255, 255, 0.1)', letterSpacing: '2px' }}>
          JUZ40_CORE_V.2019
        </div>
      </nav>

      <main style={{ position: 'relative', zIndex: 1, paddingTop: '140px', paddingBottom: '100px', maxWidth: '1100px', margin: '0 auto', paddingLeft: '24px', paddingRight: '24px' }}>
        
        <header style={{ textAlign: 'center', marginBottom: '80px' }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 style={{ fontSize: 'clamp(40px, 8vw, 110px)', fontWeight: 950, lineHeight: 0.85, letterSpacing: '-5px', marginBottom: '20px' }}>
              LEGACY <br/> <span style={{ color: 'transparent', WebkitTextStroke: `1.2px ${THEME.text}`, opacity: 0.8 }}>REUNITED</span>
            </h1>
            <p style={{ fontSize: '14px', color: THEME.muted, fontWeight: 500, letterSpacing: '4px' }}>OFFICIAL PROTOCOL • CLASS OF 2019</p>
          </motion.div>
        </header>

        {/* BENTO GRID */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '20px' 
        }}>
          
          <BentoCard icon={<Calendar color={THEME.primary} />} title="TEMPORAL">
             <div style={{ fontSize: '28px', fontWeight: 900, marginBottom: '4px' }}>2 МАМЫР</div>
             <div style={{ fontSize: '16px', fontWeight: 600, color: THEME.muted, marginBottom: '20px' }}>ЖҰМА, 19:00</div>
             <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: THEME.border, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <CloudSun size={18} color={THEME.primary} />
                <p style={{ fontSize: '11px', color: THEME.muted, lineHeight: 1.4, margin: 0 }}>Алматы: +18°C. Жаздық жеңіл киім ұсынылады.</p>
             </div>
          </BentoCard>

          <BentoCard icon={<Timer color={THEME.primary} />} title="COUNTDOWN">
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <TimeBox label="SAĞAT" val={timeLeft.h} />
              <TimeBox label="MINUT" val={timeLeft.m} />
              <TimeBox label="SEKUND" val={timeLeft.s} />
            </div>
            <div style={{ width: '100%', height: '2px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
              <motion.div animate={{ x: ['-100%', '0%'] }} transition={{ duration: 10, repeat: Infinity, ease: 'linear' }} style={{ height: '100%', background: THEME.primary }} />
            </div>
          </BentoCard>

          <BentoCard icon={<MapPin color={THEME.primary} />} title="EXTRACTION">
            <h3 style={{ fontSize: '22px', fontWeight: 900, marginBottom: '10px' }}>Алматы Қаласы</h3>
            <p style={{ color: THEME.muted, fontSize: '12px', marginBottom: '20px' }}>Нақты локация верификацияланған резиденттерге жіберіледі.</p>
            <button 
              onClick={() => window.open("https://2gis.kz/almaty/geo/70000001100229038")}
              style={{ width: '100%', padding: '14px', borderRadius: '12px', background: THEME.primary, color: 'white', border: 'none', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px' }}
            >
              2GIS <ArrowUpRight size={14} />
            </button>
          </BentoCard>

          {/* THE MANIFESTO - FULL WIDTH (3 COLUMNS) */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            style={{ 
              gridColumn: '1 / -1', 
              background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)', 
              borderRadius: '40px', 
              padding: '50px', 
              border: THEME.border, 
              backdropFilter: 'blur(30px)',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ position: 'absolute', top: '40px', right: '40px', opacity: 0.1 }}>
              <Quote size={120} color={THEME.primary} />
            </div>
            
            <div style={{ maxWidth: '800px', position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '30px' }}>
                <Award size={24} color={THEME.accent} />
                <span style={{ fontSize: '12px', fontWeight: 900, color: THEME.muted, letterSpacing: '3px', textTransform: 'uppercase' }}>The Manifesto</span>
              </div>
              
              <h2 style={{ fontSize: '32px', fontWeight: '600', lineHeight: 1.4, color: '#E5E5E7', marginBottom: '40px' }}>
                "7 жыл бұрын біз бір үлкен жолға аттандық. Бүгін әрқайсымыз әртүрлі белестерді бағындырсақ та, <span style={{ color: THEME.primary, fontWeight: 800 }}>Juz40 қанымызда қалды.</span> Ертеңгі кеш — жетістіктер туралы емес, бізді біріктірген сол бір шынайы достық пен рух туралы."
              </h2>

              <div style={{ display: 'flex', gap: '40px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: 'rgba(50, 215, 75, 0.1)', padding: '10px', borderRadius: '12px' }}><Sparkles size={20} color={THEME.accent} /></div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: THEME.muted, letterSpacing: '1px' }}>LEGACY</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: 'rgba(0, 122, 255, 0.1)', padding: '10px', borderRadius: '12px' }}><Trophy size={20} color={THEME.primary} /></div>
                  <div style={{ fontSize: '12px', fontWeight: 800, color: THEME.muted, letterSpacing: '1px' }}>HONOR</div>
                </div>
              </div>
            </div>
          </motion.div>

        </div>

        <footer style={{ marginTop: '100px', textAlign: 'center', opacity: 0.3 }}>
          <p style={{ fontSize: '10px', letterSpacing: '6px', fontWeight: 900 }}>© 2026 JUZ40 INFRASTRUCTURE</p>
        </footer>
      </main>
    </div>
  );
}

function BentoCard({ children, title, icon }) {
  return (
    <motion.div initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      style={{ 
        background: 'rgba(255,255,255,0.02)', borderRadius: '30px', padding: '30px', border: THEME.border, backdropFilter: 'blur(30px)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <div style={{ padding: '6px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }}>{icon}</div>
        <span style={{ fontSize: '10px', fontWeight: 900, color: THEME.muted, letterSpacing: '2px', textTransform: 'uppercase' }}>{title}</span>
      </div>
      {children}
    </motion.div>
  );
}

function TimeBox({ label, val }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', padding: '12px 5px', borderRadius: '15px', textAlign: 'center', border: THEME.border }}>
      <div style={{ fontSize: '20px', fontWeight: 900, color: THEME.primary }}>{val}</div>
      <div style={{ fontSize: '7px', fontWeight: 800, color: THEME.muted, marginTop: '2px' }}>{label}</div>
    </div>
  );
}

const TerminalLoader = ({ onComplete }) => {
  useEffect(() => { setTimeout(onComplete, 1000); }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: THEME.primary, fontFamily: 'monospace', fontSize: '12px', letterSpacing: '2px' }}>INITIALIZING_PORTAL_V2...</div>
    </div>
  );
};