export type Factory = {
  display: string;
  domains: string[];
};

export const FACTORIES: Factory[] = [
  { display: "Ragno", domains: ["ragnousa.com"] },
  { display: "Atlas Concorde Italy", domains: ["atlasconcorde.com"] },
  { display: "Florida Tile", domains: ["floridatile.com"] },
  { display: "Panaria", domains: ["panaria.us", "panaria.it"] },
  { display: "Stonepeak Ceramics", domains: ["stonepeakceramics.com"] },
  { display: "Milestone", domains: ["milestonetiles.com"] },
  { display: "Portobello", domains: ["portobelloamerica.com", "portobello.com.br"] },
  { display: "MIR Mosaic", domains: ["mirmosaic.com"] },
  { display: "Del Conca USA", domains: ["delconcausa.com"] },
  { display: "Del Conca Italy", domains: ["delconca.com", "delconca.it"] },
  { display: "Refin", domains: ["refin-ceramic-tiles.com", "refin.it"] },
  { display: "Supergres", domains: ["supergres.com"] },
  { display: "Caesar USA", domains: ["caesarusa.com"] },
  { display: "Caesar Italy", domains: ["caesar.it"] },
  { display: "WOW Designs", domains: ["wowdesigneu.com", "wow.design"] },
];

export function factoryFromUrl(url: string): Factory | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return (
      FACTORIES.find((f) =>
        f.domains.some((d) => host === d || host.endsWith("." + d)),
      ) ?? null
    );
  } catch {
    return null;
  }
}
