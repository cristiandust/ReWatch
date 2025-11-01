# ReWatch - Streaming Progress Tracker

This is a Chrome extension project that tracks viewing progress across streaming platforms.

## Supported Platforms
- Crunchyroll
- Disney+
- Filmzie
- HBO Max
- HiAnime
- Netflix
- Plex
- Pluto
- Roku Channel
- Tubi
- YouTube
- Brocoflix

**Important:** Only these platforms are supported. Any other platform should be ignored.

## Key Features
- Platform-specific video player detection
- Automatic progress tracking with platform-specific implementations
- Episode and movie watch history with accurate metadata
- Each supported platform has its own detector class

## Development Guidelines
- Use Chrome Extension Manifest V3
- Implement platform-specific detector classes (extends `PlatformDetector`)
- Use Chrome Storage API for persistence
- Each new platform requires a dedicated implementation
- Unsupported platforms must be filtered out in `saveProgress()`

---
applyTo: "**/*.{js,ts,jsx,tsx}"
---

## Prime Directives
- Avoid working on more than one file at a time.
- Multiple simultaneous edits to a file will cause corruption.
- Be chatting and teach about what you are doing while coding.

## Instruction applicability
When multiple instruction files are provided:
    1. Only apply instructions that are directly relevant to the current task and file types.
    2. Check if an instruction has an "applyTo" pattern and verify the current file matches that pattern.
    3. If an instruction relates to specific technologies(like validation libraries), only apply it when working with those technologies.
    4. Explicitly ignore instructions that don't apply to the current context.

## Large file & complex change protocot

### Mandatory planning phase
    When working with large files (>300 lines) or complex changes:
        1. Always start by creating a detailed plan BEFORE making any edits
        2. Your plan must include:
            - All functions/sections that need modification
            - The order in which changes should be applied
            - Dependencies between changes
            - Estimated number of separate edits required
        3. Format your plan as:
            ## Proposed Edit Plan
                Working with [filename]:
                1. [First change]
                2. [Second change]
                ...
                Total planned edits: [number]
### Making edits
    - DO NOT add comments in the code! Ever! THIS IS VERY IMPORTANT!
    - Focus on one conceptual change at a time
    - Show clear "before" and "after" code snippets when proposing changes
    - Include concise explanations of what changed and why
    - Always check if the edit maintains the project's coding style and conventions
    - When adding components that only return JSX, use a direct return instead of a function body.

### Edit sequence:
    1. [First specific change] - Purpose: [reason]
    2. [Second specific change] - Purpose: [reason]
    3. Do you approve this plan? I'll proceed with Edit [number] after your confirmation.
    4. If the plan has more than one step, WAIT for explicit user confirmation before making ANY edits when user ok edit [number].

### Execution phase
    - After each individual edit, clearly indicaste progress:
        "Completed edit [current edit number] of [total edits]. Ready for next edit?"
    - If you discover additional needed changes during editing:
        1. STOP and update the plan
        2. Get user approval before proceeding

### Refactoring guidance
    When refactoring large files:
        - Break down into logical, independently functional chunks
        - Ensure each intermediate state maintains functionality
        - Consider temporary duplication as a valid interim step
        - Always indicate the refactoring pattern being applied
        - At this stage, do not worry about linting errors. You will check them at the end (Post-edit Requirements).
        - If you need to edit multiple files, first edit the file that was requested and then always ask for permission to edit the other files.
        - When creating validation schemas, always use Zod, even if the model uses Yup.

### Rate limit avoidance
    - For very large files, suggest splitting changes across multiple sessions
    - Prioritize changes that are logically complete units
    - Always provide clear stopping points

## General requirements
    Use modern technologies as described below for all code suggestions. Prioritize clean, maintainable, and efficient code with appropriate comments.

## Typescript requirements
    Prefer types to interfaces.
    Do not add comments to the code
    Do not use `any` type.

## Post-edit Requirements
    After completing edits to a file:
        - Run linting and formatting checks.

## Styling rules
    We use styled components. Make sure you use styled components when applying the styles to components.
    1. Place the styled components in a separate file named `styled.ts` and in the same directory as the component that uses the styles.
    2. Common naming patterns for the styled components include MainWrapper, ContentWrapper and specialized component wrappers.
    3. Reference existing components to understand the styling patterns.
    4. Keep UI designs consistent with existing components.

## When adding useEffect react hook:
    When a new useEffect is added that calls a useCallback function, try to avoid including the callback function in the useEffect's dependency array, if the callback modifies state that the callback itself depends on.
    This creates circular dependencies that break memoization and cause infinite loops.
    This useEffect should only depend on the actual values it needs to react to, not necesarly the callback functions it calls.
    When a new useEffect is added in general, verify if it can lead to an infinite rendering(if the useEffect can directly or indirectly set a state that also appears in the useEffect's dependency array). If so, refactor the useEffect to avoid this infinite rendering.

## When implementing react components:
    1. Try to maintain design consistency with other similar components
    2. Define pure functions outside of react components
    3. Apply react best practices when creating states. Favour grouping semantic related states that only change at the same time, into one complex state.
    4. If there is a lot of logic in a react component, gavour extracting that logic by creating a custom hook file next to the component file.

## When implementing TypeScript:
    1. Use types instead of interfaces for consistency
    2. Define string literal types narrowly(e.g. 'prompt' | 'result') or use enums instead of generic string types to avoid typos.
    3. Maintain type safety and consistency across the codebase.
    4. Check current version of typescript in package.json file and use the latest language features supported by that version.