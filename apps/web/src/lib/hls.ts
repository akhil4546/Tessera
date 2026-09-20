import { mediaSrc } from './media';

export async function attachHls(video: HTMLVideoElement, url: string | null | undefined): Promise<() => void> {
  const src = mediaSrc(url);
  if (!src) return () => undefined;

  const native = video.canPlayType('application/vnd.apple.mpegurl');
  if (native) {
    video.src = src;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }

  try {
    const { default: Hls } = await import('hls.js');
    if (!Hls.isSupported()) {
      video.src = src;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }
    const hls = new Hls({ maxBufferLength: 12, enableWorker: true });
    hls.loadSource(src);
    hls.attachMedia(video);
    return () => {
      hls.destroy();
    };
  } catch {
    video.src = src;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }
}
