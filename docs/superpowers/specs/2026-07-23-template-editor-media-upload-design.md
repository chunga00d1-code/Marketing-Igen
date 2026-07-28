# Template Editor Media Upload Design

## Goal

Replace temporary browser `blob:` URLs in the template editor with durable Cloudinary media URLs so video projects remain usable after the browser closes or the project is reopened.

## Scope

The feature supports authenticated uploads from the template editor:

- Video: up to 200 MB.
- Image: up to 20 MB.
- Audio: up to 50 MB.
- Files are added to the editor media library only after upload succeeds.
- Uploaded URLs are persisted through the existing project autosave flow.

Rendering, transcoding, template moderation, billing, and media deletion are outside this phase.

## Architecture

The browser requests a short-lived signed Cloudinary upload payload from the backend. The backend validates the requested media type, file size, MIME type, and authenticated identity, then signs a fixed upload folder derived from the company and user identifiers.

The browser uploads the binary file directly to Cloudinary using `XMLHttpRequest` so progress events are available. The Cloudinary API secret never reaches the browser.

The backend does not relay the file bytes. This avoids holding large video files in application-server memory and reduces timeout risk.

## Backend Contract

`POST /api/v1/video-projects/media/sign-upload`

Request:

```json
{
  "fileName": "clip.mp4",
  "mimeType": "video/mp4",
  "fileSize": 10485760,
  "mediaType": "video"
}
```

Response:

```json
{
  "status": "success",
  "data": {
    "cloudName": "cloud",
    "apiKey": "key",
    "signature": "signature",
    "timestamp": 1784780000,
    "folder": "igen_erp/template_editor/<company>/<user>/video",
    "resourceType": "video"
  }
}
```

The backend rejects unsupported MIME types, mismatched media types, excessive file sizes, missing Cloudinary configuration, and unauthenticated requests.

Folder path segments are sanitized and never accepted directly from the client.

## Frontend Flow

1. User selects one or more files.
2. The client validates type and size immediately.
3. For each valid file, the client requests a signed payload.
4. The client uploads directly to Cloudinary and displays percentage progress.
5. On success, the returned `secure_url` becomes the media asset URL and thumbnail source where supported.
6. The asset can then be inserted into or used to replace a timeline item.
7. Existing project autosave persists the durable URL.

Uploads run with bounded concurrency to avoid saturating the browser connection. A failed upload remains visible with an error and retry action but is not inserted into the timeline.

## Error Handling

- Client validation errors explain the allowed type or maximum size.
- Signature failures and Cloudinary failures produce a retryable failed state.
- Successful uploads remain available if another file in the same selection fails.
- Leaving the editor does not save any temporary `blob:` URL.

## Testing

- Backend unit tests cover valid requests, MIME/type mismatch, unsupported MIME types, and size limits.
- Frontend unit tests cover client-side validation and Cloudinary response parsing.
- Typecheck, lint, and production build must pass.

## Security

- Authentication and tenant/user identity are required for signing.
- The backend chooses folders and signed parameters.
- The Cloudinary API secret remains server-only.
- Signed parameters are short-lived and limited to the requested resource type.
