import { useResolvedFileUrl } from "@/hooks/use-resolved-file-url";

/** Image that re-signs private admark-files refs before display. */
export function ResolvedFileImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const resolved = useResolvedFileUrl(src);
  return <img src={resolved || src} alt={alt} className={className} />;
}
