class Particle {
  constructor(x, y, color, type = 'ambient') {
    this.x = x;
    this.y = y;
    this.color = color;
    this.type = type; // 'ambient', 'burst', 'hatch'
    
    if (type === 'ambient') {
      this.size = Math.random() * 2 + 0.5;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = -Math.random() * 0.5 - 0.2; // Move upwards
      this.alpha = Math.random() * 0.5 + 0.2;
      this.life = 1;
      this.decay = Math.random() * 0.002 + 0.001;
    } else if (type === 'burst') {
      this.size = Math.random() * 4 + 2;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 3 + 1;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.alpha = 1;
      this.life = 1;
      this.decay = Math.random() * 0.03 + 0.015;
    } else if (type === 'hatch') {
      this.size = Math.random() * 6 + 2;
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 3;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.alpha = 1;
      this.life = 1;
      this.decay = Math.random() * 0.015 + 0.005;
      this.gravity = 0.12; // Particles fall down
    }
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    
    if (this.gravity) {
      this.vy += this.gravity;
    }
    
    this.life -= this.decay;
    if (this.type === 'ambient') {
      // Re-spawn ambient stardust if they drift off screen or fade out
      if (this.life <= 0 || this.y < 0) {
        this.y = window.innerHeight + 10;
        this.x = Math.random() * window.innerWidth;
        this.life = 1;
        this.alpha = Math.random() * 0.5 + 0.2;
      }
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha * this.life);
    ctx.shadowBlur = this.type !== 'ambient' ? 8 : 4;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

let canvas = null;
let ctx = null;
let particles = [];
let animationId = null;

export const particleEngine = {
  init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    
    this.resize();
    window.addEventListener('resize', () => this.resize());
    
    // Seed ambient particles
    particles = [];
    const count = Math.min(60, Math.floor((window.innerWidth * window.innerHeight) / 20000));
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(
        Math.random() * canvas.width,
        Math.random() * canvas.height,
        'rgba(255, 255, 255, 0.8)',
        'ambient'
      ));
    }
    
    this.animate();
  },

  resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  },

  triggerBurst(x, y, color = '#FFE494') {
    if (!ctx) return;
    const count = 15;
    for (let i = 0; i < count; i++) {
      particles.push(new Particle(x, y, color, 'burst'));
    }
  },

  triggerHatch(x, y, color = '#F1C40F') {
    if (!ctx) return;
    const count = 100;
    
    // Spawn standard hatching sparks
    for (let i = 0; i < count; i++) {
      // Pick random magical colors
      const colors = [color, '#FFFFFF', '#9B59B6', '#3498DB', '#1ABC9C', '#E74C3C'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      particles.push(new Particle(x, y, randomColor, 'hatch'));
    }
  },

  animate() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Filter out expired particles (except ambient)
    particles = particles.filter(p => p.type === 'ambient' || p.life > 0);
    
    particles.forEach(p => {
      p.update();
      p.draw(ctx);
    });
    
    animationId = requestAnimationFrame(() => this.animate());
  },

  destroy() {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    particles = [];
  }
};
