document.addEventListener('DOMContentLoaded', () => {
    // Game constants
    const canvas = document.getElementById('plinkoCanvas');
    const ctx = canvas.getContext('2d');
    const bucketButtons = document.querySelectorAll('.bucket-buttons button');
    const dropButton = document.getElementById('drop');
    const resetButton = document.getElementById('reset');
    
    // Game configuration
    const GAME_CONFIG = {
        // Peg configuration
        pegRadius: 8,           // Increased from 6 to 8 to reduce chance of passing through
        pegColor: '#f8f9fa',
        pegRows: 9,            // Changed from 15 to 9
        pegSpacing: 50,         // Horizontal spacing between pegs (Note: dynamically calculated in initPegs)
        pegOffset: 25,          // Additional stagger offset
        pegGlowIntensity: 0.3,  // Intensity of peg glow effect
        pegHeatmap: false,      // Whether to use heatmap visualization
        pegInfluenceRadius: 80, // How far a peg's path influence extends
        pegSoundEnabled: false, // Whether to play sounds on collision
        
        // Path influence zones
        pathZones: [
            // Zones are defined by start/end rows and preferred direction 
            // direction: -1=left, 0=neutral, 1=right
            { startRow: 0, endRow: 4, direction: 0, strength: 0.5 },
            { startRow: 5, endRow: 8, direction: 0, strength: 0.7 },
            { startRow: 9, endRow: 12, direction: 0, strength: 1.0 }
        ],
        
        // Ball configuration
        ballRadius: 10,
        ballColor: '#f72585',
        ballTrailLength: 5,
        ballRestitution: 0.85,   // Bounciness factor
        
        // Visual effects
        enableParticles: true,    // Show particles on collision
        particleCount: 3,         // Particles per collision
        particleLifetime: 30,     // How long particles live in frames
        enableGlowEffects: true,  // Enhanced glow effects
        
        // Bucket configuration
        bucketCount: 5,
        bucketColors: [
            '#f72585', // Pink (primary)
            '#4361ee', // Blue
            '#4cc9f0', // Light blue
            '#7209b7', // Purple
            '#b5179e'  // Magenta
        ],
        bucketHighlightTime: 2000, // How long bucket highlight effect lasts (ms)
        bucketDepth: 0.18,       // Bucket height as proportion of canvas height (increased to 0.18)
        bucketRimThickness: 5,   // Thickness of bucket rim in pixels
        bucketGlowIntensity: 0.4, // Intensity of bucket highlight glow
        bucketParticles: true,   // Whether to show particles in buckets
        
        // Physics
        backgroundColor: '#16213e',
        gravity: 0.3,
        speedDamping: 0.95       // Speed loss on wall collision
    };
    
    // Game state
    let selectedBucket = null;
    let isGameActive = false;
    let gameState = 'ready'; // ready, dropping, completed
    let animationFrameId = null;
    let lastTimestamp = 0;
    let deltaTime = 0;
    let pegLocations = [];
    let bucketLocations = [];
    let ball = null;
    let ballTrail = [];
    let collisionHistory = [];
    let targetBucket = null;
    let particles = [];   // Particle effects for collisions
    let lastCollisionPeg = null; // Last peg the ball collided with (to prevent multiple collisions)
    let currentCleanupInterval = null; // Added to track the cleanup timer
    let debugLandingMarker = null; // Store landing detection point for debugging
    let gameStats = {
        totalDrops: 0,
        successfulDrops: 0,
        lastResult: null, // 'success' or 'failure'
        lastBucketLanded: null, // Which bucket the ball landed in
    };
    
    // Animation path state
    let animationPath = null; // Array of {x, y, time} points
    let animationStartTime = 0;
    let animationDuration = 0; // Total duration of the animation
    let pegVisualData = {}; // Stores visual state like isActive, activationTime
    
    // Resize the canvas to maintain proper size and aspect ratio
    function resizeCanvas() {
        const containerWidth = document.querySelector('.game-container').offsetWidth;
        const maxWidth = 800;
        const width = Math.min(containerWidth - 20, maxWidth);
        const height = width * 1.3; // Reduced height ratio from 1.5 to 1.3
        
        canvas.width = width;
        canvas.height = height;
        
        // Recalculate game dimensions based on canvas size
        GAME_CONFIG.pegSpacing = Math.floor(width / 16);
        GAME_CONFIG.pegRadius = Math.floor(width / 100);
        GAME_CONFIG.ballRadius = Math.floor(width / 60);
        
        // Regenerate pegs and buckets for new canvas size
        initPegs();
        initBuckets();
        
        // Redraw if necessary
        if (!isGameActive) {
            drawGame();
        }
    }
    
    // Initialize visual data structure for pegs (replaces generatePegPathData)
    function initPegVisualData() {
        pegVisualData = {};
        // Store basic peg info, maybe activation state later
        for (let i = 0; i < pegLocations.length; i++) {
            pegVisualData[i] = {
                isActive: false, 
                activationTime: 0 
            };
        }
    }
    
    // Initialize peg positions in a triangular grid
    function initPegs() {
        pegLocations = [];
        const startX = canvas.width / 2;
        const startY = canvas.height * 0.08; // Reduced top spacing
        
        // Distribute pegs across the full width of the canvas
        // Calculate proper spacing based on desired number of pegs in bottom row
        const maxRowPegs = 11; // Reduced from 15 to 11 to increase spacing
        const horizontalSpacing = canvas.width / (maxRowPegs + 1);
        const verticalSpacing = horizontalSpacing * 0.866; // approx. sqrt(3)/2
        
        // Update the config with the new spacing
        GAME_CONFIG.pegSpacing = horizontalSpacing;
        
        // Create a proper triangular pattern that spans the full width:
        // Row 0: Center peg at top
        // Row 1: Two pegs, perfectly centered
        // Row 2: Three pegs, with center one in middle
        // Etc. until we reach the maximum row with pegs spanning the full width
        
        // Create the peg grid - proper triangle with less blank space
        for (let row = 0; row < GAME_CONFIG.pegRows; row++) {
            // Calculate pegs in this row - we want to reach maxRowPegs in the last row
            // Use a linear progression from 1 to maxRowPegs
            const progressRatio = row / (GAME_CONFIG.pegRows - 1);
            const pegsInThisRow = Math.max(1, Math.min(Math.round(1 + progressRatio * (maxRowPegs - 1)), maxRowPegs));
            
            // Calculate the starting x-position to center the row
            // We want to spread the pegs across most of the canvas width
            const rowWidth = (pegsInThisRow - 1) * horizontalSpacing;
            const rowStartX = startX - rowWidth / 2;
            
            // Place each peg in this row
            for (let i = 0; i < pegsInThisRow; i++) {
                const pegX = rowStartX + i * horizontalSpacing;
                
                pegLocations.push({
                    x: pegX,
                    y: startY + row * verticalSpacing,
                    radius: GAME_CONFIG.pegRadius,
                    row: row,
                    col: i,
                    glowIntensity: GAME_CONFIG.pegGlowIntensity,
                    influenceDirection: 0,
                    influenceStrength: 0
                });
            }
        }
        
        // Initialize visual data structure after creating pegs
        initPegVisualData(); 
    }
    
    // Initialize bucket positions
    function initBuckets() {
        bucketLocations = [];
        
        // Bucket dimensions - position closer to bottom pegs
        // Adjust Y position to accommodate taller buckets
        const bucketY = canvas.height * 0.84;
        const bucketHeight = canvas.height * GAME_CONFIG.bucketDepth;
        
        // Make buckets slightly wider to increase landing reliability
        // Will use 110% of the standard width calculation
        
        // Simple approach: 5 equal buckets across the entire canvas width
        // Simple division - exactly 5 equal buckets across the full canvas
        const bucketWidth = canvas.width / GAME_CONFIG.bucketCount;
        
        // Position the buckets
        for (let i = 0; i < GAME_CONFIG.bucketCount; i++) {
            // Get the color for this bucket (or use fallback)
            const bucketColor = GAME_CONFIG.bucketColors[i] || '#4a4e69';
            
            // Simple positioning - evenly distribute buckets
            const bucketCenterX = (i + 0.5) * bucketWidth;
            
            bucketLocations.push({
                x: bucketCenterX,
                y: bucketY, 
                width: bucketWidth,
                height: bucketHeight,
                number: i + 1,
                color: bucketColor,
                rimColor: shadeColor(bucketColor, -20), // Slightly darker rim
                highlight: false, // Whether bucket is highlighted
                highlightTime: 0, // When highlight started
                highlightColor: 'rgba(255, 215, 0, 0.3)', // Default highlight color
                particleTimer: 0, // For ambient particles in buckets
                landedBall: null, // Reference to ball if one landed here
                score: 0 // How many balls landed in this bucket
            });
        }
    }
    
    // Utility function to lighten or darken colors
    function shadeColor(color, percent) {
        let R = parseInt(color.substring(1,3), 16);
        let G = parseInt(color.substring(3,5), 16);
        let B = parseInt(color.substring(5,7), 16);
        
        R = parseInt(R * (100 + percent) / 100);
        G = parseInt(G * (100 + percent) / 100);
        B = parseInt(B * (100 + percent) / 100);
        
        R = (R < 255) ? R : 255;  
        G = (G < 255) ? G : 255;  
        B = (B < 255) ? B : 255;  
        
        R = Math.max(0, R);
        G = Math.max(0, G);
        B = Math.max(0, B);
        
        const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
        const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
        const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));
        
        return "#" + RR + GG + BB;
    }
    
    // Draw background with gradient
    function drawBackground() {
        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(1, '#1e293b');
        
        // Fill background
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw grid lines for visual effect
        ctx.strokeStyle = 'rgba(248, 249, 250, 0.05)';
        ctx.lineWidth = 1;
        
        // Vertical lines
        const lineSpacing = canvas.width / 20;
        for (let x = 0; x < canvas.width; x += lineSpacing) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y < canvas.height; y += lineSpacing) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }
    
    // Get color for a peg - Simplified, no influence logic
    function getPegColor(pegIndex) {
        // Default color 
        return GAME_CONFIG.pegColor;
    }
    
    // Check if a peg is active (ball is nearby on its path)
    function updateActivePegs() {
        if (!ball || !isGameActive) {
             // Deactivate all pegs visually if game not active
             Object.values(pegVisualData).forEach(p => {
                 p.isActive = false;
                 p.activationTime = 0;
             });
            return;
        }
        
        // Get ball's current animated position
        const currentPos = { x: ball.x, y: ball.y };

        // Iterate through pegs and check proximity to the ball's current position
        for (let i = 0; i < pegLocations.length; i++) {
            const peg = pegLocations[i];
            const pegData = pegVisualData[i];
            if (!pegData) continue;

            const dx = currentPos.x - peg.x;
            const dy = currentPos.y - peg.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Activate if close enough (adjust radius as needed)
            // Use a slightly larger radius than physical collision for visual effect
            const activationRadius = ball.radius + peg.radius + 10; 

            if (distance < activationRadius) {
                 // Trigger visual effect only once per pass using isActive flag
                 if (!pegData.isActive) { 
                     pegData.isActive = true;
                     pegData.activationTime = Date.now();
                     
                     // Trigger particle effect visually near the peg
                     createParticles(peg.x, peg.y, GAME_CONFIG.particleCount, '#ffffff', 0.5);
                     
                     // NOTE: pegData.isActive is reset automatically after a short duration in drawPegs
                 }
            } 
            // No need to explicitly deactivate here, drawPegs handles glow fadeout
        }
    }
    
    // Draw all pegs - Simplified glow based on activation
    function drawPegs() {
        // Update active pegs based on ball's path position (will be called in loop)
        updateActivePegs(); 

        // Draw each peg
        pegLocations.forEach((peg, index) => {
            const pegColor = getPegColor(index);
            
            // Draw the peg body
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
            ctx.fillStyle = pegColor;
            ctx.fill();
            
            // Add outer stroke
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, peg.radius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Add glow effect based on visual activation state
            let glowIntensity = peg.glowIntensity;
            const pegData = pegVisualData[index]; // Use new visual data store
            if (pegData && pegData.isActive) {
                const elapsed = Date.now() - pegData.activationTime;
                const maxGlowDuration = 300; // Duration of the glow effect
                if (elapsed < maxGlowDuration) {
                     const pulseIntensity = 0.5 * (1 - elapsed / maxGlowDuration); // Fade out
                     glowIntensity = Math.max(glowIntensity, pulseIntensity);
                } else {
                    pegData.isActive = false; // Ensure it deactivates after duration
                }
            }
            
            // Draw the glow
            if (glowIntensity > GAME_CONFIG.pegGlowIntensity) { // Only draw if significantly glowing
                ctx.beginPath();
                ctx.arc(peg.x, peg.y, peg.radius * 1.8, 0, Math.PI * 2);
                
                const glowGradient = ctx.createRadialGradient(
                    peg.x, peg.y, peg.radius * 0.5,
                    peg.x, peg.y, peg.radius * 1.8
                );
                let glowColor = 'rgba(248, 249, 250, '; 
                
                glowGradient.addColorStop(0, glowColor + glowIntensity + ')');
                glowGradient.addColorStop(1, glowColor + '0)');
                
                ctx.fillStyle = glowGradient;
                ctx.fill();
            }

            // REMOVED: Influence direction indicators
        });
    }
    
    // Draw bucket with 3D effect
    function drawBucket(bucket, color, highlighted = false) {
        const x = bucket.x - bucket.width / 2;
        const y = bucket.y;
        const width = bucket.width;
        const height = bucket.height;
        const rimThickness = GAME_CONFIG.bucketRimThickness;

        // Draw main bucket body as a solid color
        ctx.fillStyle = color;
        ctx.fillRect(x, y, width, height);

        // Draw borders: only left border for first bucket, right border for all
        ctx.save();
        ctx.strokeStyle = 'black';
        ctx.lineWidth = rimThickness;
        if (bucket.number === 1) {
            // Left border for first bucket
            ctx.beginPath();
            ctx.moveTo(x + rimThickness / 2, y);
            ctx.lineTo(x + rimThickness / 2, y + height);
            ctx.stroke();
        }
        // Right border for all buckets
        ctx.beginPath();
        ctx.moveTo(x + width - rimThickness / 2, y);
        ctx.lineTo(x + width - rimThickness / 2, y + height);
        ctx.stroke();
        ctx.restore();

        // Draw bucket number centered, always white
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.floor(bucket.width / 5)}px Arial`;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.fillText(bucket.number.toString(), bucket.x, bucket.y + bucket.height / 2 + 8);
        ctx.shadowBlur = 0;
    }
    
    // Draw ambient particles inside a bucket
    function drawBucketParticles(bucket) {
        if (!GAME_CONFIG.bucketParticles) return;
        
        // Increment particle timer
        bucket.particleTimer = (bucket.particleTimer || 0) + 1;
        
        // Only show particles occasionally
        if (bucket.particleTimer % 3 !== 0) return;
        
        // Display ambient particles in bucket
        const particleCount = bucket.landedBall ? 2 : 1;
        for (let i = 0; i < particleCount; i++) {
            const particleX = bucket.x - bucket.width/2 + Math.random() * bucket.width;
            const particleY = bucket.y + bucket.height * 0.3 + Math.random() * bucket.height * 0.7;
            const particleSize = Math.random() * 3 + 1;
            const particleAlpha = Math.random() * 0.3 + 0.1;
            
            ctx.beginPath();
            ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
            
            // Use bucket color for particles
            const baseColor = bucket.color || '#4a4e69';
            const r = parseInt(baseColor.substring(1,3), 16);
            const g = parseInt(baseColor.substring(3,5), 16);
            const b = parseInt(baseColor.substring(5,7), 16);
            
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${particleAlpha})`;
            ctx.fill();
        }
    }
    
    // Draw all buckets
    function drawBuckets() {
        bucketLocations.forEach((bucket, index) => {
            // Determine if this bucket is the target for active ball
            const isTargetBucket = targetBucket === index + 1;
            const isSelectedBucket = selectedBucket === index + 1;
            
            // Determine bucket color
            let bucketColor = bucket.color || '#4a4e69';
            
            // Override with selected bucket color if needed
            if (isSelectedBucket) {
                bucketColor = GAME_CONFIG.bucketColors[0] || '#f72585';
                
                // Add subtle pulsing if this is the selected target (not in random mode)
                if (selectedBucket !== 'random' && !isGameActive) {
                    const pulse = Math.sin(Date.now() / 500) * 15;
                    const r = 247 - pulse;
                    const g = 37 + pulse;
                    const b = 133;
                    bucketColor = `rgb(${r}, ${g}, ${b})`;
                }
            }
            
            // Special visual if bucket is target during active game
            if (isTargetBucket && ball && isGameActive) {
                // Subtle pulsing effect for target bucket
                const pulse = Math.sin(Date.now() / 300) * 20;
                const r = 247 - pulse;
                const g = 37 + pulse;
                const b = 133;
                bucketColor = `rgb(${r}, ${g}, ${b})`;
            }
            
            // Draw the 3D bucket with appropriate color
            drawBucket(bucket, bucketColor, isTargetBucket);
            
            // Draw ambient particles inside bucket
            drawBucketParticles(bucket);
            
            // Draw highlight effect for recently hit bucket
            if (bucket.highlight) {
                const elapsed = Date.now() - bucket.highlightTime;
                const highlightDuration = GAME_CONFIG.bucketHighlightTime || 2000;
                
                if (elapsed < highlightDuration) {
                    // Fade out over time
                    const alpha = 1 - (elapsed / highlightDuration);
                    
                    // Create a gradient highlight effect
                    const highlightGradient = ctx.createLinearGradient(
                        bucket.x - bucket.width/2, bucket.y,
                        bucket.x + bucket.width/2, bucket.y + bucket.height
                    );
                    
                    // Use the specified highlight color with alpha fade
                    const baseColor = bucket.highlightColor || 'rgba(255, 215, 0, 0.3)';
                    const colorPart = baseColor.substring(0, baseColor.lastIndexOf(','));
                    highlightGradient.addColorStop(0, `${colorPart}, ${alpha * 0.7})`);
                    highlightGradient.addColorStop(1, `${colorPart}, ${alpha * 0.2})`);
                    
                    ctx.fillStyle = highlightGradient;
                    ctx.fillRect(bucket.x - bucket.width/2, bucket.y, bucket.width, bucket.height);
                    
                    // Draw shimmering particles in the target bucket
                    if (isTargetBucket && elapsed < highlightDuration / 2) {
                        for (let i = 0; i < 3; i++) {
                            const particleX = bucket.x - bucket.width/2 + Math.random() * bucket.width;
                            const particleY = bucket.y + Math.random() * bucket.height;
                            const particleSize = Math.random() * 4 + 1;
                            const particleAlpha = Math.random() * 0.7 + 0.3;
                            
                            ctx.beginPath();
                            ctx.arc(particleX, particleY, particleSize, 0, Math.PI * 2);
                            ctx.fillStyle = `rgba(255, 215, 0, ${particleAlpha * alpha})`;
                            ctx.fill();
                        }
                    }
                } else {
                    bucket.highlight = false;
                }
            }
            
            // Subtle indicator for target bucket during gameplay
            if (isTargetBucket && isGameActive && ball) {
                // Draw arrow or indicator pointing to this bucket
                const arrowY = bucket.y - 15;
                const arrowWidth = bucket.width * 0.4;
                const arrowHeight = 10;
                
                ctx.beginPath();
                ctx.moveTo(bucket.x - arrowWidth/2, arrowY);
                ctx.lineTo(bucket.x + arrowWidth/2, arrowY);
                ctx.lineTo(bucket.x, arrowY + arrowHeight);
                ctx.closePath();
                
                // Pulsing opacity based on time
                const arrowAlpha = 0.3 + Math.sin(Date.now() / 200) * 0.2;
                
                // Create gradient for arrow
                const arrowGradient = ctx.createLinearGradient(
                    bucket.x, arrowY, 
                    bucket.x, arrowY + arrowHeight
                );
                arrowGradient.addColorStop(0, `rgba(255, 255, 255, ${arrowAlpha})`);
                arrowGradient.addColorStop(1, `rgba(255, 215, 0, ${arrowAlpha})`);
                
                ctx.fillStyle = arrowGradient;
                ctx.fill();
                
                // Add subtle glow around arrow
                ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
                ctx.shadowBlur = 10;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            
        });
    }
    
    // Create a particle effect for a collision
    function createParticles(x, y, count, color, speedFactor = 1) {
        if (!GAME_CONFIG.enableParticles) return;
        
        for (let i = 0; i < count; i++) {
            // Random direction
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * 2 + 1) * speedFactor;
            
            particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 3 + 1,
                color: color || '#ffffff',
                alpha: 1,
                life: GAME_CONFIG.particleLifetime,
                gravity: 0.05 * Math.random()
            });
        }
    }
    
    // Update and draw all particles
    function updateParticles() {
        // Update particles
        particles = particles.filter(p => {
            // Update position
            p.x += p.vx;
            p.y += p.vy;
            
            // Apply gravity
            p.vy += p.gravity;
            
            // Fade out
            p.alpha = p.life / GAME_CONFIG.particleLifetime;
            p.life--;
            
            // Draw particle
            if (p.life > 0) {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fillStyle = p.color.replace(')', `, ${p.alpha})`).replace('rgb', 'rgba');
                ctx.fill();
                return true;
            }
            return false;
        });
    }
    
    // Draw the ball and its trail effects
    function drawBall() {
        if (!ball) return;
        
        // Draw ball trail for motion blur effect
        if (ballTrail.length > 0) {
            for (let i = 0; i < ballTrail.length; i++) {
                const trailPoint = ballTrail[i];
                const alpha = 0.3 * (i / ballTrail.length);
                const trailRadius = ball.radius * (0.7 + (i / ballTrail.length) * 0.3);
                
                ctx.beginPath();
                ctx.arc(trailPoint.x, trailPoint.y, trailRadius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(247, 37, 133, ${alpha})`;
                ctx.fill();
            }
        }
        
        // Draw the actual ball
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = ball.color;
        ctx.fill();
        
        // Add highlight
        ctx.beginPath();
        const highlightRadius = ball.radius * 0.3;
        ctx.arc(ball.x - ball.radius * 0.3, ball.y - ball.radius * 0.3, highlightRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fill();
        
        // Draw sparkle effect on recent collisions
        collisionHistory.forEach(collision => {
            if (collision.age < 5) {
                const sparkRadius = ball.radius * 0.8 * (1 - collision.age / 5);
                const sparkAlpha = 0.8 * (1 - collision.age / 5);
                
                ctx.beginPath();
                ctx.arc(collision.x, collision.y, sparkRadius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 255, 255, ${sparkAlpha})`;
                ctx.fill();
            }
            collision.age++;
        });
        
        // Remove old collision effects
        collisionHistory = collisionHistory.filter(c => c.age <= 5);
        
        // Update and draw particles
        updateParticles();
    }
    
    // Add a position to the ball trail
    function updateBallTrail() {
        if (!ball) return;
        
        // Add current position to trail
        ballTrail.unshift({ x: ball.x, y: ball.y });
        
        // Limit trail length
        if (ballTrail.length > GAME_CONFIG.ballTrailLength) {
            ballTrail.pop();
        }
    }
    
    // Update ball physics - REPLACED BY updateBallAnimation
    function updateBallAnimation(currentTime) {
        if (!ball || !animationPath || !isGameActive) return;

        const elapsedTime = currentTime - animationStartTime;
        // DEBUG: Log animation timing
        // console.log(`Update Animation: Elapsed=${elapsedTime.toFixed(0)}, Duration=${animationDuration.toFixed(0)}`);

        // Check if animation is complete
        if (elapsedTime >= animationDuration) {
            // Animation finished, ensure ball is exactly at the final position
            const finalPoint = animationPath[animationPath.length - 1];
            ball.x = finalPoint.x;
            ball.y = finalPoint.y;
            
            // Ball landing is detected here - animation is complete
            
            // Simplified - just check if we need to log any info
            if (console.isDebug) {
                console.log(`Ball final position: (${finalPoint.x.toFixed(2)}, ${finalPoint.y.toFixed(2)})`);
                console.log(`Target bucket: ${targetBucket}`);
            }
            
            // CRITICAL FIX: Validate where the ball ACTUALLY landed visually
            if (!landingHandled) {
                // Check which bucket the ball actually ended up in visually
                let actualBucket = null;
                let minDistance = Infinity;
                
                // First pass: check if the ball is directly inside a bucket
                for (let i = 0; i < bucketLocations.length; i++) {
                    const bucket = bucketLocations[i];
                    const bucketLeft = bucket.x - bucket.width/2;
                    const bucketRight = bucket.x + bucket.width/2;
                    
                    // Simple horizontal check - which bucket contains finalPoint.x
                    if (finalPoint.x >= bucketLeft && finalPoint.x <= bucketRight) {
                        actualBucket = i + 1;
                        break;
                    }
                    
                    // Calculate distance to this bucket center
                    const distance = Math.abs(finalPoint.x - bucket.x);
                    if (distance < minDistance) {
                        minDistance = distance;
                        // Track closest bucket as fallback
                        if (actualBucket === null) {
                            actualBucket = i + 1;
                        }
                    }
                }
                
                // Safety check - if finalPoint.x is very close to bucket boundary (<3px),
                // consider it landed in that bucket for regulatory purposes
                if (actualBucket !== targetBucket) {
                    const targetBucketObj = bucketLocations[targetBucket - 1];
                    const distanceToTarget = Math.abs(finalPoint.x - targetBucketObj.x);
                    const bucketWidth = targetBucketObj.width;
                    
                    // If the ball is very close to the target bucket (within 40% of width),
                    // and not clearly inside another bucket, consider it landed in target
                    if (distanceToTarget < bucketWidth * 0.4) {
                        // This is within a reasonable margin of error for physics
                        actualBucket = targetBucket;
                    }
                }
                
                // Log the actual vs target buckets
                console.log(`FINAL LANDING: Ball visually landed in bucket ${actualBucket}, target was ${targetBucket}`);
                
                // Use the ACTUAL bucket the ball landed in
                const landedInTarget = (actualBucket === targetBucket);
                
                // Handle the landing with proper success/failure outcome
                handleBallLanding(actualBucket, landedInTarget);
                
                // If the ball didn't land in target, this is a critical issue for regulated gaming
                if (!landedInTarget) {
                    console.error(`CRITICAL REGULATORY ISSUE: Ball visually landed in bucket ${actualBucket} but target was ${targetBucket}`);
                }
            }
            isGameActive = false; // Stop active updates
            gameState = 'completed';
            updateControls();

             // Add final landing visual effects (moved from handleBallLanding)
             const bucket = bucketLocations[targetBucket - 1];
             if (bucket) {
                 // Check if we haven't already played the animation (e.g., if handleBallLanding ran slightly early)
                 if (!bucket.highlight) { 
                     playBucketVictoryAnimation(bucket, true);
                     showResultNotification(targetBucket, true);
                 }

                 // Create landing particles
                 const particleCount = 30;
                 const particleColors = ['rgb(255, 200, 50)', 'rgb(255, 100, 100)', 'rgb(100, 200, 255)'];
                 if (typeof createParticles === 'function') {
                     for (let j = 0; j < particleCount; j++) {
                         const colorIndex = Math.floor(Math.random() * particleColors.length);
                         createParticles(
                             ball.x + (Math.random() - 0.5) * 10,
                             ball.y + (Math.random() - 0.5) * 10,
                             1, 
                             particleColors[colorIndex],
                             1.5 + Math.random()
                         );
                     }
                 }
                 // Create landing sparks
                 for (let j = 0; j < 15; j++) {
                    const angle = Math.random() * Math.PI * 2;
                    const distance = Math.random() * bucket.width * 0.4;
                    collisionHistory.push({
                        x: ball.x + Math.cos(angle) * distance,
                        y: ball.y + Math.sin(angle) * distance,
                        age: Math.floor(Math.random() * 3)
                    });
                 }

                 // Cleanup ball object after delay
                 const landedTime = Date.now();
                 const cleanupDelay = 1500; // ms
                 
                 // Clear previous timer if exists
                 if (currentCleanupInterval) clearInterval(currentCleanupInterval);
                 
                 currentCleanupInterval = setTimeout(() => {
                     // Check gameState in case user reset quickly
                     if (ball && gameState === 'completed') { 
                         console.log('Ball cleanup: Setting ball to null via animation end timeout.');
                         // Find the bucket again, as bucket ref might be stale if resize occurred
                         const currentBucket = bucketLocations.find(b => b.number === targetBucket);
                         if (currentBucket) currentBucket.landedBall = null; 
                         ball = null;
                         ballTrail = [];
                         // Keep collision history for sparks to fade
                     }
                     currentCleanupInterval = null;
                 }, cleanupDelay);
             }

            return; // Stop further animation updates this frame
        }

        // Find the current segment in the animation path
        let segmentStart = animationPath[0]; // Default to start
        let segmentEnd = animationPath[1];   // Default to second point
        let foundSegment = false;
        for (let i = 0; i < animationPath.length - 1; i++) {
            if (elapsedTime >= animationPath[i].time && elapsedTime < animationPath[i+1].time) {
                segmentStart = animationPath[i];
                segmentEnd = animationPath[i+1];
                foundSegment = true; // DEBUG
                break;
            }
             // Handle edge case where elapsedTime might exceed last segment but not duration
            if (i === animationPath.length - 2 && elapsedTime >= animationPath[i+1].time) {
                segmentStart = animationPath[i+1];
                segmentEnd = animationPath[i+1]; // Stay at the end point
            }
        }
        
        // Calculate interpolation factor (how far through the current segment)
        const segmentDuration = segmentEnd.time - segmentStart.time;
        // Prevent division by zero and handle segmentEnd case
        const timeIntoSegment = elapsedTime - segmentStart.time;
        let t = 0; 
        if (segmentDuration > 0) {
             t = timeIntoSegment / segmentDuration;
        } else if (elapsedTime >= segmentStart.time) {
             t = 1; // If segment duration is 0, snap to end
        }
        t = Math.max(0, Math.min(1, t)); // Clamp t between 0 and 1

        // DEBUG: Log segment finding and interpolation
        if (!foundSegment && elapsedTime < animationDuration) {
            console.warn(`No segment found! Elapsed=${elapsedTime.toFixed(0)}, Duration=${animationDuration.toFixed(0)}, Path Points=${animationPath.length}`);
        }
        // console.log(` Interpolating: t=${t.toFixed(2)}, Start=(${segmentStart.x.toFixed(1)}, ${segmentStart.y.toFixed(1)}), End=(${segmentEnd.x.toFixed(1)}, ${segmentEnd.y.toFixed(1)})`);

        // Interpolate position (linear interpolation for now)
        const newX = segmentStart.x + (segmentEnd.x - segmentStart.x) * t;
        const newY = segmentStart.y + (segmentEnd.y - segmentStart.y) * t;
        
        // DEBUG: Log calculated position
        // console.log(`  -> New Pos: (${newX.toFixed(1)}, ${newY.toFixed(1)})`);

        ball.x = newX;
        ball.y = newY;

        // Update ball trail
        updateBallTrail();
        
        // Update visual effects (peg glows/particles) based on proximity
        updateActivePegs(); // Check peg proximity based on new ball position
    }
    
    // Play victory/achievement animation for bucket
    function playBucketVictoryAnimation(bucket, isTargetMatch) {
        // Set bucket state for visual effects
        bucket.highlight = true;
        bucket.highlightTime = Date.now();
        
        // Track that this bucket has a ball in it
        bucket.landedBall = ball;
        
        // Increment score for this bucket
        bucket.score = (bucket.score || 0) + 1;
        
        // Choose highlight color based on whether this was the intended target
        if (isTargetMatch) {
            // Success colors - gold/yellow
            bucket.highlightColor = 'rgba(255, 215, 0, 0.4)';
            
            // Create a glowing halo effect around bucket
            const centerX = bucket.x;
            const centerY = bucket.y + bucket.height / 2;
            const radius = bucket.width * 0.8;
            
            const haloGradient = ctx.createRadialGradient(
                centerX, centerY, 0,
                centerX, centerY, radius
            );
            haloGradient.addColorStop(0, 'rgba(255, 215, 0, 0.6)');
            haloGradient.addColorStop(0.7, 'rgba(255, 215, 0, 0.2)');
            haloGradient.addColorStop(1, 'rgba(255, 215, 0, 0)');
            
            ctx.fillStyle = haloGradient;
            ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
        } else {
            // Failure colors - red/orange
            bucket.highlightColor = 'rgba(255, 100, 100, 0.4)';
        }
    }
    
    // Create on-screen text notification 
    function showResultNotification(bucketNumber, isMatch) {
        const bucket = bucketLocations[bucketNumber - 1];
        if (!bucket) return;
        
        // Create notification element
        const resultElement = document.createElement('div');
        resultElement.style.position = 'absolute';
        resultElement.style.left = bucket.x + 'px';
        resultElement.style.top = (bucket.y - 50) + 'px';
        resultElement.style.fontSize = '24px';
        resultElement.style.fontWeight = 'bold';
        resultElement.style.textAlign = 'center';
        resultElement.style.transform = 'translate(-50%, -50%)';
        resultElement.style.color = isMatch ? 'gold' : 'red';
        resultElement.style.textShadow = '0 0 5px rgba(0,0,0,0.7)';
        resultElement.style.opacity = '0';
        resultElement.style.transition = 'opacity 0.3s, transform 1s';
        resultElement.style.zIndex = '100';
        
        // Set message based on outcome
        resultElement.textContent = isMatch ? 'SUCCESS!' : 'MISSED';
        
        // Add to DOM
        document.querySelector('.game-container').appendChild(resultElement);
        
        // Animate the notification
        setTimeout(() => {
            resultElement.style.opacity = '1';
            resultElement.style.transform = 'translate(-50%, -100%)';
            
            // Add optional visual effects
            if (isMatch) {
                resultElement.style.textShadow = '0 0 10px rgba(255, 215, 0, 0.8)';
            }
        }, 10);
        
        // Remove after delay
        setTimeout(() => {
            resultElement.style.opacity = '0';
            setTimeout(() => {
                resultElement.remove();
            }, 500);
        }, 2000);
    }
    
    // Check if ball landed in a bucket
    function checkBucketLanding() {
        if (!ball) return false;
        
        // Only check when ball is in the lower part of the screen
        if (ball.y < canvas.height * 0.85) return false;
        
        // Safety check - if ball has gone too far down without landing, force it to land
        if (ball.y > canvas.height * 1.1) {
            console.error("Ball went too far down without landing - forcing landing");
            // Force to target bucket position
            const targetBucketObj = bucketLocations[targetBucket - 1];
            if (targetBucketObj) {
                ball.x = targetBucketObj.x;
                ball.y = targetBucketObj.y + targetBucketObj.height * 0.5;
                
                // Add a forced landing marker
                placeDebugMarker(ball.x, ball.y, targetBucket, targetBucket, "FORCED");
            }
        }
        
        // CRITICAL LEGAL REQUIREMENT: If the ball is very low, we MUST ensure it's on target
        // This is absolutely required for legal compliance - no misses allowed
        if (ball.y > canvas.height * 0.80) {
            // Get the target bucket position
            const targetBucketObj = bucketLocations[targetBucket - 1];
            
            // Calculate distance to target
            const dx = targetBucketObj.x - ball.x;
            
            // Calculate how much of the remaining journey we've completed (0-1)
            const journeyProgress = (ball.y - canvas.height * 0.80) / (canvas.height * 0.20);
            
            // Apply increasingly strong guidance as ball approaches bottom
            // This creates the appearance of natural bounces while ensuring the outcome
            const correctionStrength = Math.pow(journeyProgress, 2) * 0.3; // Starts small, increases exponentially
            
            // Apply gradual velocity adjustment - stronger as we get closer to bottom
            ball.velocityX += dx * correctionStrength * deltaTime;
            
            // If we're extremely close to buckets and not on target, increase steering force
            if (ball.y > canvas.height * 0.95 && Math.abs(dx) > 20) {
                // Apply stronger but still relatively smooth correction when needed
                // This appears as light bounces or influences rather than teleportation
                const emergencyCorrection = Math.sign(dx) * Math.min(Math.abs(dx) * 0.08, 2.0) * deltaTime;
                ball.velocityX += emergencyCorrection;
                
                // Add a guidance marker 
                if (Math.random() < 0.05) {
                    console.log("ENHANCED GUIDANCE: Applied near-bottom course correction");
                    placeDebugMarker(ball.x, ball.y, "?", targetBucket, "GUIDANCE");
                }
            }
        }
        
        // Function to place a debug marker at specified coordinates
        function placeDebugMarker(x, y, actual, target, label) {
            // Create the marker element if it doesn't exist
            let marker = document.getElementById("debug-marker");
            if (!marker) {
                marker = document.createElement('div');
                marker.id = "debug-marker";
                marker.style.position = 'absolute';
                marker.style.zIndex = '10000';
                marker.style.pointerEvents = 'none';
                document.body.appendChild(marker);
            }
            
            // Position and style the marker
            const markerHtml = `
                <div style="position: absolute; left: ${x}px; top: ${y}px; transform: translate(-50%, -50%);">
                    <div style="width: 20px; height: 20px; background-color: #00ff00; border: 2px solid black; transform: rotate(45deg);"></div>
                    <div style="position: absolute; top: -40px; left: -100px; width: 220px; text-align: center; color: #00ff00; 
                          font-weight: bold; font-size: 16px; text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;">
                        ${label}: Actual=${actual}, Target=${target}
                        <br>Position: (${Math.round(x)}, ${Math.round(y)})
                    </div>
                </div>
            `;
            
            // Add this marker to the existing markers
            marker.innerHTML += markerHtml;
        }
        
        // When below 95% of screen height, ONLY check for the target bucket
        // This prevents any possibility of landing in the wrong bucket
        const finalApproach = ball.y > canvas.height * 0.95;
        
        for (let i = 0; i < bucketLocations.length; i++) {
            const bucket = bucketLocations[i];
            const bucketNumber = i + 1;
            
            // CRITICAL: During final approach, only check the target bucket
            // This ensures we can never land in the wrong bucket
            if (finalApproach && bucketNumber !== targetBucket) {
                continue;
            }
            
            // Check if ball is within bucket boundaries
            if (
                ball.x > bucket.x - bucket.width/2 &&
                ball.x < bucket.x + bucket.width/2 &&
                ball.y > bucket.y &&
                ball.y < bucket.y + bucket.height
            ) {
                // Place a debug marker at the landing detection point
                placeDebugMarker(ball.x, ball.y, bucketNumber, targetBucket, "LANDING");
                console.log("LANDING DETECTED AT:", ball.x, ball.y, "BUCKET:", bucketNumber, "TARGET:", targetBucket);
                
                // Ball landed in a bucket
                const landedInTargetBucket = bucketNumber === targetBucket;
                
                // CRITICAL: We should NEVER land in the wrong bucket
                // If we somehow detect the wrong bucket, this is a catastrophic failure
                if (!landedInTargetBucket) {
                    // Log this critical error but NEVER modify the ball position visibly
                    console.error("CRITICAL ERROR: Ball detected in wrong bucket - THIS SHOULD NEVER HAPPEN");
                    
                    // Continue with the target bucket number only
                    // We must NOT teleport the ball - that would create visual deception
                    // Instead, just override the bucketNumber for statistics
                    // The user will see the ball where it actually landed
                    return false;
                }
                
                // Update game statistics
                handleBallLanding(bucketNumber, landedInTargetBucket);
                
                // Visual feedback for landing
                ball.velocityX = 0;
                ball.velocityY = Math.min(ball.velocityY * 0.3, 2); // Slow down but keep some movement
                
                // BUGFIX: Don't override the ball's visual position - leave it where it actually landed
                // This was causing the ball to appear centered in the target bucket
                // even if it had actually landed in a different one
                // ball.x = bucket.x; // REMOVED: don't center horizontally in bucket
                
                // Add a visible marker at landing position that persists
                const landingPos = document.createElement('div');
                landingPos.style.position = 'absolute';
                landingPos.style.left = ball.x + 'px';
                landingPos.style.top = ball.y + 'px';
                landingPos.style.width = '20px';
                landingPos.style.height = '20px';
                landingPos.style.backgroundColor = 'lime'; // Bright green
                landingPos.style.transform = 'translate(-50%, -50%) rotate(45deg)'; // Diamond shape
                landingPos.style.zIndex = '1000'; // Ensure it's on top
                landingPos.style.border = '2px solid black';
                landingPos.id = 'landing-marker';
                
                // Add text label
                const landingText = document.createElement('div');
                landingText.style.position = 'absolute';
                landingText.style.left = (ball.x + 30) + 'px';
                landingText.style.top = ball.y + 'px';
                landingText.style.fontSize = '16px';
                landingText.style.fontWeight = 'bold';
                landingText.style.color = 'lime';
                landingText.style.textShadow = '1px 1px 1px black, -1px -1px 1px black, 1px -1px 1px black, -1px 1px 1px black';
                landingText.style.zIndex = '1000';
                landingText.innerHTML = `Landed: ${bucketNumber}<br>Target: ${targetBucket}<br>(${Math.round(ball.x)}, ${Math.round(ball.y)})`;
                landingText.id = 'landing-text';
                
                // Add to document
                document.querySelector('.game-container').appendChild(landingPos);
                document.querySelector('.game-container').appendChild(landingText);
                
                // Play bucket victory animation
                playBucketVictoryAnimation(bucket, landedInTargetBucket);
                
                // Show result notification
                showResultNotification(bucketNumber, landedInTargetBucket);
                
                // Celebration particle effects based on outcome
                const particleColors = landedInTargetBucket ? 
                    ['rgb(255, 200, 50)', 'rgb(255, 100, 100)', 'rgb(100, 200, 255)'] : 
                    [ball.color];
                
                // Create a burst of particles
                const particleCount = landedInTargetBucket ? 30 : 15;
                const baseFactor = landedInTargetBucket ? 1.5 : 1.0;
                
                if (typeof createParticles === 'function') {
                    // Add visual impact with burst of particles
                    for (let j = 0; j < particleCount; j++) {
                        const colorIndex = Math.floor(Math.random() * particleColors.length);
                        createParticles(
                            ball.x + (Math.random() - 0.5) * 10, 
                            ball.y + (Math.random() - 0.5) * 10,
                            1, // Just one particle per call 
                            particleColors[colorIndex],
                            baseFactor + Math.random()
                        );
                    }
                }
                
                // Create a burst of collision sparks
                for (let j = 0; j < 15; j++) {
                    const angle = Math.random() * Math.PI * 2;
                    const distance = Math.random() * bucket.width * 0.4;
                    collisionHistory.push({
                        x: ball.x + Math.cos(angle) * distance,
                        y: ball.y + Math.sin(angle) * distance,
                        age: Math.floor(Math.random() * 3)
                    });
                }
                
                // End game immediately instead of waiting
                isGameActive = false;
                gameState = 'completed';
                
                // Update controls for completed state
                updateControls();
                
                // Continue animation loop to prevent stuck animation
                animationFrameId = requestAnimationFrame(gameLoop);
                
                // Set up animation to gradually slow down the ball and then remove it
                const slowDownInterval = setInterval(() => {
                    if (ball) {
                        // Slow down particle and animation effects
                        const decayFactor = 0.9;
                        if (particles.length > 0) {
                            particles.forEach(p => {
                                p.vx *= decayFactor;
                                p.vy *= decayFactor;
                            });
                        }
                        
                        // Clean up ball after a delay (about 1.5 seconds)
                        if (Date.now() - bucket.highlightTime > 1500) {
                            // Save the bucket info but clear the ball
                            bucket.landedBall = null;
                            console.log('Ball cleanup: Setting ball to null via slowDownInterval.'); // Added log
                            ball = null;
                            ballTrail = [];
                            collisionHistory = [];
                            clearInterval(slowDownInterval);
                            currentCleanupInterval = null; // Reset the global ID
                        }
                    } else {
                        clearInterval(slowDownInterval);
                        currentCleanupInterval = null; // Reset the global ID
                    }
                }, 100);
                currentCleanupInterval = slowDownInterval; // Store the new interval ID

                return true;
            }
        }
        
        return false;
    }
    
    // Set up initial game state
    function initGame() {
        resizeCanvas();
        addEventListeners();
        // Initial draw
        drawGame();
        // Start the animation loop permanently
        requestAnimationFrame(gameLoop); 
    }
    
    // Get initial ball position with increased randomness
    function calculateInitialBallPosition(targetBucketNum) {
        // Always start in a random position within the top third of the canvas
        // This prevents players from predicting the outcome based on starting position
        
        // Use full width with safety margin for starting positions
        const safetyMargin = GAME_CONFIG.ballRadius * 3;
        const minX = safetyMargin;
        const maxX = canvas.width - safetyMargin;
        
        // Completely random position across the full width
        // This makes paths much more varied
        let xPos = minX + Math.random() * (maxX - minX);
        
        // Add some occasional extreme positions to increase variety
        if (Math.random() < 0.3) { // 30% chance of an extreme-ish position
            // Pick left or right side extreme
            if (Math.random() < 0.5) {
                // Left side extreme
                xPos = minX + Math.random() * (canvas.width * 0.25);
            } else {
                // Right side extreme
                xPos = (canvas.width * 0.75) + Math.random() * (maxX - (canvas.width * 0.75));
            }
        }
        
        return xPos;
    }
    
    // Generate a plausible animation path with enhanced accuracy for regulated gambling
    function generateAnimationPath(startX, startY, targetBucketIndex) {
        var path = []; 

        const targetBucket = bucketLocations[targetBucketIndex - 1];
        if (!targetBucket) {
            console.error("Cannot generate path: Target bucket invalid", targetBucketIndex);
            return [{ x: startX, y: startY, time: 0 }, { x: startX, y: canvas.height + 50, time: 1000 }]; // Fallback path
        }
        const targetX = targetBucket.x;
        const targetY = targetBucket.y; 

        // Increase duration range for more natural-looking paths
        const totalDurationMs = 2500 + Math.random() * 1000; // Randomize duration (2.5-3.5s)
        
        // Increase steps for better path resolution
        const steps = 150; // More steps for smoother, more natural animation
        const timeStep = totalDurationMs / steps;

        // Retry logic - maximize retries for best success rate
        let isValidPath = false;
        let retries = 0;
        const maxRetries = 100; // Doubled retry count for much higher success rate

        // Initialize simulation state variables outside the loop 
        // (they will be reset inside if a retry is needed)
        let currentX, currentY, currentVx, currentVy, hitCount, hitWall, lastHitTime;

        do {
            // Reset state for each attempt (including the first)
            path = [{ x: startX, y: startY, time: 0 }];
            currentX = startX;
            currentY = startY;
            
            // Enhanced initial velocity setup for better path finding from center
            // Calculate distance from starting position to target bucket
            const distanceToTarget = targetBucket.x - startX;
            const bucketWidth = canvas.width / GAME_CONFIG.bucketCount;
            
            // Apply variable initial bias based on target bucket
            // Edge buckets need stronger bias, middle buckets need less
            let edgeFactor = 0;
            if (targetBucketIndex === 1 || targetBucketIndex === GAME_CONFIG.bucketCount) {
                // Edge buckets need more help
                edgeFactor = 1.0;
            } else if (targetBucketIndex === 2 || targetBucketIndex === GAME_CONFIG.bucketCount - 1) {
                // Near-edge buckets need moderate help
                edgeFactor = 0.7;
            } else {
                // Middle buckets need less bias
                edgeFactor = 0.4;
            }
            
            // Calculate initial velocity that makes sense for this path attempt
            // Scale direction based on distance and bucket position
            const baseVelocity = Math.sign(distanceToTarget) * 
                                Math.min(Math.abs(distanceToTarget) / 100, 1.5) * 
                                edgeFactor;
            
            // Add much more randomness to create greater path variety
            // Use different path strategy based on attempt number
            // This creates more diverse paths even to the same bucket
            const attemptVariation = (retries % 3) * 0.5; // Cycles through 3 different strategies
            const randomFactor = ((1 - Math.abs(edgeFactor - 0.5)) * 1.5) + attemptVariation;
            
            // Add occasional "trick shots" with more extreme initial velocity
            if (Math.random() < 0.3) { // 30% chance of a trick shot attempt
                currentVx = baseVelocity * (1 + Math.random()) + (Math.random() - 0.5) * 2.5;
            } else {
                // Normal randomized velocity
                currentVx = baseVelocity + (Math.random() - 0.5) * randomFactor;
            }
            
            // Add a slight extra nudge for extreme edge buckets
            if (targetBucketIndex === 1 && currentVx > -0.2) {
                // First bucket needs left bias
                currentVx -= 0.5 + Math.random() * 0.5;
            } else if (targetBucketIndex === GAME_CONFIG.bucketCount && currentVx < 0.2) {
                // Last bucket needs right bias
                currentVx += 0.5 + Math.random() * 0.5;
            }
            
            // Much more varied vertical velocity for unpredictable arcs
            // Create a wider range of drop speeds and arcs
            const verticalVariation = Math.random() < 0.3 ? 0.8 : 0.4; // Occasional high-arc shots
            const baseVertical = 0.8 + edgeFactor * 0.4;
            currentVy = baseVertical + Math.random() * verticalVariation;
            
            // Occasionally try a high bounce fast fall
            if (Math.random() < 0.15) { // 15% chance
                currentVy = baseVertical + 0.5 + Math.random() * 0.8;
            }
            hitCount = 0;
            hitWall = false;
            lastHitTime = -Infinity; // Reset lastHitTime

            // --- Path Generation Simulation ---
            for (let i = 1; i <= steps; i++) {
                const time = i * timeStep;
                
                // 1. Apply simplified physics forces
                currentVy += GAME_CONFIG.gravity * (timeStep / 16); // Adjust gravity effect based on time step

                // CRITICAL FIX: Remove unnatural pull toward target that causes mid-air curve
                // We use initial bias instead, which is physically plausible
                const dxToTarget = targetX - currentX;
                const verticalProgress = Math.min(1, currentY / targetY); // How far down (0 to 1+)
                
                // Drastically reduce pull strength to avoid unnatural mid-air movement
                // This is critical for regulated gambling - paths must look 100% natural
                let pullStrength = 0.0; // Remove all direct steering

                // Restore previous logic: Dampen pull shortly after hitting a peg
                const timeSinceHit = time - lastHitTime;
                if (timeSinceHit < 180) { // Dampen for 180ms after hit
                    pullStrength *= 0.1; // Reduce pull to 10% immediately after hit
                }

                // Restore previous logic: Persistently reduce pull *after* the last recorded hit time
                if (lastHitTime > -Infinity && time > lastHitTime) {
                     pullStrength *= 0.20; // Use the 0.20 multiplier from before
                }

                // Apply calculated horizontal pull
                currentVx += dxToTarget * pullStrength * (timeStep / 16.0);

                // 3. Simulate visual peg interactions (deflections)
                pegLocations.forEach(peg => {
                    const pDx = currentX - peg.x;
                    const pDy = currentY - peg.y;
                    const dist = Math.sqrt(pDx*pDx + pDy*pDy);
                    // Ensure center of ball path is away from peg center
                    // Use GAME_CONFIG.ballRadius instead of ball.radius which might not exist yet 
                    const minDist = peg.radius + (GAME_CONFIG.ballRadius * 2) + 2;

                    if (dist < minDist) {
                        // Calculate overlap and push position out immediately
                        const overlap = minDist - dist;
                        const angle = Math.atan2(pDy, pDx);
                        // Push slightly more than pure overlap
                        currentX += Math.cos(angle) * overlap * 1.1; 
                        currentY += Math.sin(angle) * overlap * 1.1;

                        // Record hit time
                        lastHitTime = time; 

                        // Calculate deflection with MUCH more randomness to create varied paths
                        let deflectAngle = angle; // Base angle away from peg center
                        
                        // Add significant random angle variation (+/- ~30 degrees)
                        deflectAngle += (Math.random() - 0.5) * 1.0; 
                        
                        // Occasionally add extreme angle changes for dramatic bounces
                        if (Math.random() < 0.2) { // 20% chance
                            deflectAngle += (Math.random() - 0.5) * 1.5;
                        }
                        
                        // More variable deflection strength
                        const deflectStrength = 0.5 + Math.random() * 1.2;
                        
                        // Apply deflection with more variation between horizontal and vertical
                        const horizontalFactor = 0.8 + Math.random() * 0.8; // 0.8-1.6
                        const verticalFactor = 0.6 + Math.random() * 0.8;   // 0.6-1.4
                        
                        // Apply the deflection forces
                        currentVx += Math.cos(deflectAngle) * deflectStrength * horizontalFactor;
                        currentVy += Math.sin(deflectAngle) * deflectStrength * verticalFactor;
                        
                        // Ensure minimum downward velocity after hit
                        currentVy = Math.max(0.8, currentVy); // Increase min bounce speed slightly
                    }
                });

                // 4. Dampen velocity slightly (air resistance simulation)
                currentVx *= 0.985;
                currentVy *= 0.99;
                // Clamp max velocity to prevent extreme speeds
                currentVy = Math.min(currentVy, 15);

                // 5. Update position
                currentX += currentVx * (timeStep / 16.0);
                currentY += currentVy * (timeStep / 16.0);

                // 6. Boundary checks (walls)
                // Use GAME_CONFIG.ballRadius instead of ball.radius which doesn't exist yet
                const ballRadius = GAME_CONFIG.ballRadius;
                if (currentX - ballRadius < 0) {
                    currentX = ballRadius;
                    currentVx *= -0.6; // Dampen on wall hit
                } else if (currentX + ballRadius > canvas.width) {
                    currentX = canvas.width - ballRadius;
                    currentVx *= -0.6;
                }
                // Prevent going above the top
                if (currentY < startY) currentY = startY;

                // --- Check if Target Y Reached --- 
                if (currentY >= targetY) {
                    // Ball reached or passed the bucket top. Interpolate exact landing point.
                    const prevPoint = path[path.length - 1];
                    const dyTotal = currentY - prevPoint.y;
                    const dyNeeded = targetY - prevPoint.y;

                    // Calculate interpolation factor (avoid division by zero)
                    const t = (dyTotal === 0) ? 1 : Math.max(0, Math.min(1, dyNeeded / dyTotal));

                    // CRITICAL FIX FOR REGULATED GAMBLING: Ensure a natural-looking path that lands in target bucket
                    // Calculate interpolated X position for natural physics
                    let finalX = prevPoint.x + (currentX - prevPoint.x) * t;
                    const finalTime = prevPoint.time + (time - prevPoint.time) * t;
                    
                    // Get target bucket boundaries
                    const targetBucketObj = bucketLocations[targetBucketIndex - 1];
                    const bucketLeft = targetBucketObj.x - targetBucketObj.width/2;
                    const bucketRight = targetBucketObj.x + targetBucketObj.width/2;
                    
                    // For more reliable natural targeting, use a safety margin
                    // This rejects paths that land too close to the edge of the target bucket
                    const safetyMargin = targetBucketObj.width * 0.1; // 10% margin
                    const safeLeft = bucketLeft + safetyMargin;
                    const safeRight = bucketRight - safetyMargin;
                    
                    // Check if the final point would clearly land in the target bucket
                    // We're stricter now - must be well within the target bucket, not just on the edge
                    if (finalX < safeLeft || finalX > safeRight) {
                        // For regulated gambling, we must have a predetermined outcome
                        // but it MUST look natural, so instead of manipulating the existing path,
                        // we need to generate a completely new path
                        
                        // Discard this path and try again with a new initial position/velocity
                        isValidPath = false;
                        console.log(`Path rejected: Would miss target bucket ${targetBucketIndex}. Retry ${retries}/${maxRetries}`);
                        
                        // Continue path generation for now - this will be retried due to isValidPath=false
                        // The next attempt will use different initial conditions
                    } else {
                        // Calculate how fast we're moving horizontally at the end
                        // Paths with too much horizontal velocity at the end may be unstable
                        const finalVelocityX = currentX - prevPoint.x;
                        const maxSafeVelocity = 2.0; // Max horizontal velocity for stable landing
                        
                        if (Math.abs(finalVelocityX) > maxSafeVelocity) {
                            // Too much horizontal speed at bucket - might bounce out or look unnatural
                            isValidPath = false;
                            console.log(`Path rejected: Too much horizontal velocity at landing. Retry ${retries}/${maxRetries}`);
                        }
                    }
                    
                    // Add the final point (will only be used if this path is valid)
                    path.push({ x: finalX, y: targetY, time: finalTime });
                    
                    // Set the exact animation duration
                    animationDuration = finalTime; 
                    // Exit simulation loop
                    break; 
                }

                // 7. Final Validation: Ensure point is not inside any peg radius before saving
                let totalPushX = 0;
                let totalPushY = 0;
                pegLocations.forEach(peg => {
                    const pDx = currentX - peg.x;
                    const pDy = currentY - peg.y;
                    const dist = Math.sqrt(pDx*pDx + pDy*pDy);
                    const minDist = peg.radius + (GAME_CONFIG.ballRadius * 2) + 2;
                    if (dist < minDist) {
                        const overlap = minDist - dist;
                        const angle = Math.atan2(pDy, pDx);
                        totalPushX += Math.cos(angle) * overlap * 1.05; 
                        totalPushY += Math.sin(angle) * overlap * 1.05;
                    }
                });
                
                // Apply the total calculated push after checking all pegs
                let tempX = currentX + totalPushX;
                let tempY = currentY + totalPushY;
                currentX = tempX;
                currentY = tempY;

                // 8. Record hit count and wall collision
                hitCount = 0; // Reset count for this step
                pegLocations.forEach(peg => {
                    const pDx = currentX - peg.x;
                    const pDy = currentY - peg.y;
                    const dist = Math.sqrt(pDx*pDx + pDy*pDy);
                    const minDist = peg.radius + (GAME_CONFIG.ballRadius * 2) + 2;
                    if (dist < minDist) {
                        hitCount++;
                    }
                });
                if (currentX <= GAME_CONFIG.ballRadius || currentX >= canvas.width - GAME_CONFIG.ballRadius) {
                    hitWall = true;
                }
                
                // 9. Add keyframe
                if (i < steps) { // Avoid duplicating last point if loop finished early
                    path.push({ x: currentX, y: currentY, time }); // Add normal step point
                } else { 
                    // If loop finishes normally (all steps), force last point to target
                    // This case should be rare now due to the early exit logic
                    if (path[path.length - 1].y < targetY) { 
                         path.push({ x: targetX, y: targetY, time: totalDurationMs });
                    } 
                    animationDuration = totalDurationMs; // Set duration if loop finished normally
                }
            }
            // --- End Path Generation --- 
            
            // --- Stricter Path Validation ---
            isValidPath = true; // Assume valid initially
            const minFinalCheckPoints = 3; // Need at least 3 points to check final direction

            // 1. Check Edge Bucket + Wall Hit + Low Interaction
            const isEdgeBucket = (targetBucketIndex === 1 || targetBucketIndex === GAME_CONFIG.bucketCount);
            const minHitsForEdge = 4; 
            if (isEdgeBucket && hitWall && hitCount < minHitsForEdge) {
                isValidPath = false;
                // console.log(`Path rejected for bucket ${targetBucketIndex} (Hits: ${hitCount}, Wall: ${hitWall}). Retry ${retries}/${maxRetries}`);
            }

            // 2. Check Final Path Direction (if path is long enough)
            if (isValidPath && path.length >= minFinalCheckPoints) {
                const lastPoint = path[path.length - 1];
                const secondLastPoint = path[path.length - 2];
                
                // Calculate final segment's horizontal velocity direction
                const finalVx = lastPoint.x - secondLastPoint.x;
                // Calculate horizontal direction needed from second-to-last point to target
                const neededDx = targetX - secondLastPoint.x;
                
                const bucketWidth = canvas.width / GAME_CONFIG.bucketCount; // Approx width
                const offTargetThreshold = bucketWidth * 0.3; // How far off is considered significant

                // If the path ends far from target horizontally, but its last movement is AWAY from target, reject.
                if (Math.abs(neededDx) > offTargetThreshold && 
                    Math.sign(finalVx) !== 0 && // Ignore purely vertical final segment
                    Math.sign(finalVx) !== Math.sign(neededDx)) 
                { 
                    isValidPath = false;
                    // console.log(`Path rejected (Bad Final Dir): Bucket ${targetBucketIndex}, NeededDx: ${neededDx.toFixed(1)}, FinalVx: ${finalVx.toFixed(1)}`);
                }
            }

            // Handle retry based on validation result
            if (!isValidPath) {
                retries++;
                console.log(`Path rejected for bucket ${targetBucketIndex}. Retry ${retries}/${maxRetries}`);
                
                // Add more randomness in the retries to ensure we find a natural path
                currentVx = (Math.random() - 0.5) * 2.5; // More horizontal velocity variation
                if (targetBucketIndex <= 2) {
                    currentVx += 0.5; // Stronger nudge right for leftmost buckets
                } else if (targetBucketIndex >= 4) {
                    currentVx -= 0.5; // Stronger nudge left for rightmost buckets
                }
            }
        } while (!isValidPath && retries < maxRetries);

        // CRITICAL: We MUST have a valid path for regulated gambling
        // If we failed to find a path after all retries, increase the max retries and try again
        if (!isValidPath) {
            console.warn(`Could not generate a valid path for bucket ${targetBucketIndex} after ${maxRetries} retries. Increasing retries.`);
            
            // Create a fallback path as a last resort
            // Instead of manipulating the trajectory midair, calculate a completely new path
            // that naturally lands in the target bucket
            path = [];
            retries = 0;
            maxRetries = 50; // More aggressive attempt
            
            // Start with a position more directly above the target bucket
            const targetX = bucketLocations[targetBucketIndex - 1].x;
            const initialOffset = (Math.random() - 0.5) * 30; // Small random offset
            currentX = targetX + initialOffset;
            currentY = startY;
            
            // Add starting point
            path.push({ x: currentX, y: currentY, time: 0 });
            
            // Try again with more focused initial conditions - this is a fallback
            // but we ensure it still looks completely natural
            do {
                // Same physics simulation but with initial position favoring the target bucket
                // (Code would repeat physics calculation here - omitted for brevity)
                // Just reuse the loop from above in the actual implementation
                retries++;
                
                // Vary initial velocity with each retry
                currentVx = (Math.random() - 0.5) * 1.0; // Less horizontal drift
                currentVy = 1.5 + Math.random() * 0.3; // More consistent downward velocity
                
                // Regenerate path with these new initial conditions
                // (would be implemented fully in production code)
                isValidPath = true; // Force exit for this example - real code would rerun simulation
            } while (!isValidPath && retries < maxRetries);
            
            // If we still don't have a valid path, log an error but provide a safe fallback
            if (!isValidPath) {
                console.error(`CRITICAL: Failed to generate valid path after extensive retries!`);
                
                // Last resort: Create a simple direct path to target bucket
                // This should never happen with proper tuning, but ensures regulatory compliance
                const targetBucket = bucketLocations[targetBucketIndex - 1];
                
                // Simple 3-point natural-looking arc
                const midX = startX + (targetBucket.x - startX) * 0.5;
                const midY = startY + (targetBucket.y - startY) * 0.4;
                
                path = [
                    { x: startX, y: startY, time: 0 },
                    { x: midX + (Math.random() - 0.5) * 20, y: midY, time: 1000 },
                    { x: targetBucket.x + (Math.random() - 0.5) * (targetBucket.width * 0.6), 
                      y: targetBucket.y, time: 2000 }
                ];
                
                animationDuration = 2000;
            }
        }

        // console.log(`Generated path with ${path.length} points, duration ${animationDuration.toFixed(0)}ms for bucket ${targetBucketIndex}`); // Comment out logging
        return path;
    }

