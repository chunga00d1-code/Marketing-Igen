/**
 * Claude Render Service
 * ─────────────────────
 * Gọi Claude Render Server trên VPS (hoàn toàn độc lập với Hermes).
 * VPS server dùng Anthropic Claude API để sinh HTML+GSAP → HyperFrames → FFmpeg → Cloudinary.
 */

import { AIMediaModel } from "../../model/ai-media.model";
import { broadcastEvent } from "../../socket";

function getServerUrl(): string {
  return String(process.env.CLAUDE_RENDER_VPS_URL || "http://localhost:8644").replace(/\/$/, "");
}

function getApiKey(): string {
  return process.env.CLAUDE_RENDER_API_KEY || "";
}

const POLL_INTERVAL_MS = 12_000;
const MAX_POLLS = 200; // 200 × 12s = 40 phút

// ─── Scene type system ─────────────────────────────────────────────────────────

export type SceneType = 'hook' | 'story' | 'insight' | 'pipeline' | 'ui_mockup' | 'before_after' | 'cta';

export type SceneItem = {
  icon?: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'danger' | 'warning';
};

export type PipelineStep = {
  step?: string;        // e.g. "BƯỚC 1"
  icon?: string;
  title: string;
  description?: string;
  tag?: string;         // e.g. "INPUT", "AI ENGINE"
  variant?: 'active' | 'dim';
};

export type SceneSpec = {
  type: SceneType;
  index?: number;
  totalScenes?: number;
  label?: string;           // custom label e.g. "HOOK"
  title?: string;
  subtitle?: string;
  titleColor?: 'gold' | 'red' | 'green' | 'white' | 'cyan';
  highlightWords?: string[];
  items?: SceneItem[];
  steps?: PipelineStep[];
  stats?: Array<{ value: string; label: string }>;
  code?: string;            // for ui_mockup
  liveStats?: Array<{ label: string; value: string; key?: string }>;
  before?: { label: string; duration?: string };
  after?: { label: string; badge?: string };
  metric?: { from: string; to: string; label?: string };
  ctaButton?: string;
  ctaPrompt?: string;
  duration?: number;        // seconds per scene
};

export type ClaudeRenderOptions = {
  facecamUrl: string;
  outline: string;
  scenes?: string[];
  scenesContent?: SceneSpec[];
  brandName?: string;
  bgMusicUrl?: string;
  webhookUrl?: string;
  colorScheme?: 'dark-gold' | 'dark-cyan' | 'dark-red';
};

// ─── Rich outline builder ──────────────────────────────────────────────────────

const SCENE_LABEL_MAP: Record<SceneType, string> = {
  hook: 'HOOK',
  story: 'STORY',
  insight: 'INSIGHT',
  pipeline: 'PIPELINE',
  ui_mockup: 'CLAUDE UI MOCKUP',
  before_after: 'BEFORE AFTER',
  cta: 'CTA',
};

