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
        pegRows: 15,            // Increased number of rows of pegs
        pegSpacing: 50,         // Horizontal spacing between pegs
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
        speedDamping: 0.95,       // Speed loss on wall collision
        
        // Path control
        pathControlStrength: 0.6,  // Base strength of guidance (0-1) - increased for more reliability
        pathControlRamp: 0.15,     // How much control increases as ball descends - increased for smoother guidance
        pathRandomness: 0.08,      // Random factor in ball movement (0-1) - reduced for more control
        enforcedPathGuidance: true, // If true, increases guidance dramatically near bottom
        guaranteedLanding: true,    // Ensures ball ALWAYS lands in target bucket
        enforcementZone: 0.6       // Height threshold (as % of canvas) where strong enforcement begins - starting earlier
    };
    
    // Game state
    let selectedBucket = null;
    let isGameActive = false;
    let gameState = 'ready'; // ready, dropping, completed
    let animationFrameId = null;
    let lastTimestamp = 0;
    let deltaTime = 0;
    let pegLocations = [];
    let pegInfluenceMap = {};
    let bucketLocations = [];
    let ball = null;
    let ballTrail = [];
    let collisionHistory = [];
    let targetBucket = null;
    let pegPathData = {}; // Stores peg guidance data for visualization
    let particles = [];   // Particle effects for collisions
    let lastCollisionPeg = null; // Last peg the ball collided with (to prevent multiple collisions)
    let gameStats = {
        totalDrops: 0,
        successfulDrops: 0,
        lastResult: null, // 'success' or 'failure'
        lastBucketLanded: null, // Which bucket the ball landed in
        correctionLevel: "None", // Track what level of correction was needed (None, Slight, Emergency)
    };
    
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
    
    // Get influence strength for a peg based on its row
    function getPegZoneInfluence(row) {
        for (const zone of GAME_CONFIG.pathZones) {
            if (row >= zone.startRow && row <= zone.endRow) {
                return {
                    direction: zone.direction,
                    strength: zone.strength
                };
            }
        }
        return { direction: 0, strength: 0.5 }; // Default if no zone matches
    }
    
    // Calculate peg influence value for guiding ball to target bucket
    function calculatePegInfluence(pegIndex, targetBucketNum) {
        const peg = pegLocations[pegIndex];
        const targetBucket = bucketLocations[targetBucketNum - 1];
        
        // Calculate horizontal distance to bucket
        const dx = targetBucket.x - peg.x;
        
        // Get the row number directly from the peg's properties
        // (we store row index when creating the peg)
        const rowIndex = peg.row;
        
        // Get the zone influence
        const zoneInfo = getPegZoneInfluence(rowIndex);
        
        // Calculate influence strength based on distance and zone
        const distanceRatio = Math.abs(dx) / canvas.width;
        const directionBias = Math.sign(dx);
        
        // Direction bias: +1 means peg should influence ball to go right
        // Direction bias: -1 means peg should influence ball to go left
        const influenceDirection = directionBias;
        
        return {
            direction: influenceDirection,
            strength: zoneInfo.strength * (1 - distanceRatio * 0.5)
        };
    }
    
    // Initialize the influence map for each peg for each target bucket
    function initPegInfluenceMap() {
        pegInfluenceMap = {};
        
        // For each target bucket
        for (let bucketNum = 1; bucketNum <= GAME_CONFIG.bucketCount; bucketNum++) {
            pegInfluenceMap[bucketNum] = [];
            
            // Calculate influence for each peg
            for (let pegIndex = 0; pegIndex < pegLocations.length; pegIndex++) {
                pegInfluenceMap[bucketNum][pegIndex] = calculatePegInfluence(pegIndex, bucketNum);
            }
        }
    }
    
    // Generate peg display data for visualization
    function generatePegPathData() {
        pegPathData = {};
        
        if (!targetBucket) return;
        
        const bucketInfluenceMap = pegInfluenceMap[targetBucket];
        if (!bucketInfluenceMap) return;
        
        // Store the data keyed by peg index
        for (let i = 0; i < pegLocations.length; i++) {
            pegPathData[i] = {
                influence: bucketInfluenceMap[i],
                isActive: false,  // Will be set to true when ball is near
                activationTime: 0 // For animation effects
            };
        }
    }
    
    // Initialize peg positions in a triangular grid with influence for path guidance
    function initPegs() {
        pegLocations = [];
        const startX = canvas.width / 2;
        const startY = canvas.height * 0.08; // Reduced top spacing
        
        // Distribute pegs across the full width of the canvas
        // Calculate proper spacing based on desired number of pegs in bottom row
        const maxRowPegs = 15; // More pegs in bottom row for full width coverage
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
        
        // The influence map will be initialized after buckets are created
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
    
    // Get color for a peg based on its influence
    function getPegColor(pegIndex) {
        // Default color if no guidance is active
        if (!targetBucket || !pegPathData[pegIndex]) {
            return GAME_CONFIG.pegColor;
        }
        
        const pegInfo = pegPathData[pegIndex];
        
        // If heatmap visualization is enabled, show directional influence
        if (GAME_CONFIG.pegHeatmap && pegInfo.isActive) {
            const influence = pegInfo.influence;
            
            // Direction: -1 (left/blue) to 0 (neutral/white) to 1 (right/red)
            if (influence.direction < 0) {
                // Blue for leftward influence
                const intensity = Math.abs(influence.strength * 255);
                return `rgb(255, ${255 - intensity * 0.7}, ${255 - intensity})`;
            } else if (influence.direction > 0) {
                // Red for rightward influence
                const intensity = Math.abs(influence.strength * 255);
                return `rgb(${255}, ${255 - intensity * 0.7}, ${255 - intensity})`;
            } 
            
            // White for neutral
            return '#ffffff';
        }
        
        // Standard color with no heatmap
        return GAME_CONFIG.pegColor;
    }
    
    // Check if a peg is active (ball is nearby)
    function updateActivePegs() {
        if (!ball || !pegPathData) return;
        
        // Update active state of pegs based on ball proximity
        for (let i = 0; i < pegLocations.length; i++) {
            const peg = pegLocations[i];
            const pegData = pegPathData[i];
            
            if (!pegData) continue;
            
            // Calculate distance from ball to peg
            const dx = ball.x - peg.x;
            const dy = ball.y - peg.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Activate pegs within influence radius
            pegData.isActive = distance < GAME_CONFIG.pegInfluenceRadius;
            
            // Set activation time for animation
            if (pegData.isActive && pegData.activationTime === 0) {
                pegData.activationTime = Date.now();
            } else if (!pegData.isActive) {
                pegData.activationTime = 0;
            }
        }
    }
    
    // Draw all pegs with influence visualization
    function drawPegs() {
        // Update active pegs if ball exists
        if (ball) {
            updateActivePegs();
        }
        
        // Draw each peg
        pegLocations.forEach((peg, index) => {
            // Get the peg color based on influence
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
            
            // Add glow effect
            let glowIntensity = peg.glowIntensity;
            
            // Enhanced glow for active pegs
            const pegData = pegPathData[index];
            if (pegData && pegData.isActive) {
                // Pulse effect based on activation time
                const elapsed = Date.now() - pegData.activationTime;
                const pulseIntensity = 0.3 + 0.2 * Math.sin(elapsed / 200); // Oscillating intensity
                glowIntensity = Math.max(glowIntensity, pulseIntensity);
            }
            
            // Draw the glow
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, peg.radius * 1.8, 0, Math.PI * 2);
            
            // Create radial gradient for glow effect
            const glowGradient = ctx.createRadialGradient(
                peg.x, peg.y, peg.radius * 0.5,
                peg.x, peg.y, peg.radius * 1.8
            );
            
            // Adjust color based on influence if needed
            let glowColor = 'rgba(248, 249, 250, ';
            if (pegData && pegData.isActive && GAME_CONFIG.pegHeatmap) {
                const influence = pegData.influence;
                if (influence.direction < 0) {
                    glowColor = 'rgba(100, 150, 255, '; // Blue for left
                } else if (influence.direction > 0) {
                    glowColor = 'rgba(255, 100, 100, '; // Red for right
                }
            }
            
            glowGradient.addColorStop(0, glowColor + glowIntensity + ')');
            glowGradient.addColorStop(1, glowColor + '0)');
            
            ctx.fillStyle = glowGradient;
            ctx.fill();
            
            // Draw influence direction indicators (optional for debugging)
            if (GAME_CONFIG.pegHeatmap && pegData && pegData.isActive) {
                const influence = pegData.influence;
                
                if (influence.direction !== 0) {
                    // Draw direction indicator
                    const arrowLength = peg.radius * 2 * influence.strength;
                    const arrowX = peg.x + arrowLength * influence.direction;
                    
                    ctx.beginPath();
                    ctx.moveTo(peg.x, peg.y);
                    ctx.lineTo(arrowX, peg.y);
                    
                    ctx.strokeStyle = influence.direction < 0 ? 
                        'rgba(100, 150, 255, 0.7)' : 'rgba(255, 100, 100, 0.7)';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            }
        });
    }
    
    // Draw bucket with 3D effect
    function drawBucket3D(bucket, color, highlighted = false) {
        const x = bucket.x - bucket.width / 2;
        const y = bucket.y;
        const width = bucket.width;
        const height = bucket.height;
        const rimThickness = GAME_CONFIG.bucketRimThickness;
        
        // Create shadow/depth gradient at bottom of bucket
        const depthGradient = ctx.createLinearGradient(0, y + height * 0.7, 0, y + height);
        depthGradient.addColorStop(0, color);
        depthGradient.addColorStop(1, shadeColor(color, -30)); // Darker at bottom
        
        // Draw main bucket body with depth gradient
        ctx.fillStyle = depthGradient;
        ctx.fillRect(x, y, width, height);
        
        // Draw left side shadow for 3D effect
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(x, y, width * 0.1, height);
        
        // Draw right side highlight for 3D effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(x + width * 0.9, y, width * 0.1, height);
        
        // Draw bucket rim with 3D effect
        ctx.fillStyle = bucket.rimColor || shadeColor(color, -20);
        ctx.fillRect(x, y, width, rimThickness);
        
        // Draw rim highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(x, y, width, rimThickness / 2);
        
        // If bucket is highlighted, add special effects
        if (highlighted) {
            // Add glow effect around the rim
            const glowGradient = ctx.createRadialGradient(
                bucket.x, y, 0,
                bucket.x, y, width / 2
            );
            glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
            glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.fillStyle = glowGradient;
            ctx.fillRect(x, y - rimThickness, width, rimThickness * 2);
        }
        
        // Draw bucket number with shadow for better visibility
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
            drawBucket3D(bucket, bucketColor, isTargetBucket);
            
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
    
    // Check for collisions between ball and pegs
    function checkPegCollisions() {
        if (!ball) return;
        
        let hasCollided = false;
        
        // Pre-calculate ball movement for more accurate collision detection
        const nextX = ball.x + ball.velocityX * deltaTime;
        const nextY = ball.y + ball.velocityY * deltaTime;
        
        for (let i = 0; i < pegLocations.length; i++) {
            const peg = pegLocations[i];
            
            // Skip if this is the same peg as the last collision (prevents multiple collisions with same peg)
            if (lastCollisionPeg === i && ball.recentCollision) continue;
            
            // Calculate distance between ball and peg centers
            const dx = ball.x - peg.x;
            const dy = ball.y - peg.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Also check the next position for potential collisions (prevents tunneling)
            const nextDx = nextX - peg.x;
            const nextDy = nextY - peg.y;
            const nextDistance = Math.sqrt(nextDx * nextDx + nextDy * nextDy);
            
            // Check if collision occurred or will occur in the next frame
            const minDistance = ball.radius + peg.radius;
            // Slightly increase collision detection radius to prevent tunneling for fast-moving balls
            const extendedDistance = minDistance + 2; 
            const ballSpeed = Math.abs(ball.velocityX) + Math.abs(ball.velocityY);
            
            if (distance < minDistance || 
                (nextDistance < minDistance && distance > nextDistance) || 
                (ballSpeed > 12 && distance < extendedDistance)) {
                hasCollided = true;
                
                // Track this collision
                lastCollisionPeg = i;
                ball.recentCollision = true;
                ball.collisionCount++;
                
                // Calculate collision response
                const angle = Math.atan2(dy, dx);
                
                // Move ball outside of collision more forcefully
                const overlap = minDistance - distance + 2; // Increase from 1 to 2px extra to prevent sticking
                ball.x += Math.cos(angle) * overlap;
                ball.y += Math.sin(angle) * overlap;
                
                // Calculate new velocity after bounce
                const speed = Math.sqrt(ball.velocityX * ball.velocityX + ball.velocityY * ball.velocityY);
                const incomingAngle = Math.atan2(ball.velocityY, ball.velocityX);
                const reflectionAngle = 2 * angle - incomingAngle;
                
                // Calculate how much influence this peg should have
                let guidanceModifier = 0;
                if (pegPathData[i] && pegPathData[i].influence) {
                    const influence = pegPathData[i].influence;
                    // Apply stronger guidance as ball falls lower
                    const verticalPosition = ball.y / canvas.height;
                    guidanceModifier = influence.direction * influence.strength * 
                                      (0.1 + verticalPosition * 0.3);
                }
                
                // Add randomness to reflection (less random if enforcing path)
                let randomFactor = (Math.random() - 0.5) * GAME_CONFIG.pathRandomness;
                
                // Apply additional bias near the bottom to ensure landing in target bucket
                // Enhanced to guarantee landing in target bucket (legal requirement)
                if (GAME_CONFIG.enforcedPathGuidance) {
                    if (ball.y > canvas.height * GAME_CONFIG.enforcementZone) {
                        // In the enforcement zone - stronger guidance
                        const strengthMultiplier = (ball.y - canvas.height * GAME_CONFIG.enforcementZone) / 
                                                  (canvas.height * (1 - GAME_CONFIG.enforcementZone));
                        
                        // Dramatically increase guidance strength near bottom
                        guidanceModifier *= (1 + strengthMultiplier * 3);
                        
                        // Reduce randomness for more control
                        randomFactor *= (1 - strengthMultiplier * 0.9);
                        
                        // Direct intervention for guaranteed landing if extremely close to bottom
                        if (strengthMultiplier > 0.8) {
                            // Get target bucket position
                            const target = bucketLocations[targetBucket - 1];
                            const dx = target.x - ball.x;
                            
                            // Add very strong directional bias to ensure landing
                            guidanceModifier += Math.sign(dx) * strengthMultiplier * 0.3;
                        }
                    }
                }
                
                // Final angle includes reflection, randomness, and guidance
                const finalAngle = reflectionAngle + randomFactor + guidanceModifier;
                
                // Set new velocity with minimum speed guarantee
                const newSpeed = Math.max(speed * GAME_CONFIG.ballRestitution, 3.0);
                ball.velocityX = Math.cos(finalAngle) * newSpeed;
                ball.velocityY = Math.sin(finalAngle) * newSpeed;
                
                // Add a minimum vertical velocity to prevent horizontal sticking
                if (Math.abs(ball.velocityY) < 0.5) {
                    const verticalBoost = Math.random() * 0.5 + 0.5; // 0.5 to 1.0
                    ball.velocityY += ball.velocityY >= 0 ? verticalBoost : -verticalBoost;
                }
                
                // Visual feedback - add to collision history
                collisionHistory.push({
                    x: ball.x,
                    y: ball.y,
                    age: 0
                });
                
                // Create particle effects if function exists
                if (typeof createParticles === 'function') {
                    createParticles(
                        ball.x, 
                        ball.y, 
                        GAME_CONFIG.particleCount, 
                        ball.color, 
                        newSpeed * 0.2
                    );
                }
                
                // Add extra emphasis to active pegs
                if (pegPathData[i]) {
                    pegPathData[i].isActive = true;
                    pegPathData[i].activationTime = Date.now();
                }
                
                // Prevent multiple collisions with same peg - use standard clearTimeout approach
                ball.recentCollision = true;
                if (ball.collisionTimeout) {
                    clearTimeout(ball.collisionTimeout);
                }
                ball.collisionTimeout = setTimeout(() => {
                    ball.recentCollision = false;
                }, 100);
                
                break; // Only handle one collision per frame for smoother physics
            }
        }
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
                
                // Log the emergency guidance only occasionally
                if (Math.random() < 0.05) {
                    console.log("ENHANCED GUIDANCE: Applied near-bottom course correction");
                }
            }
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
                
                // Update ball's final position to settle nicely in the bucket
                ball.x = bucket.x; // Center horizontally in bucket
                
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
                            ball = null;
                            ballTrail = [];
                            collisionHistory = [];
                            clearInterval(slowDownInterval);
                        }
                    } else {
                        clearInterval(slowDownInterval);
                    }
                }, 100);
                
                return true;
            }
        }
        
        return false;
    }
    
    // Calculate peg influence on ball at current position
    function calculateCurrentPegInfluence() {
        if (!ball || !targetBucket || !pegPathData) return { x: 0, y: 0 };
        
        let totalInfluenceX = 0;
        let totalInfluenceY = 0;
        let totalWeight = 0;
        
        // Check each peg's influence
        for (let i = 0; i < pegLocations.length; i++) {
            const peg = pegLocations[i];
            const pegData = pegPathData[i];
            
            if (!pegData) continue;
            
            // Calculate distance from ball to peg
            const dx = ball.x - peg.x;
            const dy = ball.y - peg.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Skip pegs that are too far away
            if (distance > GAME_CONFIG.pegInfluenceRadius) continue;
            
            // Calculate influence weight based on distance (closer = stronger influence)
            const weight = 1 - (distance / GAME_CONFIG.pegInfluenceRadius);
            const influence = pegData.influence;
            
            // Add weighted influence to total
            totalInfluenceX += influence.direction * influence.strength * weight;
            totalWeight += weight;
            
            // Mark this peg as active for visualization
            pegData.isActive = true;
            if (pegData.activationTime === 0) {
                pegData.activationTime = Date.now();
            }
        }
        
        // Normalize influence
        if (totalWeight > 0) {
            return {
                x: totalInfluenceX / totalWeight,
                y: 0  // For now, only horizontal influence
            };
        }
        
        return { x: 0, y: 0 };
    }
    
    // Apply guidance to direct the ball towards the target bucket
    function guideBallPath() {
        if (!ball || !targetBucket || !isGameActive) return;
        
        // Get target bucket
        const target = bucketLocations[targetBucket - 1];
        
        // Calculate direct influence - pulling toward target bucket
        const dx = target.x - ball.x;
        
        // Calculate guidance strength based on vertical position (increases as ball falls)
        const verticalProgress = (ball.y / canvas.height);
        let guidanceStrength = GAME_CONFIG.pathControlStrength + 
                             (verticalProgress * verticalProgress * GAME_CONFIG.pathControlRamp); // Exponential increase
        
        // CRITICAL: Check if we're in the enforcement zone (near bottom of board)
        // This ensures the ball ALWAYS lands in the correct bucket (legal requirement)
        if (GAME_CONFIG.guaranteedLanding && verticalProgress > GAME_CONFIG.enforcementZone) {
            // Calculate how far into the enforcement zone we are (0 to 1)
            const enforcementProgress = (verticalProgress - GAME_CONFIG.enforcementZone) / 
                                       (1 - GAME_CONFIG.enforcementZone);
            
            // Exponentially increase guidance as we get closer to buckets
            // This makes the path correction look more natural while still guaranteeing the outcome
            guidanceStrength = 0.8 + enforcementProgress * 3.0;
            
            // If we're very close to the bottom, apply direct correction if needed
            if (enforcementProgress > 0.8) {
                // Calculate bucket width and check if ball is on track for the target
                const bucketWidth = target.width;
                const bucketLeft = target.x - bucketWidth/2;
                const bucketRight = target.x + bucketWidth/2;
                
                // If we're not heading toward target bucket, adjust velocity more dramatically
                // This is our failsafe to ensure the ball ALWAYS lands in the correct bucket
                if (ball.x < bucketLeft || ball.x > bucketRight) {
                    // Apply stronger correction toward bucket center
                    ball.velocityX = dx * 0.1;
                    
                    // If we're extremely close to the bottom and off course
                    if (enforcementProgress > 0.95) {
                        // Direct position override - last resort but looks natural
                        // as a final small correction
                        ball.x += dx * 0.15;
                    }
                }
            }
        } else {
            // Cap normal guidance strength
            guidanceStrength = Math.min(guidanceStrength, 0.8);
        }
        
        // Apply direct guidance - pull toward bucket
        const directInfluence = dx * 0.0005 * guidanceStrength * deltaTime;
        
        // Get peg-based influence - guidance through the peg field
        const pegInfluence = calculateCurrentPegInfluence();
        const pegFactor = 0.02 * deltaTime; // Adjust strength of peg influence
        
        // Combine both influences
        ball.velocityX += directInfluence + (pegInfluence.x * pegFactor);
        
        // Add small random variations to make movement look natural
        // Reduce randomness as we get closer to the bottom for more control
        const randomFactor = GAME_CONFIG.pathRandomness * (1 - verticalProgress * 0.8);
        const randomX = (Math.random() - 0.5) * 0.05 * randomFactor;
        ball.velocityX += randomX;
        
        // Add a minimum velocity check to prevent the ball from moving too slowly
        const currentSpeed = Math.sqrt(ball.velocityX * ball.velocityX + ball.velocityY * ball.velocityY);
        if (currentSpeed < 1.5) {
            // Scale up the velocity while preserving direction
            const factor = 1.5 / currentSpeed;
            ball.velocityX *= factor;
            ball.velocityY *= factor;
        }
    }
    
    // Update ball physics
    function updateBall(deltaTime) {
        if (!ball || !isGameActive) return;
        
        // Update ball trail
        updateBallTrail();
        
        // Apply guidance toward target bucket
        guideBallPath();
        
        // EMERGENCY OVERRIDE: Ensure ball reaches target bucket
        // This is REQUIRED - ball MUST reach the predetermined bucket
        const target = bucketLocations[targetBucket - 1];
        
        // Force the ball to stay within reasonable range of target
        // As the ball gets lower, we apply stronger and stronger corrections
        const verticalProgress = ball.y / canvas.height;
        
        // Start corrections earlier (50% height instead of 60%)
        if (verticalProgress > 0.5) {
            // Calculate the horizontal distance to target
            const dx = target.x - ball.x;
            const targetWidth = target.width;
            
            // Calculate how far out of range we are (as a ratio of bucket width)
            const outOfRangeRatio = Math.abs(dx) / (targetWidth * 4);
            
            // Easing function: make corrections smoother with cubic easing
            const easeInCubic = (t) => t * t * t;
            const normalizedProgress = (verticalProgress - 0.5) / 0.5; // 0 to 1 as ball falls
            const easedCorrection = easeInCubic(normalizedProgress);
            
            // More subtle initial correction that gradually increases
            const correctionFactor = outOfRangeRatio * easedCorrection * 10;
            
            // Apply smaller correction each frame (reduced from 20 to 10)
            if (outOfRangeRatio > 0.1) { // Only correct if significantly off target
                ball.velocityX += Math.sign(dx) * correctionFactor;
                
                // Track that at least slight correction was used
                if (gameStats.correctionLevel === "None") {
                    gameStats.correctionLevel = "Slight";
                }
                
                // Add subtle logging at significant correction points
                if (correctionFactor > 1 && Math.random() < 0.05) {
                    console.log(`Subtle path correction: ${Math.round(correctionFactor * 100) / 100} at ${Math.round(verticalProgress * 100)}% height`);
                }
            }
            
            // If we're close to the bottom and not aligned, apply graduated emergency correction
            // Start emergency corrections at 75% height (instead of 85%)
            if (verticalProgress > 0.75 && Math.abs(dx) > targetWidth * 0.5) {
                // Mark as emergency correction
                gameStats.correctionLevel = "Emergency";
                
                // Log emergency correction
                if (Math.random() < 0.1) { // Throttle logging to avoid console spam
                    console.log(`Emergency correction at ${Math.round(verticalProgress * 100)}% height, distance: ${Math.round(Math.abs(dx))} pixels`);
                }
                
                // Eased correction power - more natural acceleration toward target
                const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4); // Stronger at end
                const correctionRange = (verticalProgress - 0.75) / 0.25; // 0 to 1 range
                const easedCorrection = easeOutQuart(correctionRange);
                
                // Calculate remaining distance to bottom (to determine how quickly we need to correct)
                const remainingDistance = canvas.height - ball.y;
                // Approximate frames remaining before reaching bottom
                const framesRemaining = Math.max(10, remainingDistance / (ball.velocityY * deltaTime));
                
                // Graduated velocity adjustment - starts subtler, becomes more proportional to needed correction
                // Calculate how much velocity change is needed per frame to reach target
                const neededVelocityChange = dx / framesRemaining * 0.8; // 80% of perfect correction
                
                // Blend existing velocity with needed correction proportionally
                // More preservation of current velocity at the beginning, more correction near the end
                const blendFactor = 0.3 + (easedCorrection * 0.5); // 0.3 to 0.8 range
                ball.velocityX = ball.velocityX * (1 - blendFactor) + neededVelocityChange * blendFactor;
                
                // Apply a small positional adjustment that matches the velocity change
                // This makes the correction appear more physically natural
                if (verticalProgress > 0.85) {
                    // Smaller incremental position adjustments with smoother movement
                    // Limit to 3% of distance per frame to avoid jerky movement
                    const positionAdjustment = dx * easedCorrection * Math.min(0.03, deltaTime * 0.01);
                    ball.x += positionAdjustment;
                    
                    // Ensure velocity and position changes are consistent for natural movement
                    // This prevents the ball from appearing to curve unnaturally
                    if (Math.abs(positionAdjustment) > 0.5) {
                        // Make velocity direction match position adjustment direction
                        const velocityMagnitude = Math.abs(ball.velocityX);
                        ball.velocityX = Math.sign(positionAdjustment) * velocityMagnitude;
                    }
                }
            }
        }
        
        // Apply gravity
        ball.velocityY += GAME_CONFIG.gravity * deltaTime;
        
        // Update position based on velocity
        ball.x += ball.velocityX * deltaTime;
        ball.y += ball.velocityY * deltaTime;
        
        // Check for collisions with pegs
        checkPegCollisions();
        
        // Check if ball landed in a bucket
        if (checkBucketLanding()) {
            return; // Ball landed, stop physics updates
        }
        
        // Handle wall collisions
        if (ball.x - ball.radius < 0) {
            ball.x = ball.radius;
            ball.velocityX = -ball.velocityX * GAME_CONFIG.speedDamping;
            collisionHistory.push({ x: ball.x, y: ball.y, age: 0 });
        } else if (ball.x + ball.radius > canvas.width) {
            ball.x = canvas.width - ball.radius;
            ball.velocityX = -ball.velocityX * GAME_CONFIG.speedDamping;
            collisionHistory.push({ x: ball.x, y: ball.y, age: 0 });
        }
        
        // Check if ball is near the bottom without landing in a bucket
        if (ball.y - ball.radius > canvas.height * 0.92) {
            // FAILSAFE: Ball should NEVER miss - this is a legal requirement
            // If we somehow get here, use a gradual approach to target bucket
            const target = bucketLocations[targetBucket - 1];
            
            // Calculate distance to target
            const dx = target.x - ball.x;
            // Use remaining distance to bottom to calculate how quickly to move
            const remainingDistance = canvas.height - ball.y;
            // How many frames until we hit bottom (approximately)
            const framesRemaining = Math.max(10, remainingDistance / (ball.velocityY * deltaTime));
            
            // Calculate what fraction of the distance we should move each frame
            // Use easing function to make the movement look more natural - slower start, accelerated middle
            const progress = 1 - (remainingDistance / (canvas.height * 0.08)); // 0 to 1 as we approach bottom
            const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            const correctionStrength = easeInOutCubic(Math.min(1, progress));
            
            // Amount to move per frame - much smaller adjustment (5% max) for natural motion
            // Uses a graduated approach that smoothly accelerates
            const moveAmount = Math.min(dx * 0.05, dx / framesRemaining * correctionStrength * 2);
            
            // Apply graduated correction
            ball.x += moveAmount;
            
            // Set horizontal velocity to match the position change for consistency
            // This creates more natural motion by ensuring velocity and position changes align
            ball.velocityX = moveAmount / deltaTime * 0.8; // 80% of position change rate
            
            // Add a small random wobble to make it look less mechanical
            const maxWobble = Math.min(0.3, (1 - correctionStrength) * 0.5);
            ball.velocityX += (Math.random() - 0.5) * maxWobble;
            
            // Set correction level to highest emergency
            gameStats.correctionLevel = "Final Emergency";
            
            // Log final emergency correction - ALWAYS log this one
            console.log(`Final emergency correction at ${Math.round(ball.y / canvas.height * 100)}% height, ${framesRemaining.toFixed(1)} frames to impact`);
        }
        
        // CRITICAL FAILSAFE: We must ensure the ball reaches the target bucket
        // Start applying stronger but still natural-looking guidance at 85% height
        if (ball.y > canvas.height * 0.85) {
            // Get target bucket
            const target = bucketLocations[targetBucket - 1];
            
            // Calculate horizontal distance to target
            const dx = target.x - ball.x;
            
            // Calculate remaining vertical distance to bottom
            const verticalDistanceLeft = canvas.height - ball.y;
            
            // Calculate how much of the final approach we've completed (0-1)
            const approachProgress = Math.min(1.0, (ball.y - canvas.height * 0.85) / (canvas.height * 0.15));
            
            // Use easing function for natural acceleration of guidance
            const easeInOutQuad = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            const easedProgress = easeInOutQuad(approachProgress);
            
            // Calculate frames remaining until impact (approximately)
            const framesLeft = Math.max(8, verticalDistanceLeft / (ball.velocityY * deltaTime));
            
            // Calculate how much velocity change is needed per frame to reach target
            const neededVelocityPerFrame = dx / framesLeft;
            
            // Apply natural-looking acceleration toward target
            // The strength increases as we get closer to bottom but in a smooth curve
            // Never exceeds reasonable physics acceleration values
            const correctionForce = neededVelocityPerFrame * easedProgress * 0.4 * deltaTime;
            
            // Add to velocity (appears as invisible forces acting on the ball)
            ball.velocityX += correctionForce;
            
            // Add small natural-looking randomness to prevent perfectly straight movement
            // Randomness decreases as we get closer to ensure accuracy
            const randomFactor = (1 - easedProgress) * 0.1;
            ball.velocityX += (Math.random() - 0.5) * randomFactor;
            
            // If we're very close to bottom and still off target, apply slightly stronger guidance
            // This looks like a subtle influence rather than teleportation
            if (approachProgress > 0.8 && Math.abs(dx) > 15) {
                // Apply small additional velocity in the right direction
                ball.velocityX += Math.sign(dx) * 0.2 * deltaTime;
                gameStats.correctionLevel = "Enhanced Guidance";
            }
            
            // Highest level of guidance - still kept within physical plausibility
            if (approachProgress > 0.95 && Math.abs(dx) > 5) {
                gameStats.correctionLevel = "Precision Guidance";
                
                // Log only occasionally
                if (Math.random() < 0.05) {
                    console.log(`Precision guidance: ${Math.round(dx)}px from target, ${Math.round(framesLeft)} frames left`);
                }
            }
        }
        
        // Ultimate failsafe: If somehow the ball gets below canvas, force landing in target bucket
        if (ball.y - ball.radius > canvas.height) {
            // Force ball into target bucket
            const target = bucketLocations[targetBucket - 1];
            if (target) {
                ball.x = target.x;
                ball.y = target.y + target.height * 0.5;
                ball.velocityX = 0;
                ball.velocityY = 1;
                
                // Log this critical override
                console.log("CRITICAL OVERRIDE: Ball teleported to target bucket");
                
                // Force the bucket landing check to handle it immediately
                const bucketIndex = targetBucket - 1;
                const bucket = bucketLocations[bucketIndex];
                if (bucket) {
                    // Update game statistics and trigger landing
                    handleBallLanding(targetBucket, true);
                    
                    // Force game completion
                    isGameActive = false;
                    gameState = 'completed';
                    updateControls();
                }
            } else {
                // If somehow the target bucket doesn't exist, just end the game
                console.error("CRITICAL ERROR: Target bucket not found, ending game");
                ball = null;
                isGameActive = false;
                gameState = 'completed';
                updateControls();
            }
            
            return true; // Return true to indicate we handled it
        }
    }
    
    // Set up initial game state
    function initGame() {
        resizeCanvas();
        initPegs();
        initBuckets();
        // Initialize peg influence map after both pegs and buckets exist
        initPegInfluenceMap();
        addEventListeners();
        drawGame();
    }
    
    // Get initial ball position for reaching target bucket
    function calculateInitialBallPosition() {
        // Target bucket to aim for
        if (targetBucket === null) {
            throw new Error("Target bucket is not set");
        }
        
        // Get the target bucket
        const target = bucketLocations[targetBucket - 1];
        
        // Determine starting position based on a more controlled approach:
        // - For buckets 1 and 5 (edges): Start close to target bucket (60% toward target)
        // - For buckets 2 and 4: Start moderately biased (40% toward target)
        // - For bucket 3 (middle): Start in center with small random offset
        
        // Base position in the center
        let xPos = canvas.width / 2;
        
        // Moderate bias based on target bucket location
        const bucketOffset = targetBucket - Math.ceil(GAME_CONFIG.bucketCount / 2);
        
        // Calculate bias factor (higher for edge buckets, lower for middle)
        // Increased all bias factors to give the ball a better starting position
        // This creates more natural-looking paths that need less correction
        let biasFactor;
        if (targetBucket === 1 || targetBucket === GAME_CONFIG.bucketCount) {
            // Strong bias for edge buckets
            biasFactor = 0.7; 
        } else if (targetBucket === 2 || targetBucket === GAME_CONFIG.bucketCount - 1) {
            // Moderate bias for near-edge buckets
            biasFactor = 0.5;
        } else {
            // Minimal bias for middle buckets
            biasFactor = 0.3;
        }
        
        // Calculate distance to target bucket
        const targetDistance = target.x - xPos;
        
        // Apply bias toward target bucket
        xPos += targetDistance * biasFactor;
        
        // Add small randomness to make it look natural (less for edge buckets)
        const randomness = Math.min(0.05, 0.1 - biasFactor * 0.1); // Less randomness for edge buckets
        const randomFactor = (Math.random() - 0.5) * (canvas.width * randomness);
        xPos += randomFactor;
        
        // Ensure within bounds
        xPos = Math.max(GAME_CONFIG.ballRadius, Math.min(canvas.width - GAME_CONFIG.ballRadius, xPos));
        
        return xPos;
    }
    
    
    // Create the ball at the top of the screen
    function createBall() {
        // Clear previous state
        ballTrail = [];
        collisionHistory = [];
        lastCollisionPeg = null;
        
        // Reset landing tracking flag for new ball
        landingHandled = false;
        
        // Clear last bucket landed info and reset correction level
        gameStats.lastBucketLanded = null;
        gameStats.correctionLevel = "None";
        
        // Set game state
        gameState = 'dropping';
        
        // Increment total drops counter
        gameStats.totalDrops++;
        
        targetBucket = selectedBucket;
        
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
        
        // Generate peg path data for the selected target bucket
        generatePegPathData();
        
        // Calculate starting position
        const initialX = calculateInitialBallPosition();
        
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
        
        // Update UI for current mode
        updateModeUI();
        
        // Update debug panel
        updateDebugInfo();
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
        // Clear ball and related state
        ball = null;
        ballTrail = [];
        collisionHistory = [];
        particles = [];
        targetBucket = null;
        lastCollisionPeg = null;
        
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
            updateBall(deltaTime);
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
        
        // Update game statistics
        gameStats.lastBucketLanded = bucketNumber;
        
        if (isTargetBucket) {
            gameStats.successfulDrops++;
            gameStats.lastResult = 'success';
        } else {
            gameStats.lastResult = 'failure';
        }
        
        // Update game state
        gameState = 'completed';
        
        // Update statistics and debug panel
        updateGameStatistics();
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
        const debugCorrectionLevel = document.getElementById('debug-correction-level');
        
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
        
        // Update correction level info
        if (debugCorrectionLevel) {
            debugCorrectionLevel.textContent = gameStats.correctionLevel;
            
            // Color-code based on correction level
            if (gameStats.correctionLevel === "None") {
                debugCorrectionLevel.style.color = '#4ade80'; // Green for no correction
            } else if (gameStats.correctionLevel === "Slight") {
                debugCorrectionLevel.style.color = '#facc15'; // Yellow for slight correction
            } else {
                debugCorrectionLevel.style.color = '#f87171'; // Red for emergency corrections
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
        
        // Update controls and mode UI
        updateControls();
        updateModeUI();
        
        // Update debug panel
        updateDebugInfo();
        
        // Redraw the game
        drawGame();
    }
    
    function handleDropBall() {
        if (isGameActive || selectedBucket === null) return;
        
        isGameActive = true;
        lastTimestamp = 0;
        
        // Initialize ball and start game loop
        createBall();
        
        // Update controls based on new game state
        updateControls();
        
        // Start animation loop
        animationFrameId = requestAnimationFrame(gameLoop);
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