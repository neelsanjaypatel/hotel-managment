"use client";

import { useEffect, useRef, useState } from "react";

// How far each kind of photo is shrunk. A bill stays just sharp enough to read.
const PRESETS = {
  photo: { side: 480, bytes: 40_000 },
  bill: { side: 1400, bytes: 180_000 },
};

async function shrink(file: File, preset: (typeof PRESETS)[keyof typeof PRESETS]) {
  const bitmap = await createImageBitmap(file);
  let side = preset.side;
  const canvas = document.createElement("canvas");
  for (;;) {
    const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, canvas.width, canvas.height);
    c.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.7, 0.6, 0.5, 0.42]) {
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality));
      if (blob && blob.size <= preset.bytes) {
        bitmap.close();
        return new File([blob], "photo.jpg", { type: "image/jpeg" });
      }
    }
    side = Math.round(side * 0.8);
  }
}

// Camera or gallery. The shrunk photo sits in a hidden file input, so it goes with the form.
export function PhotoField({ name, label, kind, current }: { name: string; label: string; kind: keyof typeof PRESETS; current?: number | null }) {
  const out = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const form = out.current?.form;
    const clear = () => {
      setPreview(null);
      setNote("");
    };
    form?.addEventListener("reset", clear);
    return () => form?.removeEventListener("reset", clear);
  }, []);

  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    setNote("");
    try {
      const small = await shrink(file, PRESETS[kind]);
      const list = new DataTransfer();
      list.items.add(small);
      out.current!.files = list.files;
      setPreview(URL.createObjectURL(small));
      setNote(`${Math.max(1, Math.round(small.size / 1024))} KB`);
    } catch {
      setNote("This photo could not be read. Please try another.");
    }
    setBusy(false);
  }

  const shown = preview ?? (current ? `/files/${current}` : null);
  const button = "btn btn-ghost cursor-pointer";
  return (
    <div>
      <span className="label">{label}</span>
      <input ref={out} type="file" name={name} className="hidden" tabIndex={-1} aria-hidden />
      <div className="flex flex-wrap items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {shown && <a href={shown} target="_blank" rel="noopener"><img src={shown} alt="" className="size-14 rounded-lg border border-line object-cover" /></a>}
        <label className={button}>
          Take photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label className={button}>
          Gallery
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {busy ? <span className="text-sm text-muted">Reducing size...</span> : note && <span className="text-sm text-muted">{note}</span>}
      </div>
    </div>
  );
}
