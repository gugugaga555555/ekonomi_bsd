// Shared mutable state across modules
// Centralized here to avoid circular dependencies

// Tracks which players have hidden their actionbar XP display
export const hiddenBoards = new Map();
