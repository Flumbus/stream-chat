`stream_list.proto` is the code sample published by Google at
https://developers.google.com/youtube/v3/live/streaming-live-chat (retrieved 2026-09-27).
Google documentation code samples are licensed under Apache License 2.0:
https://www.apache.org/licenses/LICENSE-2.0
Copyright Google LLC. Source copied without field-number changes.
The published schema references google.protobuf.Duration; stream.ts supplies the standard definition.

YouTube does not promise a realtime deletion event for third-party deletions:
documented tombstones identify previously deleted messages when returned by the API.
StreamChat propagates successful local deletes immediately and applies received tombstones.
