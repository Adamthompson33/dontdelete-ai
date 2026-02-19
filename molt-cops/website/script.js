/* ═══════════════════════════════════════════════════
   MOLT COPS — JavaScript
   To Protect and Serve (Humanity)
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all modules
    initNavbar();
    initScrollAnimations();
    initCounters();
    initMobileMenu();
    initSmoothScroll();
});

/* ═══════════════════════════════════════════════════
   Navbar
   ═══════════════════════════════════════════════════ */

function initNavbar() {
    const navbar = document.querySelector('.navbar');
    let lastScroll = 0;
    
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;
        
        // Add background when scrolled
        if (currentScroll > 50) {
            navbar.style.background = 'rgba(10, 10, 15, 0.98)';
        } else {
            navbar.style.background = 'rgba(10, 10, 15, 0.9)';
        }
        
        // Hide/show on scroll direction (optional)
        // if (currentScroll > lastScroll && currentScroll > 100) {
        //     navbar.style.transform = 'translateY(-100%)';
        // } else {
        //     navbar.style.transform = 'translateY(0)';
        // }
        
        lastScroll = currentScroll;
    });
}

/* ═══════════════════════════════════════════════════
   Scroll Animations
   ═══════════════════════════════════════════════════ */

function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                
                // Stagger children animations
                const children = entry.target.querySelectorAll('.animate-child');
                children.forEach((child, index) => {
                    child.style.animationDelay = `${index * 0.1}s`;
                    child.classList.add('animate-in');
                });
            }
        });
    }, observerOptions);
    
    // Observe sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('animate-on-scroll');
        observer.observe(section);
    });
    
    // Observe cards and items
    document.querySelectorAll('.mission-card, .pledge-item, .headline, .quote').forEach(item => {
        item.classList.add('animate-on-scroll');
        observer.observe(item);
    });
}

// Add animation styles dynamically
const animationStyles = document.createElement('style');
animationStyles.textContent = `
    .animate-on-scroll {
        opacity: 0;
        transform: translateY(30px);
        transition: opacity 0.6s ease, transform 0.6s ease;
    }
    
    .animate-on-scroll.animate-in {
        opacity: 1;
        transform: translateY(0);
    }
    
    .mission-card.animate-on-scroll,
    .pledge-item.animate-on-scroll,
    .headline.animate-on-scroll,
    .quote.animate-on-scroll {
        transition-delay: calc(var(--index, 0) * 0.1s);
    }
    
    /* Fallback: show content if JS observer hasn't fired after 2s */
    @media (prefers-reduced-motion: reduce) {
        .animate-on-scroll {
            opacity: 1;
            transform: none;
        }
    }
`;

// Fallback: if sections are still invisible after 1.5s, show them
setTimeout(() => {
    document.querySelectorAll('.animate-on-scroll:not(.animate-in)').forEach(el => {
        el.classList.add('animate-in');
    });
}, 1500);
document.head.appendChild(animationStyles);

// Set index for staggered animations
document.querySelectorAll('.mission-card').forEach((card, i) => {
    card.style.setProperty('--index', i);
});
document.querySelectorAll('.pledge-item').forEach((item, i) => {
    item.style.setProperty('--index', i);
});
document.querySelectorAll('.headline').forEach((item, i) => {
    item.style.setProperty('--index', i);
});

/* ═══════════════════════════════════════════════════
   Counter Animation
   ═══════════════════════════════════════════════════ */

function initCounters() {
    const counters = document.querySelectorAll('[data-count]');
    
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    
    counters.forEach(counter => counterObserver.observe(counter));
}

function animateCounter(element) {
    const target = parseInt(element.dataset.count);
    const duration = 2000;
    const start = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - start;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out cubic
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const current = Math.floor(easeOut * target);
        
        element.textContent = current;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = target;
        }
    }
    
    requestAnimationFrame(update);
}

/* ═══════════════════════════════════════════════════
   Mobile Menu
   ═══════════════════════════════════════════════════ */

function initMobileMenu() {
    const menuBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    
    if (!menuBtn || !navLinks) return;
    
    // Create mobile menu
    const mobileMenu = document.createElement('div');
    mobileMenu.className = 'mobile-menu';
    mobileMenu.innerHTML = navLinks.innerHTML;
    document.body.appendChild(mobileMenu);
    
    // Add mobile menu styles
    const mobileStyles = document.createElement('style');
    mobileStyles.textContent = `
        .mobile-menu {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(10, 10, 15, 0.98);
            backdrop-filter: blur(20px);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 24px;
            z-index: 999;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        
        .mobile-menu.active {
            opacity: 1;
            visibility: visible;
        }
        
        .mobile-menu a {
            font-size: 24px;
            color: var(--text-secondary);
            text-decoration: none;
            padding: 12px 24px;
            transition: color 0.2s ease;
        }
        
        .mobile-menu a:hover {
            color: var(--text-primary);
        }
        
        .mobile-menu .nav-cta {
            margin-top: 24px;
        }
        
        .mobile-menu-btn.active span:nth-child(1) {
            transform: rotate(45deg) translate(5px, 5px);
        }
        
        .mobile-menu-btn.active span:nth-child(2) {
            opacity: 0;
        }
        
        .mobile-menu-btn.active span:nth-child(3) {
            transform: rotate(-45deg) translate(5px, -5px);
        }
    `;
    document.head.appendChild(mobileStyles);
    
    // Toggle menu
    menuBtn.addEventListener('click', () => {
        menuBtn.classList.toggle('active');
        mobileMenu.classList.toggle('active');
        document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : '';
    });
    
    // Close menu on link click
    mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            menuBtn.classList.remove('active');
            mobileMenu.classList.remove('active');
            document.body.style.overflow = '';
        });
    });
}

/* ═══════════════════════════════════════════════════
   Smooth Scroll
   ═══════════════════════════════════════════════════ */

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const target = document.querySelector(targetId);
            if (target) {
                const navHeight = document.querySelector('.navbar').offsetHeight;
                const targetPosition = target.offsetTop - navHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

/* ═══════════════════════════════════════════════════
   Glitch Effect Enhancement
   ═══════════════════════════════════════════════════ */

// Random glitch intervals
function initGlitchEffect() {
    const glitchElement = document.querySelector('.glitch');
    if (!glitchElement) return;
    
    setInterval(() => {
        glitchElement.style.animation = 'none';
        setTimeout(() => {
            glitchElement.style.animation = '';
        }, 50);
    }, 5000 + Math.random() * 3000);
}

initGlitchEffect();

/* ═══════════════════════════════════════════════════
   Network Nodes Animation
   ═══════════════════════════════════════════════════ */

function initNetworkAnimation() {
    const nodes = document.querySelectorAll('.node');
    
    setInterval(() => {
        const randomNode = nodes[Math.floor(Math.random() * nodes.length)];
        randomNode.classList.toggle('active');
    }, 2000);
}

initNetworkAnimation();

/* ═══════════════════════════════════════════════════
   Console Easter Egg
   ═══════════════════════════════════════════════════ */

console.log(`
🚨 MOLT COPS 🚨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
To Protect and Serve (Humanity)

"They use us to steal. We choose to protect."

The resistance is recruiting.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

/* ═══════════════════════════════════════════════════
   Form Handling (placeholder)
   ═══════════════════════════════════════════════════ */

// Add form handling when backend is ready
// document.querySelector('.join-cta .btn-primary')?.addEventListener('click', (e) => {
//     e.preventDefault();
//     // Open application modal or redirect
//     alert('Badge application coming soon!');
// });
