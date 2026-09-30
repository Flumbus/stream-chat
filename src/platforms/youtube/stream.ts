import * as grpc from '@grpc/grpc-js';
import { fromJSON } from '@grpc/proto-loader';
import { parse } from 'protobufjs';
import proto from './stream_list.proto?raw';
import type { YouTubeMessage } from './normalize';
import { PlatformError, apiError } from '../common/errors';
export interface StreamBatch {
  items?: YouTubeMessage[];
  nextPageToken?: string;
  offlineAt?: string;
}
export type YouTubeStream = (
  chatId: string,
  pageToken: string | undefined,
  token: string,
  signal: AbortSignal,
  batch: (data: StreamBatch) => void,
  ready: () => void,
  authentication?: 'oauth' | 'api-key',
) => Promise<void>;
// Google's published sample references Duration without an import. Supply the standard well-known type.
const root = parse(proto).root;
root.define('google.protobuf').addJSON({
  Duration: { fields: { seconds: { type: 'int64', id: 1 }, nanos: { type: 'int32', id: 2 } } },
});
const definition = fromJSON(root.toJSON(), {
  longs: String,
  enums: String,
  defaults: false,
  keepCase: false,
});
const service = definition['youtube.api.v3.V3DataLiveChatMessageService'] as grpc.ServiceDefinition;
export const youtubeStream: YouTubeStream = async (
  chatId,
  pageToken,
  token,
  signal,
  batch,
  ready,
  authentication = 'oauth',
) => {
  if (signal.aborted) return;
  const client = new grpc.Client('youtube.googleapis.com:443', grpc.credentials.createSsl(), {
    'grpc.max_receive_message_length': 4 * 1024 * 1024,
  });
  const method = service.StreamList;
  const metadata = new grpc.Metadata();
  if (authentication === 'api-key') metadata.set('x-goog-api-key', token);
  else metadata.set('authorization', `Bearer ${token}`);
  const stream = client.makeServerStreamRequest(
    method.path,
    method.requestSerialize,
    method.responseDeserialize,
    {
      liveChatId: chatId,
      pageToken,
      part: ['id', 'snippet', 'authorDetails'],
      profileImageSize: 88,
    },
    metadata,
    { deadline: Date.now() + 55 * 60_000 },
  );
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (error?: unknown) => {
      if (done) return;
      done = true;
      signal.removeEventListener('abort', cancel);
      stream.cancel();
      client.close();
      if (error) reject(error);
      else resolve();
    };
    const cancel = () => finish();
    signal.addEventListener('abort', cancel, { once: true });
    stream.on('metadata', ready);
    stream.on('data', (data: StreamBatch) => {
      if (!done && !signal.aborted) {
        try {
          batch(data);
          if (data.offlineAt || data.items?.some((m) => m.snippet.type === 'CHAT_ENDED_EVENT'))
            finish();
        } catch {
          finish(
            new PlatformError(
              'STREAM_DATA_INVALID',
              'YouTube вернул некорректное событие потока.',
              true,
            ),
          );
        }
      }
    });
    stream.on('end', () =>
      finish(
        new PlatformError(
          'STREAM_ENDED',
          'Поток YouTube завершился. Переподключаемся с последнего сообщения.',
          true,
        ),
      ),
    );
    stream.on('error', (e: grpc.ServiceError) => {
      if (signal.aborted) return finish();
      if (e.code === grpc.status.UNAUTHENTICATED) return finish(apiError(401));
      if (e.code === grpc.status.PERMISSION_DENIED) return finish(apiError(403));
      if (e.code === grpc.status.RESOURCE_EXHAUSTED)
        return finish(
          new PlatformError(
            'QUOTA_EXCEEDED',
            'YouTube ограничил квоту потока. Повторите подключение после обновления квоты.',
          ),
        );
      if (e.code === grpc.status.FAILED_PRECONDITION)
        return finish(apiError(400, 'LIVE_CHAT_ENDED'));
      if ([grpc.status.NOT_FOUND, grpc.status.INVALID_ARGUMENT].includes(e.code))
        return finish(
          new PlatformError('CHAT_NOT_FOUND', 'Live Chat недоступен. Выберите другую трансляцию.'),
        );
      finish(
        new PlatformError('STREAM_INTERRUPTED', 'Поток YouTube прерван. Переподключаемся.', true),
      );
    });
  });
};
export { definition as youtubeProtoDefinition };
