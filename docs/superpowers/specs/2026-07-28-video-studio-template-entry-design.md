# Video Studio Template Entry Design

## Goal

Restore the existing video-template library and editor to the current Video Studio interface without bringing back the deleted legacy `VideoGenerationWorkspace`.

## User Experience

- Add a **Mẫu video** card as the first item in the **Tạo video mới** group on the Video Studio home screen.
- Selecting the card navigates to `/video-studio/templates`.
- The templates route displays the existing `VideoTemplateLibrary`.
- Selecting a template opens the existing `TemplateEditorWorkspace` in the same Video Studio page.
- The editor's back action returns to the template library.
- The Video Studio header's back action returns to the Video Studio home screen.

## Architecture

- Extend `VideoStudioTool` and `VIDEO_STUDIO_ROUTES` with a `templates` tool.
- Add the templates tool metadata to `VIDEO_TOOLS` before the other creation tools.
- Lazy-load `VideoTemplateLibrary` and `TemplateEditorWorkspace` from `VideoStudioPage`.
- Keep the selected editor project as local state in `VideoStudioPage`.
- Reuse the project mapping previously used by `VideoGenerationWorkspace`, including project ID, title, aspect ratio, duration, preview URL, and thumbnail URL.
- Do not change template APIs, database models, services, permissions, or Shotstack behavior.

## State and Navigation

- Entering `/video-studio/templates` with no selected project shows the library.
- Choosing a library item stores its editor configuration and shows the editor.
- Returning from the editor clears that configuration and reveals the library.
- Leaving the templates tool clears any selected template editor configuration so a later visit starts at the library.
- Browser history continues to use the existing `VIDEO_STUDIO_ROUTES` navigation mechanism.

## Error and Loading Behavior

- Existing library and editor error handling remains unchanged.
- Lazy-loaded template components use the existing Video Studio loading presentation.
- No new API error state is introduced.

## Verification

- Add navigation tests proving `/video-studio/templates` maps to the `templates` tool and round-trips through launch parameters.
- Add or extend component tests proving the **Mẫu video** card appears first and template selection opens the editor.
- Run the focused tests, then `npm run typecheck` and `npm run build` because routing and lazy imports change.

## Non-Goals

- Redesigning the template library or editor.
- Restoring the legacy tabbed `VideoGenerationWorkspace`.
- Changing template persistence, rendering, synchronization, or backend behavior.
- Adding template search integration to the global Video Studio search field.
