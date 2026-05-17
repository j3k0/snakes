# AGENTS.md

## Game Loop
- `gameInterval` must be both `clearInterval()`'d AND set to `null` in `gameOver()` — the keydown handler guards on `!gameInterval` to detect stopped state
- Speed changes require clearing the existing `setInterval` and creating a new one; you cannot mutate a running interval's delay

## Food Generation
- `generateFood()` must check if the snake fills the board before entering the do-while loop, otherwise it infinite-loops

## State Management
- `gameState` (`idle`/`playing`/`paused`/`gameover`) is the single source of truth for all flow control; always check it before acting on input or updating
