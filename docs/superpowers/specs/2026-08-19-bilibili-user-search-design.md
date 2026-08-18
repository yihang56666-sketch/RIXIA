# Bilibili User Search Design

## Goal

Complete the Bilibili search workflow so users can search for videos or creators from the same entry point, matching the existing FocuBili account/profile flow.

## Scope

- Add a two-mode search control: `视频` and `用户`.
- Reuse the existing `BilibiliPublicContentService.searchUsers` API and `UserSearchResult` model.
- In user mode, show avatar, name, signature, follower count, certification, and level when available.
- Clicking a user result calls the existing `openBilibiliCreator` store action and routes to `creator-profile`.
- Keep video filters, paging, search history, loading, and error states intact. User mode has its own paging and simple order/type filters.
- Do not introduce a second creator profile implementation or change network behavior.

## Data Flow

The search panel owns the active mode, query, page, result page, and loading/error state. It calls either `searchVideos` or `searchUsers`, then renders the corresponding list. `BilibiliSearchView` adapts the user result's `mid`, `name`, `avatarUrl`, `signature`, and `certification` into the existing `activeBilibiliCreator` shape and delegates navigation to `openBilibiliCreator`.

## Error Handling

Empty queries are ignored by the existing submit behavior. Service errors are rendered in the same inline error region. Broken avatars are hidden without affecting the row. A mode switch clears the previous result list and resets pagination so stale video results cannot be mistaken for user results.

## Testing

- Component test: user mode submits a keyword, renders a user result, and clicking it invokes the creator navigation callback with the expected creator fields.
- Component test: switching back to video mode preserves the existing video callback behavior.
- Existing public-content service tests remain the contract for parsing and request behavior.

