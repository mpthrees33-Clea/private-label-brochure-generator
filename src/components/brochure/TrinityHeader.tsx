export function TrinityHeader({
  productName,
  tagline,
}: {
  productName: string;
  tagline: string;
}) {
  return (
    <header className="flex items-start justify-between px-[48px] pt-[32px]">
      <div>
        <h1 className="font-brand text-[64px] font-normal leading-none tracking-[-0.02em] lowercase text-brochure-gray">
          {productName}
        </h1>
        <p className="mt-1 text-[13px] lowercase text-brochure-gray">{tagline}</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/trinity-tile-logo.png"
        alt="trinity tile"
        className="h-auto w-[120px] object-contain"
      />
    </header>
  );
}
