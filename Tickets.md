# Plinko Game Implementation Tickets

## Overview
This document contains the tickets for implementing a Plinko slot machine game prototype. The core concept is a game where a ball drops through pegs into buckets, with the outcome being predetermined while appearing random and physics-based. This prototype is for demonstrating a slot machine concept to a client.

## Project Context
This prototype simulates a slot machine game where:
- All outcomes are predetermined (for legal gaming requirements)
- The visual experience must appear random and physics-based
- The "random" mode internally selects a bucket first, then ensures the ball lands there
- Both "random" and target modes use the same underlying mechanism

## Ticket 1: Project Setup & Structure
```
Claude, please create the initial project setup for a Plinko game prototype:
- index.html with a canvas element and basic UI structure
- styles.css for minimal styling
- main.js file with initialization
- .gitignore file for the project
The implementation should be a standalone HTML file with embedded JS and CSS that can be opened directly in a browser.
```

## Ticket 2: Canvas Setup & Game Loop
```
Claude, please implement the game canvas and basic game loop for our Plinko game:
- Canvas that resizes appropriately to the window
- Basic game loop using requestAnimationFrame
- Functions for initializing, updating, and rendering the game
- Simple background for the game board
```

## Ticket 3: Ball Implementation
```
Claude, please create the ball for our Plinko game:
- Object representing the ball with position, velocity, and size
- Logic for drawing the ball on the canvas
- Functions for controlled movement that appears physics-based
- System for calculating a path to a predetermined bucket
- Function to reset the ball to the top for a new drop
```

## Ticket 4: Peg System
```
Claude, please implement the peg system for our Plinko game:
- Create objects to represent pegs with position and size
- Generate a triangular pattern of pegs on the board
- Draw the pegs on the canvas
- Create a system that allows pegs to guide the ball along predetermined paths
```

## Ticket 5: Ball & Peg Interaction System
```
Claude, please implement the ball and peg interaction system for our Plinko game:
- Create realistic-looking interactions between the ball and pegs
- Implement a system that guides the ball toward a target bucket while appearing random
- Add visual variations to make each drop look unique
- Ensure the ball always reaches the predetermined bucket
```

## Ticket 6: Bucket System
```
Claude, please implement the bucket system for our Plinko game:
- Create objects for buckets at the bottom of the board
- Draw buckets visually distinct from each other
- Detect when the ball lands in a bucket
- Function to highlight which bucket caught the ball
```

## Ticket 7: Game Controls - "Random" Mode
```
Claude, please implement the controls for "random" mode in our Plinko game:
- Button to drop the ball from the top
- Button to reset the game
- When "Random" is selected, implement logic to:
  1. Internally select a target bucket
  2. Use the predetermined path system to ensure the ball lands in that bucket
  3. Make the path appear random and physics-based
- Handle game state (ready, dropping, completed)
```

## Ticket 8: Game Controls - Target Mode
```
Claude, please implement target mode for our Plinko game:
- Create a row of numbered buttons at the top (1, 2, 3, 4, 5, Random)
- Allow selecting a specific bucket number or random mode with these buttons
- Highlight the currently selected button/mode
- When a specific bucket is selected, use the same path system as "random" mode but with the player-selected bucket
- Make the path guidance feel natural and not obviously forced while guaranteeing the outcome
```

## Ticket 9: Visual Polish
```
Claude, please enhance the visuals of our Plinko game:
- Add colors and styles to game elements
- Implement simple animations for ball dropping
- Style buttons and controls to match the game
- Add visual feedback when a bucket receives the ball
```

## Ticket 10: Testing & Refinement
```
Claude, please implement testing and refinement for our Plinko game:
- Test all game functionality across different screen sizes
- Ensure the physics are consistent and reliable
- Fix any bugs in the collision or bucket detection
- Optimize for smooth performance
```

## Implementation Sequence
Each ticket should be implemented sequentially, building on the previous implementation:

1. Project Setup & Structure
2. Canvas Setup & Game Loop
3. Ball Implementation
4. Peg System
5. Ball & Peg Collision Physics
6. Bucket System
7. Game Controls - Random Mode
8. Game Controls - Target Mode
9. Visual Polish
10. Testing & Refinement

## Success Criteria
The final prototype should:
- Demonstrate a slot machine-style Plinko game where outcomes are controlled
- Always deliver the ball to the selected bucket (whether player-selected or "randomly" selected)
- Create the illusion of physics-based randomness while ensuring predetermined outcomes
- Feature varied paths even when targeting the same bucket repeatedly
- Be visually polished enough for a client demonstration
- Run as a single HTML file without external dependencies