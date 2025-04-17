# Deterministic Plinko

A physics-based Plinko game demonstration that creates the illusion of randomness while guaranteeing predetermined outcomes.

## Overview

Deterministic Plinko is a prototype that demonstrates how a seemingly random physics-based game can be engineered to produce specific predetermined results. The ball appears to naturally bounce through pegs following the laws of physics, while actually ensuring it lands in the exact target bucket selected by the user.

This project serves as a technical demonstration for:
- Slot machine mechanics where outcomes are predetermined but appear random
- Physics simulations with controlled outcomes
- How to balance deterministic outcomes with natural-looking movement

## Features

- **Target Selection**: Users can select which bucket (1-5) the ball will land in
- **Natural Physics**: Ball movement mimics realistic physics with gravity, bounces, and collisions
- **Guaranteed Outcomes**: 100% accuracy in reaching the selected target bucket
- **Debug Panel**: Shows success rate, target information, and correction levels
- **Visual Effects**: Particle effects, glow effects, and animations enhance the experience

## How It Works

Behind the scenes, this implementation:
1. Uses a combination of initial position bias toward the target bucket
2. Applies subtle guidance forces throughout the ball's journey
3. Increases guidance strength as the ball descends
4. Uses natural-looking easing functions to make corrections appear fluid
5. Employs visual feedback (particles, trails, etc.) to distract from minor corrections

All of this is done while maintaining the appearance of a realistic physics simulation.

## Legal Context

In the gambling industry, games must produce predetermined outcomes while still providing entertainment value. This prototype demonstrates how a game can be visually engaging while still guaranteeing specific results - a critical requirement for regulatory compliance.

## Installation

Simply download or clone the repository and open `index.html` in any modern web browser. No server or additional dependencies required.

```
git clone <repository-url>
cd deterministic-plinko
```

## Usage

1. Select a target bucket (1-5) by clicking its button
2. Press "Drop Ball" to release the ball
3. Watch as the ball naturally falls through the pegs
4. The ball will land in your selected bucket
5. Press "Reset" to try again

## Technical Stack

- Pure JavaScript (no external libraries)
- HTML5 Canvas for rendering
- CSS for styling
- Modular code structure (HTML/CSS/JS separation)

## License

[Include appropriate license information here]