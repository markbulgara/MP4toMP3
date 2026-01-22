import Link from "next/link";

const navItems = [
  { href: "/", label: "Compendium" },
  { href: "/characters", label: "Characters" },
  { href: "/settings/content-sources", label: "Content Sources" },
  { href: "/settings/import", label: "Import Data" }
];

export const Sidebar = () => {
  return (
    <aside className="hidden w-64 flex-col border-r border-ash-200 bg-white p-6 lg:flex">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-ash-800">AshBeyond</h1>
        <p className="text-sm text-ash-500">Compendium & Character Studio</p>
      </div>
      <nav className="space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-sm font-medium text-ash-700 transition hover:bg-ash-100"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto rounded-lg bg-ash-100 p-4 text-xs text-ash-600">
        Offline-first. Install content packs to unlock rules data.
      </div>
    </aside>
  );
};