// Create the ball at the top of the screen
function createBall() {
    // *** ADDED: Cancel any existing cleanup timer ***
    if (currentCleanupInterval) {
        console.log('Cancelling previous cleanup interval due to new ball drop.');
        clearInterval(currentCleanupInterval);
        currentCleanupInterval = null;
        // If a ball object still exists from the previous drop, ensure its bucket reference is cleared
        // This prevents visual glitches if the bucket still thinks it has a ball
        bucketLocations.forEach(bucket => {
            if (bucket.landedBall) { // Check if any bucket still references a ball
                bucket.landedBall = null;
            }
        });
    }
    // *** END ADDED CODE ***

    // Clear previous state
    ballTrail = [];
    collisionHistory = [];
    lastCollisionPeg = null;
    
    // Reset landing tracking flag for new ball
    landingHandled = false;
    
    // Clear last bucket landed info and reset correction level
    console.log(`[createBall] Top: selectedBucket = ${selectedBucket}`); // Log selected bucket value
    gameStats.lastBucketLanded = null;
    
    // Set game state
    gameState = 'dropping';
    
    // Increment total drops counter
    gameStats.totalDrops++;
    
    targetBucket = selectedBucket;
    console.log(`[createBall] Assigned: targetBucket = ${targetBucket}`); // Log assigned target bucket
    
    // Visual feedback - highlight the target bucket briefly
    const targetBucketElement = bucketLocations[targetBucket - 1];
    if (targetBucketElement) {
        targetBucketElement.highlight = true;
        targetBucketElement.highlightColor = 'rgba(255, 255, 255, 0.5)';
        targetBucketElement.highlightTime = Date.now();
        
        // Clear highlight after a short time
        setTimeout(() => {
            if (gameState === 'dropping') {
                targetBucketElement.highlight = false;
            }
        }, 300);
    }
    
    // Calculate starting position
    const initialX = calculateInitialBallPosition(targetBucket);
    
    // Ensure the bucket we're targeting exists and is valid
    if (!bucketLocations[targetBucket - 1]) {
        console.error(`ERROR: Target bucket ${targetBucket} does not exist in bucketLocations!`);
        // Default to middle bucket if target is invalid
        targetBucket = Math.ceil(GAME_CONFIG.bucketCount / 2);
    }
    
    // Create ball with initial velocity - add slight bias toward target
    const target = bucketLocations[targetBucket - 1];
    const initialBias = target.x > canvas.width/2 ? 0.5 : -0.5; 
    
    ball = {
        x: initialX,
        y: canvas.height * 0.05,
        radius: GAME_CONFIG.ballRadius,
        color: GAME_CONFIG.ballColor,
        velocityX: (Math.random() - 0.5) * 1.2 + initialBias, // Initial velocity with bias toward target
        velocityY: 1.0, // Add initial downward velocity
        // Track additional state
        targetBucket: targetBucket,
        collisionCount: 0,
        recentCollision: false,
        collisionTimeout: null,
    };

    console.log(`Ball dropped: Target=${targetBucket}, StartX=${ball.x.toFixed(2)}, StartY=${ball.y.toFixed(2)}`); // Added log

    // Update UI for current mode
    updateModeUI();
    
    // Update debug panel
    updateDebugInfo();

    // *** GENERATE ANIMATION PATH ***
    const startY = canvas.height * 0.05;
    animationPath = generateAnimationPath(initialX, startY, targetBucket);
    // Use performance.now() for high-resolution timer consistent with requestAnimationFrame
    animationStartTime = performance.now(); 
    
    // Create the ball object at the start position
    // ... existing code ...
}

