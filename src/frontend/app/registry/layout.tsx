import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registry - UPLC Link",
  description: "Search and explore verified Cardano smart contracts. Browse the open-source registry of Aiken contracts with source code verification.",

  alternates: {
    canonical: 'https://uplc.link/registry',
  },

  openGraph: {
    title: 'Registry - UPLC Link',
    description: 'Search and explore verified Cardano smart contracts. Browse the open-source registry of Aiken contracts with source code verification.',
    url: 'https://uplc.link/registry',
  },

  twitter: {
    title: 'Registry - UPLC Link',
    description: 'Search and explore verified Cardano smart contracts.',
  },
};

export default function RegistryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
