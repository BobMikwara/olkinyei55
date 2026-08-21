import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Edit3, Copy, Archive, Search, Package, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { store, useStore } from "../store";
import { Button, Card, Input, Textarea, Select, Badge, Modal, ConfirmDialog, PageHeader, EmptyState, Tabs } from "../ui";
import type { SafariPackage } from "../types";

function PackageCard({ pkg, onEdit, onDuplicate, onDelete, onTogglePublish }: {
  pkg: SafariPackage;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTogglePublish: () => void;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="group">
      <Card hoverable className="flex h-full flex-col overflow-hidden !p-0">
        <div className="relative aspect-[16/10] overflow-hidden bg-[var(--admin-surface-2)]">
          <img src={pkg.image} alt={pkg.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute left-3 top-3 flex gap-1.5">
            {pkg.featured && <Badge variant="accent" dot>Featured</Badge>}
            <Badge variant={pkg.published ? "success" : "neutral"} dot>{pkg.published ? "Live" : "Draft"}</Badge>
          </div>
          <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button onClick={onEdit} className="flex h-8 w-8 items-center justify-center rounded-md bg-black/40 text-white backdrop-blur-sm hover:bg-black/60" aria-label="Edit"><Edit3 size={13} /></button>
            <button onClick={onDuplicate} className="flex h-8 w-8 items-center justify-center rounded-md bg-black/40 text-white backdrop-blur-sm hover:bg-black/60" aria-label="Duplicate"><Copy size={13} /></button>
            <button onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-md bg-black/40 text-red-300 backdrop-blur-sm hover:bg-red-500/60 hover:text-white" aria-label="Archive"><Archive size={13} /></button>
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="font-serif text-xl font-light text-white">{pkg.title}</h3>
            <p className="mt-0.5 text-[11px] text-white/80">{pkg.region}</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-[var(--admin-fg-muted)]">{pkg.summary}</p>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--admin-border)] pt-3">
            <div className="flex gap-3 text-[11px] text-[var(--admin-fg-muted)]">
              <span>{pkg.duration}</span>
              <span>·</span>
              <span className="font-medium text-[var(--admin-accent)]">${pkg.price.toLocaleString()}</span>
            </div>
            <button onClick={onTogglePublish} className={`text-[11px] font-medium transition-colors ${pkg.published ? "text-emerald-400 hover:text-emerald-300" : "text-[var(--admin-fg-muted)] hover:text-[var(--admin-fg)]"}`}>
              {pkg.published ? "Unpublish" : "Publish"}
            </button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function ListEditor({ label, value, onChange }: { label: string; value: string[]; onChange: (items: string[]) => void }) {
  const updateItem = (index: number, newValue: string) => {
    const trimmed = newValue.trim();
    if (!trimmed) {
      onChange(value.filter((_, i) => i !== index));
    } else {
      const next = [...value];
      next[index] = trimmed;
      onChange(next);
    }
  };
  const deleteItem = (index: number) => onChange(value.filter((_, i) => i !== index));
  const moveItem = (index: number, direction: -1 | 1) => {
    const next = [...value];
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= next.length) return;
    [next[index], next[newIndex]] = [next[newIndex], next[index]];
    onChange(next);
  };
  return (
    <div>
      <h4 className="mb-3 font-serif text-lg font-light text-[var(--admin-fg)]">{label}</h4>
      <div className="space-y-2">
        {value.map((item, index) => (
          <div key={index} className="flex gap-2 items-start">
            <Input
              value={item}
              onChange={(e) => updateItem(index, e.target.value)}
              placeholder="Enter item..."
              className="flex-1"
            />
            <Button variant="outline" size="sm" onClick={() => deleteItem(index)} aria-label="Delete item" icon={Trash2} />
            <Button variant="outline" size="sm" onClick={() => moveItem(index, -1)} disabled={index === 0} aria-label="Move up" icon={ArrowUp} />
            <Button variant="outline" size="sm" onClick={() => moveItem(index, 1)} disabled={index === value.length - 1} aria-label="Move down" icon={ArrowDown} />
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" onClick={() => onChange([...value, ""])} icon={Plus} className="mt-2">Add item</Button>
    </div>
  );
}

function PackageEditor({ pkg, onClose }: { pkg: SafariPackage | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<SafariPackage>>(pkg ?? {
    title: "",
    region: "",
    duration: "",
    nights: 0,
    price: 0,
    image: "",
    gallery: [],
    summary: "",
    description: "",
    signature: "",
    highlights: [],
    included: [],
    excluded: [],
    availability: [],
    country: [],
    parks: [],
    wildlife: [],
    difficulty: "Moderate",
    tags: [],
    featured: false,
    published: false,
    seo: { title: "", description: "" },
    coordinates: [0, 0],
  });

  const update = <K extends keyof SafariPackage>(key: K, value: SafariPackage[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    if (!form.title || !form.region) {
      store.notify({ type: "error", title: "Missing required fields", message: "Title and region are required." });
      return;
    }
    // The database stores price in a `price_usd integer check (price_usd > 0)`
    // column, so reject zero/negative here with a clear message instead of
    // letting the upsert fail with an obscure constraint error.
    if (!form.price || Number.isNaN(Number(form.price)) || Number(form.price) <= 0) {
      store.notify({ type: "error", title: "Invalid price", message: "Price must be a positive number (USD)." });
      return;
    }
    const includedRaw = (form.included ?? []).map((i) => String(i));
    const excludedRaw = (form.excluded ?? []).map((i) => String(i));
    const allRaw = [...includedRaw, ...excludedRaw];
    const maxLength = 200;
    const hasEmpty = allRaw.some((item) => item.trim() === "");
    const tooLong = allRaw.find((item) => item.trim().length > maxLength);
    if (hasEmpty) {
      store.notify({ type: "error", title: "Invalid list item", message: "Each item must be a non-empty string." });
      return;
    }
    if (tooLong !== undefined) {
      store.notify({ type: "error", title: "Invalid list item", message: `Each item must have a maximum length of ${maxLength} characters.` });
      return;
    }
    const includedItems = includedRaw.map((i) => i.trim()).filter(Boolean);
    const excludedItems = excludedRaw.map((i) => i.trim()).filter(Boolean);
    // Only close when the change actually persisted. The store surfaces its own
    // error toast and reverts any optimistic update on failure, so we keep the
    // editor open (with the entered values intact) for the admin to retry.
    let ok = false;
    if (pkg) {
      ok = await store.actions.updatePackage(pkg.id, { ...form, included: includedItems, excluded: excludedItems });
    } else {
      ok = (await store.actions.createPackage({ ...form, included: includedItems, excluded: excludedItems } as Omit<SafariPackage, "id" | "createdAt" | "updatedAt" | "slug">)) !== null;
    }
    if (ok) onClose();
  };

  return (
    <Modal open onClose={onClose} size="xl" title={pkg ? `Edit ${pkg.title}` : "New Safari Package"} footer={<>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      <Button onClick={save} icon={pkg ? undefined : Plus}>{pkg ? "Save changes" : "Create package"}</Button>
    </>}>
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Title *</span><Input value={form.title} onChange={(e) => update("title", e.target.value)} placeholder="The Great Migration" /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Region *</span><Input value={form.region} onChange={(e) => update("region", e.target.value)} placeholder="Serengeti + Maasai Mara" /></label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Duration</span><Input value={form.duration} onChange={(e) => update("duration", e.target.value)} placeholder="9 days / 8 nights" /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Price (USD)</span><Input type="number" value={form.price} onChange={(e) => update("price", Number(e.target.value))} placeholder="8450" /></label>
          <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Difficulty</span><Select value={form.difficulty} onChange={(e) => update("difficulty", e.target.value as SafariPackage["difficulty"])}><option>Gentle</option><option>Moderate</option><option>Active</option><option>Expedition</option></Select></label>
        </div>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Hero Image URL</span><Input value={form.image} onChange={(e) => update("image", e.target.value)} placeholder="https://..." /></label>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Summary</span><Textarea rows={3} value={form.summary} onChange={(e) => update("summary", e.target.value)} placeholder="Brief description for cards and listings..." /></label>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Full Description</span><Textarea rows={6} value={form.description} onChange={(e) => update("description", e.target.value)} placeholder="Detailed description..." /></label>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Signature moments</span><Input value={form.signature} onChange={(e) => update("signature", e.target.value)} placeholder="River crossings, predator country..." /></label>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Gallery image URLs <small className="normal-case tracking-normal">(one per line)</small></span><Textarea rows={3} value={(form.gallery ?? []).join("\n")} onChange={(e) => update("gallery", e.target.value.split("\n").map((item) => item.trim()).filter(Boolean))} placeholder="https://..." /></label>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="block"><ListEditor label="Included" value={form.included ?? []} onChange={(items) => update("included", items)} /></div>
          <div className="block"><ListEditor label="Not included" value={form.excluded ?? []} onChange={(items) => update("excluded", items)} /></div>
        </div>

        <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Availability months</span><Input value={(form.availability ?? []).join(", ")} onChange={(e) => update("availability", e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} placeholder="Jun, Jul, Aug, Sep, Oct" /></label>

        <div className="border-t border-[var(--admin-border)] pt-6">
          <h3 className="mb-4 font-serif text-xl font-light">Publishing</h3>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[var(--admin-accent)]" checked={form.published} onChange={(e) => update("published", e.target.checked)} />Published</label>
            <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" className="accent-[var(--admin-accent)]" checked={form.featured} onChange={(e) => update("featured", e.target.checked)} />Featured on homepage</label>
          </div>
        </div>

        <div className="border-t border-[var(--admin-border)] pt-6">
          <h3 className="mb-4 font-serif text-xl font-light">SEO</h3>
          <div className="space-y-4">
            <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">SEO Title</span><Input value={form.seo?.title} onChange={(e) => update("seo", { ...form.seo!, title: e.target.value })} /></label>
            <label className="block"><span className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-[var(--admin-fg-muted)]">Meta Description</span><Textarea rows={2} value={form.seo?.description} onChange={(e) => update("seo", { ...form.seo!, description: e.target.value })} /></label>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function PackagesManager() {
  const packages = useStore((state) => state.packages);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft" | "archived">("all");
  const [editing, setEditing] = useState<SafariPackage | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleting, setDeleting] = useState<SafariPackage | null>(null);

  const filtered = packages.filter((pkg) => {
    if (filter === "published" && !pkg.published) return false;
    if (filter === "draft" && pkg.published) return false;
    if (filter === "archived" && !pkg.archived) return false;
    if (filter === "all" && pkg.archived) return false;
    if (search && !pkg.title.toLowerCase().includes(search.toLowerCase()) && !pkg.region.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <PageHeader eyebrow="Content management" title="Safari Packages" description="Create, edit, and publish safari experiences to the public website." actions={<Button icon={Plus} onClick={() => setShowNew(true)}>New Package</Button>} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]"><Input icon={Search} placeholder="Search packages..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <Tabs tabs={[{ id: "all", label: "All", count: packages.filter((p) => !p.archived).length }, { id: "published", label: "Published", count: packages.filter((p) => p.published && !p.archived).length }, { id: "draft", label: "Drafts", count: packages.filter((p) => !p.published && !p.archived).length }, { id: "archived", label: "Archived", count: packages.filter((p) => p.archived).length }]} value={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Package} title="No packages found" description={search ? "Try a different search term." : "Create your first safari package to get started."} action={<Button icon={Plus} onClick={() => setShowNew(true)}>New Package</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence>
            {filtered.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} onEdit={() => setEditing(pkg)} onDuplicate={() => store.actions.duplicatePackage(pkg.id)} onDelete={() => setDeleting(pkg)} onTogglePublish={() => store.actions.updatePackage(pkg.id, { published: !pkg.published })} />)}
          </AnimatePresence>
        </div>
      )}

      {editing && <PackageEditor pkg={editing} onClose={() => setEditing(null)} />}
      {showNew && <PackageEditor pkg={null} onClose={() => setShowNew(false)} />}
      {deleting && <ConfirmDialog open onClose={() => setDeleting(null)} onConfirm={() => store.actions.deletePackage(deleting.id)} title={`Archive ${deleting.title}?`} description="This package will be hidden from the public website but can be restored later." confirmLabel="Archive" />}
    </motion.div>
  );
}