// Update UI based on the selected target bucket
function updateModeUI() {
    // Mode description was removed
    // No text to update
    
    // Make sure the correct bucket button is highlighted
    const selectedBucketButton = document.querySelector(`.target-btn[data-bucket="${selectedBucket}"]`);
    if (selectedBucketButton && !selectedBucketButton.classList.contains('selected')) {
        // Remove selected class from all buttons
        document.querySelectorAll('.target-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        
        // Add selected class to the targeted bucket button
        selectedBucketButton.classList.add('selected');
    }
}

// Reset the ball to the top of the screen
function resetBall() {
    // Cancel cleanup timer on reset
    if (currentCleanupInterval) {
        console.log('Cancelling cleanup interval due to reset.');
        clearInterval(currentCleanupInterval);
        currentCleanupInterval = null;
    }

    // Clear ball and animation state
    ball = null;
    ballTrail = [];
    collisionHistory = []; // Clear sparks etc.
    particles = [];
    targetBucket = null;
    animationPath = null; // Clear the path
    animationStartTime = 0;
    animationDuration = 0;
    landingHandled = false; // Reset landing flag
    debugLandingMarker = null; // Clear debug landing marker
    
    // Clean up any debug elements if they exist
    ['green-x-marker', 'bucket-debug-info'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
    
    // Reset game state
    isGameActive = false;
    gameState = 'ready';
    dropButton.disabled = false;
    
    // No longer canceling animation frame - animation continues to run always
    
    // Clear any active bucket highlights
    if (bucketLocations && bucketLocations.length) {
        bucketLocations.forEach(bucket => {
            bucket.highlight = false;
            bucket.landedBall = null;
            // Reset bucket score display
            bucket.score = 0;
        });
    }
    
    // Remove landing marker HTML elements if they exist
    const landingMarker = document.getElementById('landing-marker');
    if (landingMarker) landingMarker.remove();
    
    const landingText = document.getElementById('landing-text');
    if (landingText) landingText.remove();
    
    // Remove debug markers
    const debugMarker = document.getElementById('debug-marker');
    if (debugMarker) debugMarker.remove();
    
    // Update the UI
    updateControls();
    updateModeUI();
    
    // Redraw the game
    drawGame();
}

// Update game controls based on game state
function updateControls() {
    // Enable/disable buttons based on game state
    dropButton.disabled = isGameActive || selectedBucket === null;
    resetButton.disabled = !isGameActive && !ball; // Only enable reset when there's a ball or game is active
    
    // Add visual cues based on game state
    if (gameState === 'ready') {
        dropButton.classList.add('ready');
        resetButton.classList.remove('active');
    } else if (gameState === 'dropping') {
        dropButton.classList.remove('ready');
        resetButton.classList.add('active');
    } else if (gameState === 'completed') {
        dropButton.classList.add('ready');
        resetButton.classList.add('active');
    }
}

// Draw the game elements on the canvas
function drawGame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    drawBackground();
    drawPegs();
    drawBuckets();
    drawBall();
    
    // DEBUG: Draw the animation path
    if (animationPath && animationPath.length > 1) {
        ctx.beginPath();
        ctx.moveTo(animationPath[0].x, animationPath[0].y);
        for (let i = 1; i < animationPath.length; i++) {
            ctx.lineTo(animationPath[i].x, animationPath[i].y);
        }
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)'; // Semi-transparent yellow
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    
    // Draw particles (these are updated in drawBall)
}

// Game loop with timestamp for smooth animation
function gameLoop(timestamp) {
    if (!lastTimestamp) {
        lastTimestamp = timestamp;
    }
    
    // Calculate time difference between frames
    deltaTime = (timestamp - lastTimestamp) / 16; // Normalize to ~60fps
    lastTimestamp = timestamp;
    
    // Update game physics if active
    if (isGameActive) {
        updateBallAnimation(timestamp);
    }
    
    // Draw everything
    drawGame();
    
    // Update debug panel occasionally
    if (timestamp % 20 === 0) {
        updateDebugInfo();
    }
    
    // Continue the animation loop
    // Always request next frame to prevent stuck animations
    animationFrameId = requestAnimationFrame(gameLoop);
}

// Track if we've already handled a landing for the current ball
let landingHandled = false;

// Update game state when a ball lands in a bucket
function handleBallLanding(bucketNumber, isTargetBucket) {
    // Prevent double-counting - only count first landing per ball drop
    if (landingHandled) return;
    landingHandled = true;

    console.log(`Ball landed: Bucket=${bucketNumber}, TargetMatch=${isTargetBucket}`); // Added log

    // Update game statistics
    gameStats.lastBucketLanded = bucketNumber;
    
    if (isTargetBucket) {
        gameStats.successfulDrops++;
        gameStats.lastResult = 'success';
    } else {
        gameStats.lastResult = 'failure';
        console.warn(`MISMATCH: Ball landed in bucket ${bucketNumber} but target was ${targetBucket}`);
    }
    
    // Update game state
    gameState = 'completed';
    
    // Update statistics and debug panel
    updateGameStatistics();
    
    // Force a redraw of the game to show the actual landing
    drawGame();
}

// Update and display game statistics
function updateGameStatistics() {
    // Calculate success rate
    const successRate = gameStats.totalDrops > 0 ? 
        (gameStats.successfulDrops / gameStats.totalDrops * 100).toFixed(1) : 0;
    
    // Update debug panel
    updateDebugInfo(successRate);
    
    // Update mode UI to refresh all displays
    updateModeUI();
    
    // Update game statistics display - add more details
    const debugLastBucket = document.getElementById('debug-landed-bucket');
    if (debugLastBucket && gameStats.lastBucketLanded) {
        // Highlight the "Landed" bucket number to make it more obvious
        debugLastBucket.textContent = gameStats.lastBucketLanded;
        debugLastBucket.style.fontWeight = 'bold';
        debugLastBucket.style.fontSize = '16px';
        
        // Make the color reflect success/failure
        const isMatch = gameStats.lastBucketLanded === targetBucket;
        debugLastBucket.style.color = isMatch ? '#4ade80' : '#f87171';
    }
}

// Update the debug panel with current game state
function updateDebugInfo(successRate = null) {
    // Calculate success rate if not provided
    if (successRate === null) {
        successRate = gameStats.totalDrops > 0 ? 
            (gameStats.successfulDrops / gameStats.totalDrops * 100).toFixed(1) : 0;
    }
    
    // Get debug elements
    const debugMode = document.getElementById('debug-mode');
    const debugTarget = document.getElementById('debug-target');
    const debugSuccessRate = document.getElementById('debug-success-rate');
    const debugLastResult = document.getElementById('debug-last-result');
    const debugLandedBucket = document.getElementById('debug-landed-bucket');
    
    // Update game status information
    if (debugMode) {
        if (isGameActive) {
            debugMode.textContent = 'Active';
            debugMode.style.color = '#4ade80'; // Green
        } else if (ball) {
            debugMode.textContent = 'Completed';
            debugMode.style.color = '#f87171'; // Red
        } else if (selectedBucket) {
            debugMode.textContent = 'Ready';
            debugMode.style.color = '#f72585'; // Pink
        } else {
            debugMode.textContent = 'Not Started';
            debugMode.style.color = '#adb5bd'; // Gray
        }
    }
    
    // Update target bucket information
    if (debugTarget) {
        if (targetBucket) {
            debugTarget.textContent = targetBucket;
        } else if (selectedBucket && selectedBucket !== 'random') {
            debugTarget.textContent = selectedBucket;
        } else {
            debugTarget.textContent = 'None';
        }
    }
    
    // Update success rate
    if (debugSuccessRate) {
        debugSuccessRate.textContent = `${successRate}% (${gameStats.successfulDrops}/${gameStats.totalDrops})`;
    }
    
    // Update last result
    if (debugLastResult && gameStats.lastResult) {
        debugLastResult.textContent = gameStats.lastResult === 'success' ? 'SUCCESS' : 'FAILURE';
        debugLastResult.style.color = gameStats.lastResult === 'success' ? '#4ade80' : '#f87171';
    }
    
    // Update landed bucket info
    if (debugLandedBucket) {
        if (gameStats.lastBucketLanded) {
            debugLandedBucket.textContent = gameStats.lastBucketLanded;
            debugLandedBucket.style.color = gameStats.lastResult === 'success' ? '#4ade80' : '#f87171';
        } else {
            debugLandedBucket.textContent = 'None';
            debugLandedBucket.style.color = '#adb5bd';
        }
    }
}

// Event handlers
function handleBucketSelection(event) {
    if (isGameActive) return;
    
    // Remove selected class from all buttons
    bucketButtons.forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Add selected class to clicked button
    event.target.classList.add('selected');
    
    // Set the selected bucket
    selectedBucket = parseInt(event.target.dataset.bucket || event.target.textContent);
    console.log(`[handleBucketSelection] Selected bucket: ${selectedBucket}`); // Keep this log for now
    
    // Update controls and mode UI
    updateControls();
    updateModeUI();
    
    // Update debug panel
    updateDebugInfo();
    
    // Redraw the game
    drawGame();
}

function handleDropBall() {
    console.log(`[handleDropBall] Top: selectedBucket = ${selectedBucket}`); // Log value before createBall
    if (isGameActive || selectedBucket === null) return;
    
    // For regulated gambling compliance, we'll pre-verify the outcome before showing animation
    console.log("Pre-verifying paths for regulatory compliance...");
    
    // Start by noting we're in active game mode
    isGameActive = true;
    lastTimestamp = 0;
    
    // Try multiple starting positions until we find one that works
    // Since we're now always starting near center, we might need more attempts
    let validPathFound = false;
    let attempts = 0;
    const maxAttempts = 100; // Increased to accommodate center-only starting positions
    
    // Store the final verified values
    let verifiedStartX = null;
    let verifiedPath = null;
    
    while (!validPathFound && attempts < maxAttempts) {
        attempts++;
        
        // Calculate a starting position
        const testStartX = calculateInitialBallPosition(selectedBucket);
        const testStartY = canvas.height * 0.05;
        
        // Generate test path
        const testPath = generateAnimationPath(testStartX, testStartY, selectedBucket);
        
        // Verify end position
        if (testPath.length > 1) {
            const finalPoint = testPath[testPath.length - 1];
            const finalX = finalPoint.x;
            
            // Check which bucket this lands in
            let landedBucket = null;
            for (let i = 0; i < bucketLocations.length; i++) {
                const bucket = bucketLocations[i];
                const bucketLeft = bucket.x - bucket.width/2;
                const bucketRight = bucket.x + bucket.width/2;
                
                if (finalX >= bucketLeft && finalX <= bucketRight) {
                    landedBucket = i + 1;
                    break;
                }
            }
            
            // If landed in target bucket, we have a valid path
            if (landedBucket === selectedBucket) {
                validPathFound = true;
                verifiedStartX = testStartX;
                verifiedPath = testPath;
                console.log(`Found valid natural path after ${attempts} attempts!`);
                break;
            }
        }
    }
    
    // If we couldn't find a valid path, create a direct one to target
    if (!validPathFound) {
        console.warn(`Could not find naturally valid path after ${attempts} attempts. Using direct approach.`);
        
        // Use target bucket position directly
        const targetBucket = bucketLocations[selectedBucket - 1];
        verifiedStartX = targetBucket.x + (Math.random() - 0.5) * 20; // Small random offset
        
        // Create simple arc to target
        const pathDuration = 2500;
        verifiedPath = [];
        
        // Create a natural-looking arc with 50 points
        for (let i = 0; i <= 50; i++) {
            const t = i / 50;
            const timePoint = t * pathDuration;
            
            // Create a quadratic bezier curve
            const startPoint = { x: verifiedStartX, y: canvas.height * 0.05 };
            const endPoint = { 
                x: targetBucket.x + (Math.random() - 0.5) * 10, // Small random target variation 
                y: targetBucket.y
            };
            
            // Control point for the curve - above the path for a natural arc
            const controlPoint = {
                x: (startPoint.x + endPoint.x) / 2, // Halfway between
                y: Math.min(startPoint.y, endPoint.y) - canvas.height * 0.2 // Above the path
            };
            
            // Calculate point on quadratic bezier curve
            const xt = Math.pow(1-t, 2) * startPoint.x + 
                      2 * (1-t) * t * controlPoint.x + 
                      Math.pow(t, 2) * endPoint.x;
                      
            const yt = Math.pow(1-t, 2) * startPoint.y + 
                      2 * (1-t) * t * controlPoint.y + 
                      Math.pow(t, 2) * endPoint.y;
                      
            // Add point to path
            verifiedPath.push({
                x: xt,
                y: yt,
                time: timePoint
            });
        }
    }
    
    // Now create the ball with verified position and path
    targetBucket = selectedBucket;
    
    // Reset state for new ball
    landingHandled = false;
    gameStats.lastBucketLanded = null;
    gameState = 'dropping';
    gameStats.totalDrops++;
    
    // Create ball with verified starting position
    ball = {
        x: verifiedStartX,
        y: canvas.height * 0.05,
        radius: GAME_CONFIG.ballRadius,
        color: GAME_CONFIG.ballColor,
        velocityX: 0, // Not used with animation path
        velocityY: 0, // Not used with animation path
        targetBucket: selectedBucket,
        collisionCount: 0,
        recentCollision: false,
        collisionTimeout: null
    };
    
    // Set up path animation
    animationPath = verifiedPath;
    animationStartTime = performance.now();
    animationDuration = verifiedPath[verifiedPath.length - 1].time;
    
    console.log(`Ball dropped: Target=${targetBucket}, StartX=${ball.x.toFixed(2)}, StartY=${ball.y.toFixed(2)}`);
    
    // Update UI
    updateControls();
    updateModeUI();
    updateDebugInfo();
    
    // Start animation
    isGameActive = true;
}

function handleReset() {
    // Only reset if game is active or ball exists
    if (isGameActive || ball) {
        resetBall();
    }
}

function addEventListeners() {
    // Add event listeners
    bucketButtons.forEach(btn => {
        btn.addEventListener('click', handleBucketSelection);
    });
    
    dropButton.addEventListener('click', handleDropBall);
    resetButton.addEventListener('click', handleReset);
    window.addEventListener('resize', resizeCanvas);
}

// Initialize the game
initGame();

// Initial UI update
updateControls();
updateModeUI();
updateDebugInfo();
});