export function TrinityHeader({
  productName,
  tagline,
}: {
  productName: string;
  tagline: string;
}) {
  return (
    <header className="flex items-start justify-between px-[48px] pt-[48px]">
      <div>
        <h1 className="font-brand text-[88px] font-extrabold leading-none tracking-[-0.02em] lowercase text-[#1a1a1a]">
          {productName}
        </h1>
        <p className="mt-2 text-[15px] lowercase text-[#3a3a3a]">{tagline}</p>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/trinity-tile-logo.svg"
        alt="trinity tile"
        className="h-auto w-[110px] object-contain"
      />
    </header>
  );
}
