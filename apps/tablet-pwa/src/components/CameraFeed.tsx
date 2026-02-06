/**
 * CameraFeed — renders MJPEG stream from Jetson camera.
 * Blueprint Section 12 — full-screen camera feed as HUD background.
 */

interface CameraFeedProps {
  /** MJPEG stream URL, e.g. http://192.168.4.1:8084/stream */
  streamUrl: string;
  /** Alt text for the image. */
  alt?: string;
  /** Additional CSS classes. */
  className?: string;
}

/**
 * Renders an MJPEG stream using a simple <img> tag.
 * MJPEG over HTTP works natively in all browsers — each frame is a
 * multipart/x-mixed-replace JPEG. No JavaScript processing needed.
 */
export function CameraFeed({ streamUrl, alt = 'Camera feed', className = '' }: CameraFeedProps) {
  return (
    <img
      src={streamUrl}
      alt={alt}
      className={`h-full w-full object-cover ${className}`}
      loading="eager"
    />
  );
}
