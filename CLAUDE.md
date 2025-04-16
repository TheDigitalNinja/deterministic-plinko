# Plinko Game Implementation Instructions

This document contains implementation instructions for creating a Plinko game prototype for a slot machine concept. The game will allow players to see a ball drop through pegs into buckets, with the outcome being fully deterministic while appearing random.

## Project Context

This is a prototype for a potential slot machine game. In slot machines:
- All outcomes are predetermined
- The physics and animations provide entertainment value
- The appearance of randomness is important, but actual results are controlled

For legal and client demonstration purposes, this prototype needs to consistently deliver a ball to a specified bucket while making the journey appear natural and physics-based.

## Git Workflow

For this prototype, use git to track implementation progress:

- Initialize git in the project directory (note that CLAUDE.md will be present)
- Commit each major implementation step separately
- Use descriptive commit messages explaining what was implemented
- Determine appropriate commit messages at time of commit based on what was changed

## Technical Parameters

- The implementation should be a single HTML file with embedded JavaScript and CSS
- No external libraries or frameworks should be used
- The game should run directly in a browser without requiring a server
- The code should be clean, well-commented, and organized for readability

## Implementation Guidelines

### Canvas Setup

Create a responsive canvas element that:
- Resizes appropriately based on the window size
- Maintains the correct aspect ratio
- Has clear visual boundaries

### Game Objects

1. **Ball**
   - Create a circular object that falls from the top of the screen
   - Implement realistic physics with gravity and velocity
   - Handle bouncing off pegs and walls

2. **Pegs**
   - Arrange in a triangular pattern
   - Create collision detection with the ball
   - Make collision response look natural

3. **Buckets**
   - Place a row of buckets at the bottom of the screen
   - Detect when the ball lands in a bucket
   - Provide visual feedback for the selected bucket

### Game Modes

1. **"Random" Mode**
   - Player selects "Random" option
   - System internally selects a target bucket
   - Ball follows a path that appears random but guarantees landing in the selected bucket
   - Visual experience should suggest chance even though outcome is predetermined

2. **Target Mode**
   - Player explicitly selects which bucket (1-5) the ball should land in
   - Ball follows a path that appears natural but guarantees landing in the selected bucket
   - Path should look realistic and physics-based while ensuring the predetermined outcome

Note: Both modes use the same underlying mechanism - the only difference is whether the system or the player chooses the bucket.

### User Interface

Create a clean, simple UI with:
- Row of numbered buttons at the top (1, 2, 3, 4, 5, Random) for mode/bucket selection
- Current selection should be visually highlighted
- Drop button to release the ball
- Reset button to prepare for another drop
- Visual feedback for game state

### Physics Implementation

For realistic ball physics:
- Implement gravity acceleration
- Handle collisions with pegs using distance-based detection
- Add small random factors after collisions
- Ensure the ball stays within game boundaries

For target mode path manipulation:
- Apply subtle forces to influence the ball's direction
- Increase guidance strength as the ball descends
- Use a combination of initial position/velocity adjustment and in-flight corrections
- Maintain physical plausibility at all times