function buildRichOutline(options: ClaudeRenderOptions): string {
  const { scenesContent, brandName = "iGen Tech", outline, colorScheme = 'dark-gold' } = options;
  const sceneList = scenesContent && scenesContent.length > 0 ? scenesContent : [];
  const totalScenes = sceneList.length || 6;

  const colorPalette = colorScheme === 'dark-cyan'
    ? { accent: '#00D4FF', accent2: '#00CC66', danger: '#FF6B6B' }
    : colorScheme === 'dark-red'
      ? { accent: '#FF4444', accent2: '#FF8C00', danger: '#FF4444' }
      : { accent: '#FFD700', accent2: '#00CC66', danger: '#FF4444' };

  const styleGuide = `
# PROFESSIONAL VIDEO GENERATION SPEC
Brand: ${brandName}
Total Scenes: ${totalScenes}
Color Scheme: ${colorScheme}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## CRITICAL: LAYOUT (MANDATORY — do not change)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Each scene is a FULL-SCREEN HTML document (1280×720px, 16:9)
- Content occupies the LEFT 68% (≈870px wide) of the screen
- RIGHT 32% (≈410px) is reserved for the facecam video (handled by the renderer — do NOT place content there)
- Add a subtle vertical separator line at left: 870px (1px, rgba(255,255,255,0.08))
- Use class "content-area" (width:870px) to contain all scene elements

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## CRITICAL: COLOR PALETTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Background:      #0a0a0a  (near-black)
- Text primary:    #FFFFFF
- Accent gold:     ${colorPalette.accent}  → use for main titles, headings, star text
- Accent green:    ${colorPalette.accent2} → success/solution items, checkmarks
- Accent red:      ${colorPalette.danger}  → problem/before items, danger cards
- Accent cyan:     #00D4FF  → pipeline/tech scenes
- Text muted:      rgba(255,255,255,0.50)
- Card bg danger:  rgba(255,68,68,0.05)
- Card bg success: rgba(0,204,102,0.05)
- Card bg default: rgba(255,255,255,0.03)
- Card border danger:  rgba(255,68,68,0.35)
- Card border success: rgba(0,204,102,0.35)
- Card border default: rgba(255,255,255,0.12)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## CRITICAL: TYPOGRAPHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Hero title:   52-64px, font-weight:800, line-height:1.1, color:${colorPalette.accent}
- Section title: 40-52px, font-weight:700
- Subtitle:     15px, opacity:0.60, font-weight:400, margin-top:6px
- Card title:   17px, font-weight:600, color:#fff
- Card desc:    13px, color:rgba(255,255,255,0.55)
- Scene label:  10px, letter-spacing:3px, color:rgba(${colorPalette.accent === '#FFD700' ? '255,215,0' : '0,212,255'},0.65), font-family:monospace, text-transform:uppercase
- Stats value:  48-64px, font-weight:900, color:${colorPalette.accent}
- Stats label:  12px, opacity:0.55, text-transform:uppercase, letter-spacing:1px

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## MANDATORY COMPONENTS — use exact code patterns below
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

### COMPONENT 1: Star Particle Background
MUST include this JS to generate animated star particles:
\`\`\`javascript
(function(){
  var bg=document.getElementById('star-bg');
  for(var i=0;i<140;i++){
    var s=document.createElement('div');
    var sz=Math.random()*2.2+0.4;
    var op=Math.random()*0.45+0.08;
    var dur=Math.random()*10+5;
    var delay=Math.random()*8;
    s.style.cssText='position:absolute;border-radius:50%;background:#fff;pointer-events:none;'+
      'width:'+sz+'px;height:'+sz+'px;'+
      'left:'+(Math.random()*100)+'%;top:'+(Math.random()*100)+'%;'+
      'opacity:'+op+';animation:starDrift '+dur+'s '+delay+'s linear infinite;';
    bg.appendChild(s);
  }
})();
\`\`\`
Required CSS:
\`\`\`css
@keyframes starDrift {
  0%   { transform: translateY(0) translateX(0); opacity: var(--op, 0.3); }
  50%  { opacity: calc(var(--op, 0.3) * 1.5); }
  100% { transform: translateY(-30px) translateX(8px); opacity: 0; }
}
#star-bg { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0; }
\`\`\`

### COMPONENT 2: Scene Label
\`\`\`html
<div class="scene-label">SCENE 0X / ${String(totalScenes).padStart(2, '0')} — TYPE</div>
\`\`\`
\`\`\`css
.scene-label { position:absolute; top:16px; left:18px; font-size:10px; letter-spacing:3px;
  color:rgba(255,215,0,0.65); font-family:'Courier New',monospace; text-transform:uppercase; z-index:10; }
\`\`\`

### COMPONENT 3: Card with glow border (slide-in GSAP)
\`\`\`html
<div class="card card-danger">
  <div class="card-icon">⚠️</div>
  <div class="card-body">
    <div class="card-title">Title here</div>
    <div class="card-desc">Description here</div>
  </div>
</div>
\`\`\`
\`\`\`css
.card { display:flex; align-items:center; gap:16px; padding:14px 18px; border-radius:12px;
  border:1px solid; margin-bottom:10px; }
.card-danger  { border-color:rgba(255,68,68,0.35);  background:rgba(255,68,68,0.05);  box-shadow:inset 0 0 20px rgba(255,68,68,0.03); }
.card-success { border-color:rgba(0,204,102,0.35); background:rgba(0,204,102,0.05); box-shadow:inset 0 0 20px rgba(0,204,102,0.03); }
.card-default { border-color:rgba(255,255,255,0.12); background:rgba(255,255,255,0.03); }
.card-gold    { border-color:rgba(255,215,0,0.35);  background:rgba(255,215,0,0.04);  box-shadow:inset 0 0 20px rgba(255,215,0,0.03); }
.card-icon { font-size:26px; flex-shrink:0; width:42px; text-align:center; }
.card-title { font-size:17px; font-weight:600; color:#fff; margin-bottom:3px; }
.card-desc  { font-size:13px; color:rgba(255,255,255,0.55); line-height:1.4; }
\`\`\`
GSAP stagger animate (add after DOM ready):
\`\`\`javascript
gsap.from('.card', { x:-50, opacity:0, duration:0.55, stagger:0.18, ease:'power2.out', delay:0.3 });
\`\`\`

### COMPONENT 4: Pipeline step card (horizontal flow)
\`\`\`html
<div class="pipeline-steps">
  <div class="step step-active">
    <div class="step-icon">💡</div>
    <div class="step-label">BƯỚC 1</div>
    <div class="step-title">PROMPT<br>Ý TƯỞNG</div>
    <div class="step-desc">Mô tả nội dung</div>
    <div class="step-tag">INPUT</div>
  </div>
  <!-- arrow -->
  <div class="step-arrow">▶</div>
  <div class="step step-dim">...</div>
</div>
\`\`\`
\`\`\`css
.pipeline-steps { display:flex; align-items:stretch; gap:8px; margin-top:20px; }
.step { flex:1; display:flex; flex-direction:column; align-items:center; text-align:center;
  padding:18px 12px; border-radius:12px; border:1px solid; }
.step-active { border-color:rgba(255,215,0,0.45); background:rgba(255,215,0,0.05); }
.step-dim    { border-color:rgba(255,255,255,0.08); background:rgba(255,255,255,0.02); opacity:0.5; }
.step-icon  { font-size:28px; margin-bottom:8px; }
.step-label { font-size:9px; letter-spacing:2px; color:rgba(255,215,0,0.7); font-family:monospace; margin-bottom:6px; }
.step-title { font-size:14px; font-weight:700; color:#fff; margin-bottom:6px; line-height:1.2; }
.step-desc  { font-size:11px; color:rgba(255,255,255,0.5); flex:1; }
.step-tag   { margin-top:10px; font-size:9px; letter-spacing:1.5px; padding:3px 8px;
  border-radius:4px; border:1px solid rgba(255,215,0,0.3); color:rgba(255,215,0,0.8); font-family:monospace; }
.step-arrow { color:rgba(255,215,0,0.6); font-size:14px; align-self:center; flex-shrink:0; }
\`\`\`
GSAP reveal steps one by one:
\`\`\`javascript
gsap.from('.step', { y:30, opacity:0, duration:0.5, stagger:0.2, ease:'back.out(1.2)', delay:0.4 });
\`\`\`

### COMPONENT 5: Stats counter (count-up animation)
\`\`\`html
<div class="stats-row">
  <div class="stat-cell"><div class="stat-value" data-target="81">0</div><div class="stat-label">videos</div></div>
  <div class="stat-divider"></div>
  <div class="stat-cell"><div class="stat-value">25 phút</div><div class="stat-label">mỗi video</div></div>
  <div class="stat-divider"></div>
  <div class="stat-cell"><div class="stat-value">$0</div><div class="stat-label">chi phí</div></div>
</div>
\`\`\`
\`\`\`css
.stats-row { display:flex; border:1px solid rgba(255,255,255,0.1); border-radius:12px; overflow:hidden; margin-top:16px; }
.stat-cell { flex:1; padding:18px 16px; text-align:center; background:rgba(255,255,255,0.02); }
.stat-value { font-size:42px; font-weight:900; color:#FFD700; line-height:1; }
.stat-label { font-size:11px; color:rgba(255,255,255,0.5); text-transform:uppercase; letter-spacing:1.5px; margin-top:6px; }
.stat-divider { width:1px; background:rgba(255,255,255,0.08); }
\`\`\`
Count-up JS:
\`\`\`javascript
document.querySelectorAll('.stat-value[data-target]').forEach(el => {
  var target = parseInt(el.dataset.target);
  var start = Date.now();
  var dur = 1500;
  (function tick(){
    var p = Math.min(1, (Date.now()-start)/dur);
    el.textContent = Math.floor(p*target) + '+';
    if(p<1) requestAnimationFrame(tick);
  })();
});
\`\`\`

### COMPONENT 6: Terminal / UI Mockup window
\`\`\`html
<div class="terminal-window">
  <div class="terminal-bar">
    <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
    <span class="terminal-title">HERMES AGENT — Claude Code</span>
    <span class="terminal-badge">Pro</span>
  </div>
  <div class="terminal-body">
    <div class="terminal-prompt">YOU</div>
    <div class="terminal-text" id="typed-text"></div>
  </div>
</div>
\`\`\`
\`\`\`css
.terminal-window { border-radius:10px; overflow:hidden; border:1px solid rgba(255,255,255,0.12); background:#111; }
.terminal-bar { display:flex; align-items:center; gap:8px; padding:10px 14px; background:#1a1a1a; border-bottom:1px solid rgba(255,255,255,0.08); }
.dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; }
.dot.red    { background:#FF5F57; }
.dot.yellow { background:#FEBC2E; }
.dot.green  { background:#28C840; }
.terminal-title { flex:1; text-align:center; font-size:12px; color:rgba(255,255,255,0.6); font-family:monospace; }
.terminal-badge { font-size:10px; border:1px solid rgba(255,215,0,0.4); color:rgba(255,215,0,0.8); padding:2px 8px; border-radius:4px; font-family:monospace; }
.terminal-body { padding:20px; font-family:'Courier New',monospace; }
.terminal-prompt { font-size:10px; color:rgba(255,255,255,0.35); letter-spacing:2px; margin-bottom:10px; }
.terminal-text { font-size:14px; color:#fff; line-height:1.6; white-space:pre-wrap; }
\`\`\`
Typing animation JS:
\`\`\`javascript
var text = "Edit video claude va hyperframe\\ntheo style @tranvanhoang88\\nClaude UI mockup chinh xac\\ntyping animation";
var el = document.getElementById('typed-text');
var i = 0;
function typeChar() {
  if(i < text.length) { el.textContent += text[i++]; setTimeout(typeChar, 45 + Math.random()*30); }
}
setTimeout(typeChar, 600);
\`\`\`

### COMPONENT 7: Before / After comparison
\`\`\`html
<div class="ba-container">
  <div class="ba-card ba-before">
    <div class="ba-label-bar before-bar">BEFORE</div>
    <div class="ba-content"><div class="ba-thumb"></div></div>
    <div class="ba-footer"><span class="ba-tag">VIDEO GỐC</span><span class="ba-time">0:00 ... 1:09</span></div>
  </div>
  <div class="ba-vs">VS</div>
  <div class="ba-card ba-after">
    <div class="ba-label-bar after-bar">SAU ↑ <span class="after-badge">CHUYÊN NGHIỆP</span></div>
    <div class="ba-content"><div class="ba-thumb"></div></div>
    <div class="ba-footer-tag">VIDEO CHUYÊN NGHIỆP ↑</div>
  </div>
</div>
<div class="metric-box"><span class="metric-from">2.5h</span><span class="metric-arrow">→</span><span class="metric-to">25 phút</span></div>
\`\`\`
\`\`\`css
.ba-container { display:flex; align-items:center; gap:16px; margin-top:16px; }
.ba-card { flex:1; border-radius:12px; overflow:hidden; border:1px solid; }
.ba-before { border-color:rgba(255,68,68,0.4); }
.ba-after  { border-color:rgba(255,215,0,0.4); }
.ba-label-bar { padding:8px 14px; font-size:11px; font-weight:700; letter-spacing:1px; }
.before-bar { background:rgba(255,68,68,0.2); color:#FF6B6B; }
.after-bar  { background:rgba(255,215,0,0.15); color:#FFD700; display:flex; justify-content:space-between; }
.after-badge { font-size:9px; border:1px solid rgba(255,215,0,0.4); padding:1px 6px; border-radius:3px; }
.ba-content { background:rgba(0,0,0,0.4); height:160px; }
.ba-vs { font-size:22px; font-weight:900; color:#FFD700; background:rgba(255,215,0,0.1); border:2px solid rgba(255,215,0,0.35); border-radius:50%; width:44px; height:44px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.metric-box { margin-top:14px; background:rgba(255,68,68,0.08); border:1px solid rgba(255,68,68,0.25); border-radius:10px; padding:14px 20px; display:inline-flex; align-items:center; gap:14px; }
.metric-from { font-size:22px; font-weight:800; color:#FF6B6B; }
.metric-arrow { font-size:18px; color:rgba(255,255,255,0.5); }
.metric-to   { font-size:22px; font-weight:800; color:#FFD700; }
\`\`\`

### COMPONENT 8: Highlight subtitle words
To make certain words gold/colored in a line:
\`\`\`html
<div class="subtitle">cần edit <span class="hl-gold">hay là không cần timeline</span></div>
\`\`\`
\`\`\`css
.hl-gold  { color:#FFD700; }
.hl-red   { color:#FF4444; }
.hl-green { color:#00CC66; }
.hl-cyan  { color:#00D4FF; }
\`\`\`

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## GSAP USAGE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Load GSAP from CDN: <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
- ALL animations must use gsap.from() or gsap.timeline()
- Hero title: gsap.from('.hero-title', { y:-30, opacity:0, duration:0.7, ease:'power3.out' })
- Subtitle:   gsap.from('.subtitle',   { y: 20, opacity:0, duration:0.5, delay:0.25 })
- Cards:      gsap.from('.card',       { x:-50, opacity:0, duration:0.55, stagger:0.18, delay:0.3 })
- Steps:      gsap.from('.step',       { y: 30, opacity:0, duration:0.5, stagger:0.2, delay:0.4 })
- Stats:      gsap.from('.stat-cell',  { scale:0.7, opacity:0, duration:0.6, stagger:0.15, delay:0.5 })
`;

  // Build per-scene specs
  let sceneSpecs = "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n## SCENE SPECIFICATIONS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

  if (sceneList.length > 0) {
    sceneList.forEach((scene, i) => {
      const sceneNum = String(i + 1).padStart(2, '0');
      const total = String(sceneList.length).padStart(2, '0');
      const label = scene.label || SCENE_LABEL_MAP[scene.type] || scene.type.toUpperCase();
      const sceneLabelText = `SCENE ${sceneNum} / ${total} — ${label}`;

      sceneSpecs += `\n### Scene ${sceneNum}: ${label} (type: ${scene.type})\n`;
      sceneSpecs += `Scene label text: "${sceneLabelText}"\n`;
      sceneSpecs += `Duration: ${scene.duration || 12}s\n`;

      if (scene.title) {
        const tc = scene.titleColor || (scene.type === 'story' ? 'red' : scene.type === 'insight' ? 'green' : 'gold');
        sceneSpecs += `Title: "${scene.title}" (color: ${tc})\n`;
      }
      if (scene.subtitle) sceneSpecs += `Subtitle: "${scene.subtitle}"\n`;
      if (scene.highlightWords?.length) sceneSpecs += `Highlight these words in gold: ${scene.highlightWords.join(', ')}\n`;

      if (scene.items?.length) {
        sceneSpecs += `Cards (use COMPONENT 3 pattern):\n`;
        scene.items.forEach((item, j) => {
          const v = item.variant || (scene.type === 'story' ? 'danger' : scene.type === 'insight' ? 'success' : 'default');
          sceneSpecs += `  ${j + 1}. [${v}] icon:${item.icon || '📌'} title:"${item.title}" desc:"${item.description || ''}"\n`;
        });
      }

      if (scene.steps?.length) {
        sceneSpecs += `Pipeline steps (use COMPONENT 4 pattern):\n`;
        scene.steps.forEach((s, j) => {
          const v = s.variant || (j === 0 ? 'active' : 'dim');
          sceneSpecs += `  ${j + 1}. [${v}] label:"${s.step || `BƯỚC ${j + 1}`}" icon:${s.icon || '▶'} title:"${s.title}" desc:"${s.description || ''}" tag:"${s.tag || ''}"\n`;
        });
      }

      if (scene.stats?.length) {
        sceneSpecs += `Stats (use COMPONENT 5 count-up pattern):\n`;
        scene.stats.forEach(st => {
          sceneSpecs += `  value:"${st.value}" label:"${st.label}"\n`;
        });
      }

      if (scene.code && scene.type === 'ui_mockup') {
        sceneSpecs += `Terminal typing text:\n"${scene.code}"\n`;
        if (scene.liveStats?.length) {
          sceneSpecs += `Live stats panel (right side of terminal):\n`;
          scene.liveStats.forEach(s => sceneSpecs += `  ${s.label}: ${s.value}\n`);
        }
      }

      if (scene.type === 'before_after') {
        if (scene.before) sceneSpecs += `BEFORE label:"${scene.before.label}" duration:"${scene.before.duration || ''}"\n`;
        if (scene.after) sceneSpecs += `AFTER label:"${scene.after.label}" badge:"${scene.after.badge || ''}"\n`;
        if (scene.metric) sceneSpecs += `Metric: "${scene.metric.from}" → "${scene.metric.to}"${scene.metric.label ? ` (${scene.metric.label})` : ''}\n`;
      }

      if (scene.type === 'cta') {
        if (scene.ctaButton) sceneSpecs += `CTA button text: "${scene.ctaButton}"\n`;
        if (scene.ctaPrompt) sceneSpecs += `CTA prompt text: "${scene.ctaPrompt}"\n`;
      }
    });
  } else {
    // No scenesContent — use outline as-is with scene type hints
    sceneSpecs += `\nUse this outline to determine scene content:\n${outline}\n`;
    sceneSpecs += `\nDefault scenes to generate: hook, story, insight, pipeline, ui_mockup, before_after, cta\n`;
    sceneSpecs += `Apply the visual style guide above to ALL scenes.\n`;
    sceneSpecs += `Use star particles background on every scene.\n`;
  }

  sceneSpecs += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## GENERATION RULES (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Generate ONE HTML file per scene — each is a complete standalone document
2. Every scene MUST have: star particles background, scene label top-left, content in left 68% only
3. Use exact CSS values from this spec — DO NOT invent different styles
4. Include GSAP CDN and animate ALL elements on load
5. All text must be in Vietnamese unless specified otherwise
6. Brand: ${brandName}
7. Do NOT place any content in the right 32% (facecam area)
8. Background color: #0a0a0a (NOT pure black #000000)
9. Font: system-ui, -apple-system, 'Segoe UI', Arial, sans-serif (NO Google Fonts CDN — too slow)
`;

  return styleGuide + sceneSpecs;
}

// ─── Poll & run ────────────────────────────────────────────────────────────────

async function pollJobStatus(taskId: string): Promise<{
  status: string;
  result_url?: string;
  error?: string;
}> {
  const url = getServerUrl();
  const key = getApiKey();

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    try {
      const res = await fetch(`${url}/status/${taskId}`, {
        headers: { "X-API-Key": key },
      });
      if (!res.ok) continue;
      const data = await res.json() as {
        status?: string; result_url?: string; error?: string;
      };
      const s = data.status || "";
      if (s === "done" || s === "failed") return { status: s, result_url: data.result_url, error: data.error };
    } catch {
      // retry
    }
  }
  return { status: "failed", error: "Timeout: Claude Render không hoàn thành sau 40 phút" };
}

export const claudeRenderService = {
  async renderVideo(
    userId: string,
    options: ClaudeRenderOptions
  ): Promise<{ status: string; record: any }> {
    const {
      facecamUrl, outline, scenesContent,
      brandName = "iGen Tech", bgMusicUrl = "", webhookUrl = "",
    } = options;

    const sceneLabels = scenesContent?.map(s => s.label || SCENE_LABEL_MAP[s.type] || s.type) || ["hook", "story", "insight", "pipeline", "before_after", "cta"];

    const record = await AIMediaModel.create({
      userId,
      mediaType: "video",
      url: `pending://claude-render/${userId}-${Date.now()}`,
      prompt: outline,
      metadata: {
        status: "processing",
        progress: 5,
        provider: "claude-render",
        title: `Professional Video: ${outline.slice(0, 60)}`,
        description: "Claude đang tạo video chuyên nghiệp (HTML+GSAP → HyperFrames → FFmpeg)...",
        renderLogs: [
          "[Claude Render] Khởi tạo pipeline...",
          `[Claude Render] Facecam: ${facecamUrl}`,
          `[Claude Render] Scenes: ${sceneLabels.join(", ")}`,
          scenesContent ? `[Claude Render] Scene content: ${scenesContent.length} scenes với spec chi tiết` : "[Claude Render] Dùng outline tự do",
        ],
        aspectRatio: "16:9",
        resolution: "720p",
      },
    });

    void this._run(record._id.toString(), userId, facecamUrl, outline, {
      scenesContent, brandName, bgMusicUrl, webhookUrl,
      colorScheme: options.colorScheme,
    });

    return { status: "success", record };
  },

  async _run(
    recordId: string,
    userId: string,
    facecamUrl: string,
    outline: string,
    opts: {
      scenesContent?: SceneSpec[];
      brandName?: string;
      bgMusicUrl?: string;
      webhookUrl?: string;
      colorScheme?: string;
    }
  ): Promise<void> {
    const serverUrl = getServerUrl();
    const apiKey = getApiKey();

    function addLog(progress: number, msg: string, extraStatus?: string) {
      AIMediaModel.findByIdAndUpdate(recordId, {
        $push: { "metadata.renderLogs": msg },
        $set: { "metadata.progress": progress },
      }).catch(() => { });
      broadcastEvent("video_status_updated", {
        recordId, userId, progress, log: msg,
        status: extraStatus || (progress < 100 ? "processing" : "done"),
      });
    }

    try {
      // Kiểm tra VPS health
      const health = await fetch(`${serverUrl}/health`).then(r => r.json()).catch(() => null) as any;
      if (!health?.status || health.status !== "ok") {
        throw new Error("Claude Render VPS không phản hồi");
      }
      if (!health.anthropic_key_set) {
        throw new Error("ANTHROPIC_API_KEY chưa set trên VPS Claude Render Server");
      }

      addLog(8, "[Claude Render] VPS đang hoạt động. Đang build rich scene spec...");

      // Build rich outline từ scene specs
      const richOutline = buildRichOutline({
        facecamUrl,
        outline,
        scenesContent: opts.scenesContent,
        brandName: opts.brandName,
        bgMusicUrl: opts.bgMusicUrl,
        colorScheme: (opts.colorScheme as any) || 'dark-gold',
      });

      addLog(12, `[Claude Render] Scene spec: ${richOutline.length} chars — gửi lên VPS...`);

      // Submit job với rich outline
      const submitRes = await fetch(`${serverUrl}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          facecam_url: facecamUrl,
          outline: richOutline,
          scenes: opts.scenesContent?.map(s => s.type) || ["hook", "story", "insight", "pipeline", "before_after", "cta"],
          brand_name: opts.brandName || "iGen Tech",
          bg_music_url: opts.bgMusicUrl || "",
          webhook_url: opts.webhookUrl || "",
          user_id: userId,
          record_id: recordId,
        }),
      });

      if (!submitRes.ok) {
        const err = await submitRes.json().catch(() => ({})) as any;
        throw new Error(err?.error || `VPS submit failed: HTTP ${submitRes.status}`);
      }

      const { task_id } = await submitRes.json() as { task_id: string };
      addLog(15, `[Claude Render] Job queued: ${task_id}`);
      addLog(18, "[Claude Render] Claude đang viết HTML+GSAP cho từng scene...");

      // Poll
      const result = await pollJobStatus(task_id);

      if (result.status === "done" && result.result_url) {
        await AIMediaModel.findByIdAndUpdate(recordId, {
          $set: {
            url: result.result_url,
            "metadata.status": "done",
            "metadata.progress": 100,
          },
          $push: { "metadata.renderLogs": `[Claude Render] Hoàn thành: ${result.result_url}` },
        });
        broadcastEvent("video_status_updated", {
          recordId, userId, progress: 100, status: "done", url: result.result_url,
        });
      } else {
        throw new Error(result.error || "Claude Render thất bại");
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error(`[Claude Render] Job ${recordId} error:`, msg);
      await AIMediaModel.findByIdAndUpdate(recordId, {
        $set: { "metadata.status": "failed", "metadata.progress": 0 },
        $push: { "metadata.renderLogs": `[Claude Render] Lỗi: ${msg}` },
      });
      broadcastEvent("video_status_updated", {
        recordId, userId, progress: 0, status: "failed", error: msg,
      });
    }
  },
};
